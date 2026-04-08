"use client";

import CustomDropdown from "@/app/components/CustomDropdown";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  genDocNumber,
  getStore,
  IntegerInput,
  setStore,
  thStyle,
} from "../utils";

// ── Storage Keys ───────────────────────────────────────────────────────────────
const MATERIALS_KEY = "pmp_materials";
const VENDORS_KEY = "pmp_vendors";
const STOCK_IN_KEY = "pmp_stock_in_log";

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
function AddVendorQuickModal({ isOpen, onClose, onAdd, existingVendors }) {
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
        categories: [],
      });
  }, [isOpen]);

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
  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 1100 }}>
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: "520px", width: "90%" }}
      >
        <div className="modal-header">
          <h2 className="modal-title">Add New Vendor</h2>
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
          className="modal-body"
          style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
        >
          <div className="form-group">
            <label className="form-label">
              Vendor Name <span className="required">*</span>
            </label>
            <input
              type="text"
              className="form-input"
              value={form.name}
              onChange={(e) =>
                setForm((p) => ({ ...p, name: e.target.value.slice(0, 80) }))
              }
              placeholder="e.g., SanRoque Trading"
              autoFocus
              maxLength={80}
            />
          </div>
          <div className="form-group">
            <label className="form-label">
              Contact Person <span className="required">*</span>
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
            />
          </div>
          <div className="form-group">
            <label className="form-label">Email</label>
            <input
              type="email"
              className="form-input"
              value={form.email}
              onChange={(e) =>
                setForm((p) => ({ ...p, email: e.target.value.slice(0, 100) }))
              }
              placeholder="e.g., vendor@email.com"
              maxLength={100}
            />
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "1rem",
            }}
          >
            <div className="form-group">
              <label className="form-label">Phone</label>
              <input
                type="text"
                className="form-input"
                value={form.phone}
                onChange={handlePhoneChange}
                placeholder="09xx-xxx-xxxx"
                maxLength={15}
                inputMode="tel"
              />
            </div>
            <div className="form-group">
              <label className="form-label">Address</label>
              <input
                type="text"
                className="form-input"
                value={form.address}
                onChange={(e) =>
                  setForm((p) => ({
                    ...p,
                    address: e.target.value.slice(0, 100),
                  }))
                }
                placeholder="e.g., Marikina City"
                maxLength={100}
              />
            </div>
          </div>
        </div>
        <div className="modal-actions">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn-primary" onClick={handleSubmit}>
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
                label: "Damaged",
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
                      gridTemplateColumns: "1fr 1fr 1fr",
                      gap: "0.5rem",
                      fontSize: "0.7rem",
                    }}
                  >
                    {[
                      ["Batch ID", entry.batchId, "#D4A843", "monospace"],
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
  const [materials, setMaterials] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [stockInLog, setStockInLog] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const [infoModal, setInfoModal] = useState(null);
  const [showAddVendor, setShowAddVendor] = useState(false);
  const [activeTab, setActiveTab] = useState("history");

  // Confirm modal
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [pendingEntries, setPendingEntries] = useState([]);
  const [pendingGood, setPendingGood] = useState(0);
  const [pendingDamaged, setPendingDamaged] = useState(0);

  // Wizard
  const [wizardOpen, setWizardOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [search, setSearch] = useState("");
  const [selectedMaterials, setSelectedMaterials] = useState([]);
  const [expandedCategories, setExpandedCategories] = useState(new Set());
  const [stockRowsByMaterial, setStockRowsByMaterial] = useState({});
  const [applyAllCostByMaterial, setApplyAllCostByMaterial] = useState({});
  const [invoice, setInvoice] = useState({
    vendorId: "",
    vendorName: "",
    invoiceNumber: "",
    deliveryDate: new Date().toISOString().split("T")[0],
    notes: "",
    receiptImage: null,
  });
  const [materialCostMode, setMaterialCostMode] = useState({});
  const [materialTotalAmounts, setMaterialTotalAmounts] = useState({});

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
  const reportRef = useRef(null);

  useEffect(() => {
    setMaterials(getStore(MATERIALS_KEY));
    setVendors(getStore(VENDORS_KEY));
    setStockInLog(getStore(STOCK_IN_KEY));
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const refreshData = () => {
    setMaterials(getStore(MATERIALS_KEY));
    setVendors(getStore(VENDORS_KEY));
    setStockInLog(getStore(STOCK_IN_KEY));
  };

  const selectableMaterials = useMemo(
    () => materials.filter((m) => !m.parentId),
    [materials],
  );

  const generateRows = (material) => {
    if (!material.hasVariants) {
      return [
        {
          materialId: material.id,
          variantLabel: material.name,
          sku: material.sku || "",
          uom: material.uom || "pcs",
          category: material.category || "",
          qty: "",
          damaged: "",
          unitCost:
            material.baseCost != null && material.baseCost > 0
              ? String(material.baseCost)
              : "",
          minStockLevel: String(material.minStock || 10),
        },
      ];
    }
    const children = materials.filter((m) => m.parentId === material.id);
    if (children.length === 0) {
      return [
        {
          materialId: material.id,
          variantLabel: material.name + " (Parent)",
          sku: material.sku || "",
          uom: material.uom || "pcs",
          category: material.category || "",
          qty: "",
          damaged: "",
          unitCost:
            material.baseCost != null && material.baseCost > 0
              ? String(material.baseCost)
              : "",
          minStockLevel: "10",
        },
      ];
    }
    return children.map((c) => ({
      materialId: c.id,
      variantLabel: c.name,
      sku: c.sku || "",
      uom: c.uom || material.uom || "pcs",
      category: c.category || material.category || "",
      qty: "",
      damaged: "",
      unitCost:
        c.baseCost != null && c.baseCost > 0
          ? String(c.baseCost)
          : material.baseCost != null && material.baseCost > 0
            ? String(material.baseCost)
            : "",
      minStockLevel: String(c.minStock || material.minStock || 10),
    }));
  };

  const toggleMaterial = (material) => {
    const exists = selectedMaterials.find((m) => m.id === material.id);
    if (exists) {
      setSelectedMaterials((prev) => prev.filter((m) => m.id !== material.id));
      setStockRowsByMaterial((prev) => {
        const n = { ...prev };
        delete n[material.id];
        return n;
      });
    } else {
      setSelectedMaterials((prev) => [...prev, material]);
      setStockRowsByMaterial((prev) => ({
        ...prev,
        [material.id]: generateRows(material),
      }));
    }
  };

  const updateStockRow = (materialId, rowIndex, field, value) => {
    setStockRowsByMaterial((prev) => {
      const rows = [...(prev[materialId] || [])];
      rows[rowIndex] = { ...rows[rowIndex], [field]: value };
      return { ...prev, [materialId]: rows };
    });
  };

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
      groups[cat].materials.push(m);
    });
    return Object.values(groups);
  }, [filteredMaterials]);

  const toggleCategory = (catName) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      next.has(catName) ? next.delete(catName) : next.add(catName);
      return next;
    });
  };

  const allRows = Object.values(stockRowsByMaterial).flat().filter(Boolean);
  const totalReceived = allRows.reduce((s, r) => s + (parseInt(r.qty) || 0), 0);
  const totalDamaged = allRows.reduce(
    (s, r) => s + (parseInt(r.damaged) || 0),
    0,
  );
  const totalGood = totalReceived - totalDamaged;

  const categoriesWithQty = useMemo(
    () =>
      selectedMaterials
        .filter((m) =>
          (stockRowsByMaterial[m.id] || []).some(
            (r) => (parseInt(r.qty) || 0) > 0,
          ),
        )
        .map((m) => m.category)
        .filter(Boolean),
    [selectedMaterials, stockRowsByMaterial],
  );

  const totalInvoiceValue = useMemo(
    () =>
      selectedMaterials.reduce((sum, mat) => {
        const rows = (stockRowsByMaterial[mat.id] || []).filter(
          (r) => (parseInt(r.qty) || 0) > 0,
        );
        if (rows.length === 0) return sum;
        const mode = materialCostMode[mat.id] || "unit";
        const totalAmt = materialTotalAmounts[mat.id] || "";
        if (mode === "total" && totalAmt)
          return sum + (parseFloat(totalAmt.replace(/,/g, "")) || 0);
        return (
          sum +
          rows.reduce(
            (s, r) =>
              s + (parseInt(r.qty) || 0) * (parseFloat(r.unitCost) || 0),
            0,
          )
        );
      }, 0),
    [
      selectedMaterials,
      stockRowsByMaterial,
      materialCostMode,
      materialTotalAmounts,
    ],
  );

  // Effective & damaged value for footer breakdown
  const effectiveValue = useMemo(
    () =>
      selectedMaterials.reduce((sum, mat) => {
        const rows = (stockRowsByMaterial[mat.id] || []).filter(
          (r) => (parseInt(r.qty) || 0) > 0,
        );
        if (rows.length === 0) return sum;
        const mode = materialCostMode[mat.id] || "unit";
        const totalAmt = materialTotalAmounts[mat.id] || "";
        let computedUnit = 0;
        if (mode === "total" && totalAmt) {
          const totalQty = rows.reduce((s, r) => s + (parseInt(r.qty) || 0), 0);
          computedUnit =
            totalQty > 0
              ? (parseFloat(totalAmt.replace(/,/g, "")) || 0) / totalQty
              : 0;
        }
        return (
          sum +
          rows.reduce((s, r) => {
            const good = Math.max(
              0,
              (parseInt(r.qty) || 0) - (parseInt(r.damaged) || 0),
            );
            const cost =
              mode === "total" ? computedUnit : parseFloat(r.unitCost) || 0;
            return s + good * cost;
          }, 0)
        );
      }, 0),
    [
      selectedMaterials,
      stockRowsByMaterial,
      materialCostMode,
      materialTotalAmounts,
    ],
  );

  const damagedBreakdown = useMemo(() => {
    if (totalDamaged <= 0) return "";
    const parts = selectedMaterials.flatMap((mat) =>
      (stockRowsByMaterial[mat.id] || [])
        .filter((r) => (parseInt(r.damaged) || 0) > 0)
        .map((r) => {
          const d = parseInt(r.damaged) || 0;
          const c = parseFloat(r.unitCost) || 0;
          return `${d}×${formatPrice(c)}=${formatPrice(d * c)}`;
        }),
    );
    return parts.join("  ");
  }, [selectedMaterials, stockRowsByMaterial, totalDamaged]);

  const step1Valid = selectedMaterials.length > 0;
  const step2Valid = () =>
    selectedMaterials.some((m) =>
      (stockRowsByMaterial[m.id] || []).some((r) => (parseInt(r.qty) || 0) > 0),
    );
  const step3Valid = () => {
    const hasInvoice = invoice.invoiceNumber.trim() && invoice.deliveryDate;
    if (!hasInvoice) return false;
    return selectedMaterials.every((mat) => {
      const rows = (stockRowsByMaterial[mat.id] || []).filter(
        (r) => (parseInt(r.qty) || 0) > 0,
      );
      if (rows.length === 0) return true;
      const mode = materialCostMode[mat.id] || "unit";
      const totalAmt = materialTotalAmounts[mat.id] || "";
      if (mode === "total")
        return (parseFloat(totalAmt.replace(/,/g, "")) || 0) > 0;
      return rows.some((r) => (parseFloat(r.unitCost) || 0) > 0);
    });
  };

  const resetWizardState = () => {
    setStep(1);
    setSelectedMaterials([]);
    setStockRowsByMaterial({});
    setApplyAllCostByMaterial({});
    setSearch("");
    setExpandedCategories(new Set());
    setInvoice({
      vendorId: "",
      vendorName: "",
      invoiceNumber: "",
      deliveryDate: new Date().toISOString().split("T")[0],
      notes: "",
      receiptImage: null,
    });
    setMaterialCostMode({});
    setMaterialTotalAmounts({});
  };
  const openWizard = () => {
    resetWizardState();
    setWizardOpen(true);
  };
  const closeWizard = () => {
    setWizardOpen(false);
    resetWizardState();
  };

  const handleBackToStep2 = () => {
    setStep(2);
    setInvoice({
      vendorId: "",
      vendorName: "",
      invoiceNumber: "",
      deliveryDate: new Date().toISOString().split("T")[0],
      notes: "",
      receiptImage: null,
    });
    setMaterialCostMode({});
    setMaterialTotalAmounts({});
  };
  const handleBackToStep1 = () => {
    setStep(1);
    setStockRowsByMaterial({});
    setApplyAllCostByMaterial({});
    setInvoice({
      vendorId: "",
      vendorName: "",
      invoiceNumber: "",
      deliveryDate: new Date().toISOString().split("T")[0],
      notes: "",
      receiptImage: null,
    });
    setMaterialCostMode({});
    setMaterialTotalAmounts({});
  };
  const handleGoToStep2 = () => {
    if (
      selectedMaterials.length > 0 &&
      Object.keys(stockRowsByMaterial).length === 0
    ) {
      const nr = {};
      selectedMaterials.forEach((m) => {
        nr[m.id] = generateRows(m);
      });
      setStockRowsByMaterial(nr);
    }
    setStep(2);
  };
  const handleDiscard = () => {
    setInfoModal({
      title: "Discard Changes?",
      message: "All entered data will be lost. Are you sure?",
      onConfirm: () => {
        closeWizard();
        setInfoModal(null);
      },
    });
  };

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
        message: "Enter received quantity for at least one variant.",
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

    const allMats = getStore(MATERIALS_KEY);
    const siLog = getStore(STOCK_IN_KEY);
    const entries = [];
    let totalGoodAll = 0,
      totalDamagedAll = 0;

    selectedMaterials.forEach((mat) => {
      const rows = (stockRowsByMaterial[mat.id] || []).filter(
        (r) => (parseInt(r.qty) || 0) > 0,
      );
      if (rows.length === 0) return;
      const mode = materialCostMode[mat.id] || "unit";
      const totalAmt = materialTotalAmounts[mat.id] || "";
      const totalQty = rows.reduce((s, r) => s + (parseInt(r.qty) || 0), 0);
      const computedUnitCost =
        mode === "total" && totalAmt
          ? (parseFloat(totalAmt.replace(/,/g, "")) || 0) / (totalQty || 1)
          : 0;
      const d = new Date(invoice.deliveryDate);
      const dateStr = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
      const timestamp = Date.now().toString(36).slice(-4).toUpperCase();
      const seq = Math.floor(Math.random() * 1000)
        .toString()
        .padStart(3, "0");
      const batchId = `${dateStr}-${timestamp}-${seq}`;

      rows.forEach((r) => {
        const received = parseInt(r.qty) || 0;
        const damaged = parseInt(r.damaged) || 0;
        const good = received - damaged;
        totalGoodAll += good;
        totalDamagedAll += damaged;
        const unitCost =
          mode === "total" ? computedUnitCost : parseFloat(r.unitCost) || 0;
        const matIdx = allMats.findIndex((m) => m.id === r.materialId);
        if (matIdx !== -1) {
          const matData = allMats[matIdx];
          if (!matData.batches) matData.batches = [];
          matData.batches.push({
            batchId,
            materialId: r.materialId,
            materialName: r.variantLabel,
            sku: r.sku || "",
            uom: r.uom || "pcs",
            vendorId: invoice.vendorId || null,
            vendorName: invoice.vendorName || "General Merchandise",
            qtyGood: good,
            qtyDamaged: damaged,
            remainingQty: good,
            unitCost,
            dateReceived: invoice.deliveryDate + "T00:00:00.000Z",
            invoiceNumber: invoice.invoiceNumber.trim(),
            notes: invoice.notes.trim(),
            receiptImage: invoice.receiptImage || null,
            createdAt: new Date().toISOString(),
          });
          const oldBatches = matData.batches.filter(
            (b) => b.batchId !== batchId,
          );
          const oldGoodQty = oldBatches.reduce(
            (s, b) => s + (b.remainingQty || b.qtyGood || 0),
            0,
          );
          const oldTotal = oldBatches.reduce(
            (s, b) =>
              s + (b.remainingQty || b.qtyGood || 0) * (b.unitCost || 0),
            0,
          );
          const newTotalQty = oldGoodQty + good;
          if (newTotalQty > 0)
            matData.baseCost = (oldTotal + good * unitCost) / newTotalQty;
          matData.stockQty = (matData.stockQty || 0) + good;
          matData.updatedAt = new Date().toISOString();
        }
        entries.push({
          id: genDocNumber("SI"),
          materialId: r.materialId,
          materialName: r.variantLabel,
          sku: r.sku || "",
          category: r.category || "",
          uom: r.uom || "pcs",
          vendorId: invoice.vendorId || null,
          vendorName: invoice.vendorName || "General Merchandise",
          receivedQty: received,
          goodQty: good,
          damagedQty: damaged,
          unitCost,
          totalCost: received * unitCost,
          invoiceNo: invoice.invoiceNumber.trim(),
          deliveryDate: invoice.deliveryDate,
          notes: invoice.notes.trim(),
          receiptImage: invoice.receiptImage || null,
          dateReceived: invoice.deliveryDate + "T00:00:00.000Z",
          dateAdded: new Date().toISOString(),
          batchId,
        });
      });
    });

    setStore(MATERIALS_KEY, allMats);
    siLog.push(...entries);
    setStore(STOCK_IN_KEY, siLog);

    if (invoice.vendorId && categoriesWithQty.length > 0) {
      const allVendors = getStore(VENDORS_KEY);
      const vIdx = allVendors.findIndex((v) => v.id === invoice.vendorId);
      if (vIdx !== -1) {
        const v = allVendors[vIdx];
        const items = v.itemsSupplied || v.categories || [];
        const missing = categoriesWithQty.filter((cat) => !items.includes(cat));
        if (missing.length > 0) {
          allVendors[vIdx].itemsSupplied = [...new Set([...items, ...missing])];
          setStore(VENDORS_KEY, allVendors);
        }
      }
    }

    refreshData();
    closeWizard();
    setPendingEntries(entries);
    setPendingGood(totalGoodAll);
    setPendingDamaged(totalDamagedAll);
    setShowConfirmModal(true);
  };

  const handleConfirmSave = () => setShowConfirmModal(false);

  // Reports
  const generateReport = () => {
    const log = getStore(STOCK_IN_KEY);
    let filtered = [...log];
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

  // CSV Export for Stock In Reports
  const handleExportCSV = () => {
    if (!reportGenerated || !reportData.length) return;
    const headers = [
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
    ];
    const rows = reportData.map((e) => [
      new Date(e.dateAdded || e.dateReceived).toLocaleDateString("en-PH"),
      e.materialName,
      e.sku || "",
      e.vendorName || "General Merchandise",
      e.invoiceNo || "",
      e.deliveryDate
        ? new Date(e.deliveryDate).toLocaleDateString("en-PH")
        : "",
      e.goodQty || e.receivedQty || 0,
      e.damagedQty || 0,
      (e.unitCost || 0).toFixed(2),
      (e.totalCost || 0).toFixed(2),
    ]);
    const csvContent = [headers, ...rows]
      .map((r) => r.map((c) => `"${c}"`).join(","))
      .join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `stock-in-report-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
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
                  onClick={handleExportCSV}
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

      {/* ═══════════════════════════════════════════════════════════
          WIZARD MODAL — AddInventoryItemModal Design Applied
      ═══════════════════════════════════════════════════════════ */}
      {wizardOpen && (
        <div className="modal-overlay" onClick={handleDiscard}>
          <div
            className="modal-content"
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: "1100px",
              width: "95%",
              maxHeight: "92vh",
              display: "flex",
              flexDirection: "column",
              padding: 0,
              background: "#0E0E0E",
              border: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            {/* ── Wizard Header ── */}
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
                    Inventory Management
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
                  onClick={handleDiscard}
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

              {/* Step Indicator */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  position: "relative",
                  paddingLeft: "2rem",
                  paddingRight: "2rem",
                }}
              >
                {/* Track — bg */}
                {[
                  [16.67, 33.33],
                  [50, 33.33],
                  [83.33, 33.33],
                ].map(([l, w], i) => (
                  <div
                    key={i}
                    style={{
                      position: "absolute",
                      top: "14px",
                      left: `calc(${l}%)`,
                      width: `calc(${w}%)`,
                      height: "2px",
                      background: "rgba(255,255,255,0.08)",
                      zIndex: 0,
                      borderRadius: "2px",
                      transform: "translateX(-50%)",
                    }}
                  />
                ))}
                {/* Track — filled */}
                {[
                  [16.67, step1Valid],
                  [50, step2Valid()],
                  [83.33, step3Valid()],
                ].map(([l, filled], i) => (
                  <div
                    key={i}
                    style={{
                      position: "absolute",
                      top: "14px",
                      left: `calc(${l}%)`,
                      width: filled ? "calc(33.33%)" : "0%",
                      height: "2px",
                      background:
                        "linear-gradient(135deg,#FFDF9F 0%,#D4A843 100%)",
                      zIndex: 1,
                      borderRadius: "2px",
                      transition: "width 0.4s cubic-bezier(0.4,0,0.2,1)",
                      boxShadow: filled
                        ? "0 0 12px rgba(212,168,67,0.4)"
                        : "none",
                      transform: "translateX(-50%)",
                    }}
                  />
                ))}
                {[
                  { num: 1, label: "Materials" },
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
                            ? "linear-gradient(135deg,#FFDF9F 0%,#D4A843 100%)"
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

            {/* ── Wizard Body ── */}
            <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
              {/* ═══ STEP 1: Select Materials ═══ */}
              {step === 1 && (
                <div style={{ display: "flex", justifyContent: "center" }}>
                  <div
                    style={{
                      width: "100%",
                      maxWidth: "460px",
                      padding: "1.5rem 2rem",
                    }}
                  >
                    {/* Search */}
                    <div style={{ position: "relative", marginBottom: "1rem" }}>
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
                          ...inputStyle,
                          paddingLeft: "2.5rem",
                          fontSize: "0.875rem",
                        }}
                      />
                    </div>

                    {/* Category accordion */}
                    <div
                      style={{
                        border: "1px solid var(--border)",
                        borderRadius: "10px",
                        overflow: "hidden",
                      }}
                    >
                      {groupedByCategory.length === 0 ? (
                        <div
                          style={{
                            padding: "2.5rem",
                            textAlign: "center",
                            color: "var(--gray)",
                            fontSize: "0.875rem",
                          }}
                        >
                          No materials found.
                        </div>
                      ) : (
                        groupedByCategory.map((group, catIdx) => {
                          const isExpanded = expandedCategories.has(
                            group.category,
                          );
                          return (
                            <div key={group.category}>
                              <button
                                type="button"
                                onClick={() => toggleCategory(group.category)}
                                style={{
                                  width: "100%",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "space-between",
                                  padding: "0.875rem 1rem",
                                  background: "rgba(255,255,255,0.04)",
                                  border: "none",
                                  borderBottom:
                                    "1px solid rgba(255,255,255,0.05)",
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
                                      transform: isExpanded
                                        ? "rotate(90deg)"
                                        : "none",
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
                                        fontSize: "0.85rem",
                                      }}
                                    >
                                      {group.category}
                                    </div>
                                    <div
                                      style={{
                                        fontSize: "0.65rem",
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
                                  const isSelected = selectedMaterials.some(
                                    (p) => p.id === m.id,
                                  );
                                  const childCount = materials.filter(
                                    (c) => c.parentId === m.id,
                                  ).length;
                                  return (
                                    <button
                                      key={m.id}
                                      type="button"
                                      onClick={() => toggleMaterial(m)}
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
                                        borderBottom:
                                          "1px solid rgba(255,255,255,0.03)",
                                        cursor: "pointer",
                                        textAlign: "left",
                                      }}
                                    >
                                      <div style={{ flex: 1 }}>
                                        <div
                                          style={{
                                            fontWeight: 600,
                                            color: isSelected
                                              ? "#D4A843"
                                              : "var(--white)",
                                            fontSize: "0.85rem",
                                          }}
                                        >
                                          {m.name}
                                        </div>
                                        {m.hasVariants && (
                                          <div
                                            style={{
                                              display: "flex",
                                              flexWrap: "wrap",
                                              gap: "0.25rem",
                                              marginTop: "0.35rem",
                                            }}
                                          >
                                            <span
                                              style={{
                                                fontSize: "0.6rem",
                                                color: "var(--gray)",
                                                background:
                                                  "rgba(255,255,255,0.05)",
                                                border:
                                                  "1px solid rgba(255,255,255,0.1)",
                                                padding: "0.1rem 0.4rem",
                                                borderRadius: "3px",
                                              }}
                                            >
                                              {childCount} variant
                                              {childCount !== 1 ? "s" : ""}
                                            </span>
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
                        })
                      )}
                    </div>

                    {selectedMaterials.length === 0 && (
                      <p
                        style={{
                          fontSize: "0.78rem",
                          color: "var(--gray)",
                          marginTop: "0.875rem",
                          textAlign: "center",
                        }}
                      >
                        Select one or more materials above. All variant
                        combinations will be shown automatically.
                      </p>
                    )}
                    {selectedMaterials.length > 0 && (
                      <div
                        style={{
                          padding: "0.75rem 1rem",
                          background: "rgba(212,168,67,0.1)",
                          border: "1px solid rgba(212,168,67,0.3)",
                          borderRadius: "8px",
                          marginTop: "1rem",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "flex-start",
                            gap: "0.5rem",
                          }}
                        >
                          <svg
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="#D4A843"
                            strokeWidth="2"
                            style={{ flexShrink: 0, marginTop: "0.1rem" }}
                          >
                            <circle cx="12" cy="12" r="10" />
                            <path d="M12 16v-4" />
                            <path d="M12 8h.01" />
                          </svg>
                          <div
                            style={{
                              fontSize: "0.7rem",
                              color: "#D4A843",
                              lineHeight: "1.4",
                            }}
                          >
                            <strong>Tip:</strong> Add all materials from the
                            same invoice together for accurate cost tracking.
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ═══ STEP 2: Stock Entry ═══ */}
              {step === 2 && (
                <div
                  className="si-wizard-step-grid"
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 420px",
                    minHeight: 0,
                    borderTop: "1px solid rgba(255,255,255,0.08)",
                  }}
                >
                  {/* LEFT — Stock Entry Tables */}
                  <div
                    style={{
                      padding: "1.5rem 2rem",
                      overflowY: "auto",
                      background: "#0E0E0E",
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

                    {selectedMaterials.map((mat, mIdx) => {
                      const rows = stockRowsByMaterial[mat.id] || [];
                      const totalProdQty = rows.reduce(
                        (s, r) => s + (parseInt(r.qty) || 0),
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
                                {rows.length} Variant
                                {rows.length !== 1 ? "s" : ""}
                                {totalProdQty > 0 && ` • ${totalProdQty} pcs`}
                              </div>
                            </div>
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
                            <table
                              style={{
                                width: "100%",
                                borderCollapse: "collapse",
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
                                      width: "120px",
                                    }}
                                  >
                                    Min Stock
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
                                      width: "140px",
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
                                    }}
                                  >
                                    Damaged
                                  </th>
                                </tr>
                              </thead>
                              <tbody>
                                {rows.map((row, idx) => {
                                  const q = parseInt(row.qty) || 0;
                                  const d = parseInt(row.damaged) || 0;
                                  return (
                                    <tr
                                      key={row.materialId}
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
                                      </td>
                                      <td
                                        style={{
                                          padding: "1rem 0.75rem",
                                          textAlign: "center",
                                        }}
                                      >
                                        <IntegerInput
                                          value={row.minStockLevel}
                                          onChange={(val) =>
                                            updateStockRow(
                                              mat.id,
                                              idx,
                                              "minStockLevel",
                                              val,
                                            )
                                          }
                                          min={1}
                                          max={9999}
                                          placeholder="10"
                                          style={{
                                            textAlign: "center",
                                            width: "80px",
                                            background:
                                              "rgba(255,255,255,0.06)",
                                            border:
                                              "1px solid rgba(255,255,255,0.1)",
                                            borderRadius: "8px",
                                            color: "#E5E2E1",
                                            fontWeight: 600,
                                            padding: "0.5rem",
                                            fontSize: "0.85rem",
                                            outline: "none",
                                          }}
                                        />
                                      </td>
                                      <td
                                        style={{
                                          padding: "1rem 0.75rem",
                                          textAlign: "center",
                                        }}
                                      >
                                        <IntegerInput
                                          value={row.qty}
                                          onChange={(val) =>
                                            updateStockRow(
                                              mat.id,
                                              idx,
                                              "qty",
                                              val,
                                            )
                                          }
                                          min={0}
                                          max={99999}
                                          placeholder="0"
                                          style={{
                                            textAlign: "center",
                                            width: "80px",
                                            background:
                                              "rgba(255,255,255,0.06)",
                                            border:
                                              "1px solid rgba(255,255,255,0.1)",
                                            borderRadius: "8px",
                                            color:
                                              q > 0 ? "#D4A843" : "var(--gray)",
                                            fontWeight: 700,
                                            padding: "0.5rem",
                                            fontSize: "0.85rem",
                                            outline: "none",
                                          }}
                                        />
                                      </td>
                                      <td
                                        style={{
                                          padding: "1rem 0.75rem",
                                          textAlign: "center",
                                        }}
                                      >
                                        <IntegerInput
                                          value={row.damaged}
                                          onChange={(val) =>
                                            updateStockRow(
                                              mat.id,
                                              idx,
                                              "damaged",
                                              val,
                                            )
                                          }
                                          min={0}
                                          max={99999}
                                          placeholder="0"
                                          style={{
                                            textAlign: "center",
                                            width: "80px",
                                            background:
                                              "rgba(255,255,255,0.06)",
                                            border:
                                              "1px solid rgba(255,255,255,0.1)",
                                            borderRadius: "8px",
                                            color:
                                              d > 0 ? "#F87171" : "var(--gray)",
                                            fontWeight: 600,
                                            padding: "0.5rem",
                                            fontSize: "0.85rem",
                                            outline: "none",
                                          }}
                                        />
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
                          Stock Wastage — Damaged Upon Arrival
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

                  {/* RIGHT — Invoice Preview (read-only) */}
                  <div
                    style={{
                      padding: "1.5rem 2rem",
                      background: "#131313",
                      borderLeft: "1px solid rgba(255,255,255,0.08)",
                      overflowY: "auto",
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
                          Invoice Preview
                        </div>
                        <div
                          style={{ fontSize: "0.7rem", color: "var(--gray)" }}
                        >
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
                        {["Invoice Number", "Delivery Date"].map((l) => (
                          <div key={l}>
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
                              {l}
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
                        ))}
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
                        style={{ margin: "0 auto 0.5rem", display: "block" }}
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

              {/* ═══ STEP 3: Invoice Details ═══ */}
              {step === 3 && (
                <div
                  className="si-wizard-step-grid"
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 420px",
                    minHeight: 0,
                    borderTop: "1px solid rgba(255,255,255,0.08)",
                  }}
                >
                  {/* LEFT — Stock Summary (read-only) */}
                  <div
                    style={{
                      padding: "1.5rem 2rem",
                      overflowY: "auto",
                      background: "#0E0E0E",
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

                    {selectedMaterials.map((mat, pIdx) => {
                      const rows = (stockRowsByMaterial[mat.id] || []).filter(
                        (r) => (parseInt(r.qty) || 0) > 0,
                      );
                      if (rows.length === 0) return null;
                      const productTotalQty = rows.reduce(
                        (s, r) => s + (parseInt(r.qty) || 0),
                        0,
                      );
                      const productTotalDamaged = rows.reduce(
                        (s, r) => s + (parseInt(r.damaged) || 0),
                        0,
                      );
                      const productTotalGood =
                        productTotalQty - productTotalDamaged;
                      const productsWithQtyCount = selectedMaterials.filter(
                        (m) =>
                          (stockRowsByMaterial[m.id] || []).some(
                            (r) => (parseInt(r.qty) || 0) > 0,
                          ),
                      ).length;

                      return (
                        <div
                          key={mat.id}
                          style={{
                            marginBottom:
                              pIdx < selectedMaterials.length - 1
                                ? "1.5rem"
                                : "0",
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
                                style={{
                                  fontSize: "0.6rem",
                                  color: "var(--gray)",
                                }}
                              >
                                {rows.length} variant
                                {rows.length !== 1 ? "s" : ""} with qty
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
                                      letterSpacing: "0.08em",
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
                                      letterSpacing: "0.08em",
                                      width: "60px",
                                    }}
                                  >
                                    Dmg
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
                                        color:
                                          (parseInt(row.damaged) || 0) > 0
                                            ? "#F87171"
                                            : "var(--gray)",
                                        fontWeight: 600,
                                      }}
                                    >
                                      {parseInt(row.damaged) || 0}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          {productsWithQtyCount > 1 && (
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
                                  {productTotalGood}{" "}
                                  <span style={{ fontSize: "0.6rem" }}>
                                    pcs
                                  </span>
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
                                  Damaged
                                </div>
                                <div
                                  style={{
                                    fontSize: "0.9rem",
                                    fontWeight: 700,
                                    color: "#F87171",
                                  }}
                                >
                                  {productTotalDamaged}{" "}
                                  <span style={{ fontSize: "0.6rem" }}>
                                    pcs
                                  </span>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {/* Overall Totals */}
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
                          Damaged
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

                  {/* RIGHT — Invoice Form (editable) */}
                  <div
                    style={{
                      padding: "1.5rem 2rem",
                      background: "#131313",
                      borderLeft: "1px solid rgba(255,255,255,0.08)",
                      overflowY: "auto",
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
                      {/* Supplier */}
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
                          onAddNew={() => setShowAddVendor(true)}
                        />
                        {categoriesWithQty.length > 0 && (
                          <div
                            style={{
                              fontSize: "0.58rem",
                              color: "var(--gray)",
                              marginTop: "0.25rem",
                            }}
                          >
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
                              display: "block",
                              fontSize: "0.65rem",
                              fontWeight: 700,
                              color: "var(--gray)",
                              textTransform: "uppercase",
                              letterSpacing: "0.08em",
                              marginBottom: "0.5rem",
                            }}
                          >
                            Invoice / OR No.{" "}
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
                            maxLength={50}
                            style={{
                              ...inputStyle,
                              fontSize: "0.85rem",
                              padding: "0.625rem 0.75rem",
                            }}
                          />
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
                            max={new Date().toISOString().split("T")[0]}
                            style={{
                              ...inputStyle,
                              fontSize: "0.85rem",
                              padding: "0.625rem 0.75rem",
                              colorScheme: "dark",
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
                          const rows = (
                            stockRowsByMaterial[mat.id] || []
                          ).filter((r) => (parseInt(r.qty) || 0) > 0);
                          if (rows.length === 0) return null;
                          const mode = materialCostMode[mat.id] || "unit";
                          const totalAmt = materialTotalAmounts[mat.id] || "";
                          const totalQty = rows.reduce(
                            (s, r) => s + (parseInt(r.qty) || 0),
                            0,
                          );
                          const computedUnit =
                            totalQty > 0 && totalAmt
                              ? (parseFloat(totalAmt.replace(/,/g, "")) || 0) /
                                totalQty
                              : 0;
                          const matApplyCost =
                            applyAllCostByMaterial[mat.id] || "";

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
                                {/* Cost Mode Toggle */}
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
                                          setMaterialCostMode((p) => ({
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
                                            mode === val
                                              ? "#000"
                                              : "var(--gray)",
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
                                      borderBottom:
                                        "1px solid rgba(255,255,255,0.04)",
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
                                        onChange={(val) =>
                                          setMaterialTotalAmounts((p) => ({
                                            ...p,
                                            [mat.id]: val,
                                          }))
                                        }
                                        placeholder="0.00"
                                        style={{
                                          fontSize: "1.1rem",
                                          fontWeight: 800,
                                          color: "#E5E2E1",
                                          flex: 1,
                                        }}
                                      />
                                    </div>
                                    {computedUnit > 0 && (
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
                                          {formatPrice(computedUnit)}
                                        </strong>
                                      </div>
                                    )}
                                  </div>
                                ) : (
                                  <>
                                    {/* Apply-all row — only if >1 variant */}
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
                                            background:
                                              "rgba(255,255,255,0.06)",
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
                                          <input
                                            type="text"
                                            value={matApplyCost}
                                            inputMode="decimal"
                                            onChange={(e) => {
                                              const v = e.target.value;
                                              if (
                                                v === "" ||
                                                /^\d*\.?\d{0,2}$/.test(v)
                                              )
                                                setApplyAllCostByMaterial(
                                                  (p) => ({
                                                    ...p,
                                                    [mat.id]: v,
                                                  }),
                                                );
                                            }}
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
                                            const allRowsFull =
                                              stockRowsByMaterial[mat.id] || [];
                                            setStockRowsByMaterial((p) => ({
                                              ...p,
                                              [mat.id]: allRowsFull.map(
                                                (r) => ({
                                                  ...r,
                                                  unitCost: matApplyCost,
                                                }),
                                              ),
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
                                    {/* Per-variant cost rows */}
                                    {rows.map((row, idx) => {
                                      const qty = parseInt(row.qty) || 0;
                                      const cost =
                                        parseFloat(row.unitCost) || 0;
                                      const subtotal = qty * cost;
                                      return (
                                        <div
                                          key={row.materialId}
                                          style={{
                                            display: "grid",
                                            gridTemplateColumns:
                                              "1fr 80px 80px",
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
                                              background:
                                                "rgba(255,255,255,0.06)",
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
                                            <input
                                              type="text"
                                              value={row.unitCost}
                                              inputMode="decimal"
                                              onChange={(e) => {
                                                const v = e.target.value;
                                                if (
                                                  v === "" ||
                                                  /^\d*\.?\d{0,2}$/.test(v)
                                                ) {
                                                  const allRowsFull =
                                                    stockRowsByMaterial[
                                                      mat.id
                                                    ] || [];
                                                  setStockRowsByMaterial(
                                                    (p) => ({
                                                      ...p,
                                                      [mat.id]: allRowsFull.map(
                                                        (r) =>
                                                          r.materialId ===
                                                          row.materialId
                                                            ? {
                                                                ...r,
                                                                unitCost: v,
                                                              }
                                                            : r,
                                                      ),
                                                    }),
                                                  );
                                                }
                                              }}
                                              placeholder="0.00"
                                              style={{
                                                width: "45px",
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

                      {/* Receipt Upload */}
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
                            e.currentTarget.style.background =
                              "rgba(0,0,0,0.15)";
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
                              ? "✓ Receipt uploaded"
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
                            accept="image/jpeg,image/png"
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
                          <div
                            style={{
                              position: "relative",
                              marginTop: "0.5rem",
                            }}
                          >
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
                              onClick={() =>
                                setInvoice((p) => ({
                                  ...p,
                                  receiptImage: null,
                                }))
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

                      {/* Receipt Summary */}
                      <div
                        style={{
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

                        {/* Per-material breakdown — only if >1 material with qty */}
                        {selectedMaterials.filter((m) =>
                          (stockRowsByMaterial[m.id] || []).some(
                            (r) => (parseInt(r.qty) || 0) > 0,
                          ),
                        ).length > 1 && (
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
                              const mode = materialCostMode[mat.id] || "unit";
                              const totalAmt =
                                materialTotalAmounts[mat.id] || "";
                              const totalQty = rows.reduce(
                                (s, r) => s + (parseInt(r.qty) || 0),
                                0,
                              );
                              let matSubtotal = 0;
                              let displayUnit = null;
                              if (mode === "total" && totalAmt) {
                                matSubtotal =
                                  parseFloat(totalAmt.replace(/,/g, "")) || 0;
                                displayUnit =
                                  totalQty > 0 ? matSubtotal / totalQty : 0;
                              } else {
                                matSubtotal = rows.reduce(
                                  (s, r) =>
                                    s +
                                    (parseInt(r.qty) || 0) *
                                      (parseFloat(r.unitCost) || 0),
                                  0,
                                );
                                const costs = rows.map(
                                  (r) => parseFloat(r.unitCost) || 0,
                                );
                                const allSame =
                                  costs.length > 0 &&
                                  costs.every((c) => c === costs[0]);
                                displayUnit = allSame ? costs[0] : null;
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
                                      fontSize: "0.65rem",
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
                                        }}
                                      >
                                        {formatPrice(matSubtotal)}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {/* Grand total */}
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            padding: "0.75rem",
                            borderTop: "1px solid rgba(212,168,67,0.3)",
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
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* ── Wizard Footer ── */}
            <div
              style={{
                padding: "1rem 2rem",
                borderTop: "1px solid rgba(255,255,255,0.08)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexShrink: 0,
                background: "#131313",
              }}
            >
              <div style={{ display: "flex", gap: "0.5rem" }}>
                {step > 1 && (
                  <button
                    type="button"
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
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.background =
                        "rgba(255,255,255,0.06)")
                    }
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.background = "none")
                    }
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                    >
                      <path d="M19 12H5M12 5l-7 7 7 7" />
                    </svg>
                    Back
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleDiscard}
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

              <div
                style={{ display: "flex", alignItems: "center", gap: "1rem" }}
              >
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
                    {totalDamaged > 0 && damagedBreakdown && (
                      <span style={{ color: "var(--gray)" }}>
                        Damaged:{" "}
                        <strong
                          style={{ color: "#F87171", fontSize: "0.68rem" }}
                        >
                          {damagedBreakdown}
                        </strong>
                      </span>
                    )}
                    <span style={{ color: "var(--gray)" }}>
                      Total:{" "}
                      <strong style={{ color: "#FACC15" }}>
                        {formatPrice(totalInvoiceValue)}
                      </strong>
                    </span>
                  </div>
                )}
                {step < 3 ? (
                  <button
                    type="button"
                    disabled={
                      (step === 1 && !step1Valid) ||
                      (step === 2 && !step2Valid())
                    }
                    onClick={
                      step === 1 ? handleGoToStep2 : () => setStep((s) => s + 1)
                    }
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.5rem",
                      background:
                        (step === 1 && !step1Valid) ||
                        (step === 2 && !step2Valid())
                          ? "rgba(255,255,255,0.1)"
                          : "linear-gradient(135deg,#FFDF9F 0%,#D4A843 100%)",
                      border: "none",
                      color:
                        (step === 1 && !step1Valid) ||
                        (step === 2 && !step2Valid())
                          ? "var(--gray)"
                          : "#000",
                      borderRadius: "8px",
                      padding: "0.625rem 1.25rem",
                      fontSize: "0.85rem",
                      fontWeight: 700,
                      cursor:
                        (step === 1 && !step1Valid) ||
                        (step === 2 && !step2Valid())
                          ? "not-allowed"
                          : "pointer",
                      boxShadow:
                        (step === 1 && !step1Valid) ||
                        (step === 2 && !step2Valid())
                          ? "none"
                          : "0 0 16px rgba(212,168,67,0.3)",
                      transition: "all 0.2s",
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
                      <path d="M5 12h14M12 5l7 7-7 7" />
                    </svg>
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={!step3Valid()}
                    onClick={handleSubmit}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.5rem",
                      background: step3Valid()
                        ? "linear-gradient(135deg,#FFDF9F 0%,#D4A843 100%)"
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
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                    >
                      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                      <polyline points="17 21 17 13 7 13 7 21" />
                      <polyline points="7 3 7 8 15 8" />
                    </svg>
                    Save Item
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

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
          const nv = {
            ...data,
            id: `vendor-${Date.now()}`,
            createdAt: new Date().toISOString(),
          };
          const updated = [...vendors, nv];
          setVendors(updated);
          setStore(VENDORS_KEY, updated);
          setInvoice((p) => ({ ...p, vendorId: nv.id, vendorName: nv.name }));
        }}
        existingVendors={vendors}
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
    </div>
  );
}
