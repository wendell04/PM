"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

// ── Supplier Combobox ─────────────────────────────────────────────────────────
// Shows vendors who supply AT LEAST ONE of the selected material categories.
// General/no-category vendors always appear.
function SupplierCombobox({
  value,
  vendorName,
  onChange,
  vendors,
  selectedCategories,
  onAddNew,
  onViewCatalog,
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

  // Deduplicate vendors by ID — prevent duplicate entries
  const uniqueVendors = useMemo(() => {
    const seen = new Map();
    vendors.forEach((v) => {
      if (!seen.has(v.id)) seen.set(v.id, v);
    });
    return [...seen.values()];
  }, [vendors]);

  // A vendor is eligible if they supply ALL of the selected material categories
  // (deduplicate itemsSupplied first to avoid false matches from duplicates)
  const eligibleVendors = useMemo(() => {
    return uniqueVendors.filter((v) => {
      const rawItems = v.itemsSupplied || v.categories || [];
      // Deduplicate items by name
      const vItems = [
        ...new Set(
          rawItems.map((item) =>
            typeof item === "string" ? item : item.name || "",
          ),
        ),
      ];
      if (vItems.length === 0) return true; // General supplier — always show
      if (!selectedCategories || selectedCategories.length === 0) return true;
      // Vendor must supply ALL selected categories
      return selectedCategories.every((cat) => vItems.includes(cat));
    });
  }, [uniqueVendors, selectedCategories]);

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
            overflow: "hidden",
            boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
            maxHeight: "260px",
            overflowY: "auto",
          }}
        >
          {/* General option */}
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

          {/* Eligible vendors */}
          {eligibleVendors.map((v) => (
            <div
              key={v.id}
              style={{
                display: "flex",
                alignItems: "center",
                borderBottom: "1px solid rgba(255,255,255,0.04)",
              }}
            >
              <button
                type="button"
                onClick={() => {
                  onChange(v.id, v.name);
                  setOpen(false);
                }}
                style={{
                  flex: 1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "0.65rem 0.875rem",
                  background:
                    value === v.id ? "rgba(212,168,67,0.12)" : "transparent",
                  border: "none",
                  cursor: "pointer",
                  textAlign: "left",
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
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setOpen(false);
                  onViewCatalog?.(v);
                }}
                title="View price history"
                style={{
                  padding: "0.65rem 0.6rem",
                  background: "transparent",
                  border: "none",
                  borderLeft: "1px solid rgba(255,255,255,0.06)",
                  cursor: "pointer",
                  color: "#D4A843",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.3rem",
                  fontSize: "0.68rem",
                  fontWeight: 600,
                  whiteSpace: "nowrap",
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.background = "rgba(212,168,67,0.08)")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.background = "transparent")
                }
              >
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                  <polyline points="15 3 21 3 21 9" />
                  <line x1="10" y1="14" x2="21" y2="3" />
                </svg>
              </button>
            </div>
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

          {/* Add new vendor */}
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

// ── Add Vendor Quick Modal ────────────────────────────────────────────────────
function AddVendorQuickModal({
  isOpen,
  onClose,
  onAdd,
  existingVendors,
  selectedCategories,
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
    if (isOpen) {
      setForm({
        name: "",
        contact: "",
        phone: "",
        address: "",
        email: "",
        // Auto-pre-fill with ALL selected categories so the new vendor is immediately eligible
        categories: selectedCategories ? [...selectedCategories] : [],
      });
    }
  }, [isOpen, selectedCategories]);

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
    <div className="modal-overlay" style={{ zIndex: 1100 }}>
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
        <div className="modal-body">
          {/* Auto-linked categories notice */}
          {form.categories.length > 0 && (
            <div
              style={{
                padding: "0.65rem 0.875rem",
                background: "rgba(212,168,67,0.1)",
                border: "1px solid rgba(212,168,67,0.3)",
                borderRadius: "8px",
                marginBottom: "1rem",
                fontSize: "0.72rem",
                color: "#D4A843",
              }}
            >
              <strong>Auto-linked categories:</strong>{" "}
              {form.categories.join(", ")} — this vendor will be eligible for
              future stock-ins of these items.
            </div>
          )}
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
      {infoModal && (
        <div className="modal-overlay" style={{ zIndex: 1200 }}>
          <div
            className="modal-content"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: "400px" }}
          >
            <div className="modal-header">
              <h2 className="modal-title">{infoModal.title}</h2>
            </div>
            <div
              style={{
                padding: "1.5rem 2rem",
                fontSize: "0.875rem",
                color: "#E5E2E1",
              }}
            >
              {infoModal.message}
            </div>
            <div className="modal-actions">
              <button
                className="btn-primary"
                onClick={() => setInfoModal(null)}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Supplier Catalog Modal (per-batch price history, like old supplier management) ──
function SupplierCatalogModal({
  isOpen,
  onClose,
  supplier,
  batches,
  materials,
}) {
  const [expandedItems, setExpandedItems] = useState(new Set());

  useEffect(() => {
    if (isOpen) setExpandedItems(new Set());
  }, [isOpen]);

  // Get all batches from this supplier
  const supplierBatches = useMemo(() => {
    if (!supplier || !batches) return [];
    return batches.filter(
      (b) => b.vendorId === supplier.id || b.vendorName === supplier.name,
    );
  }, [supplier, batches]);

  // Build vendor's supplied category list (deduplicated)
  const vendorCategories = useMemo(() => {
    if (!supplier) return [];
    const raw = supplier.itemsSupplied || supplier.categories || [];
    return [
      ...new Set(
        raw.map((item) => (typeof item === "string" ? item : item.name || "")),
      ),
    ];
  }, [supplier]);

  // Find materials that match this vendor's categories
  const vendorMaterials = useMemo(() => {
    if (!materials || vendorCategories.length === 0) return [];
    return materials.filter((m) => {
      // Include standalone materials and variant children
      if (m.hasVariants && !m.parentId) return false; // skip parent containers
      return m.category && vendorCategories.includes(m.category);
    });
  }, [materials, vendorCategories]);

  // Group by material name — merge purchase history with current baseCost
  const groupedByMaterial = useMemo(() => {
    const map = new Map();

    // First, add all vendor materials with their current baseCost
    vendorMaterials.forEach((m) => {
      const key = m.id;
      map.set(key, {
        materialId: m.id,
        materialName: m.name,
        sku: m.sku || "",
        uom: m.uom || "pcs",
        currentBaseCost: m.baseCost || 0,
        priceHistory: [],
      });
    });

    // Then, add purchase history on top
    supplierBatches.forEach((b) => {
      const key = b.materialId;
      if (!map.has(key)) {
        // Material not in current master data — add from batch
        map.set(key, {
          materialId: b.materialId,
          materialName: b.materialName,
          sku: b.sku || "",
          uom: b.uom || "pcs",
          currentBaseCost: b.unitCost || 0,
          priceHistory: [],
        });
      }
      map.get(key).priceHistory.push({
        dateReceived: b.dateReceived,
        unitCost: b.unitCost || 0,
        qty: b.receivedQty || b.qtyGood || 0,
        invoiceNumber: b.invoiceNumber || b.referenceNo || "—",
        poNumber: b.poNumber || "",
        grNumber: b.grNumber || "",
      });
    });

    // Sort each material's history by date (oldest first)
    map.forEach((item) => {
      item.priceHistory.sort(
        (a, b) => new Date(a.dateReceived) - new Date(b.dateReceived),
      );
    });

    return [...map.values()].sort((a, b) =>
      a.materialName.localeCompare(b.materialName),
    );
  }, [supplierBatches, vendorMaterials]);

  const totalSpent = supplierBatches.reduce(
    (s, b) => s + (b.totalCost || (b.receivedQty || 0) * (b.unitCost || 0)),
    0,
  );
  const totalBatches = supplierBatches.length;
  const totalItems = supplierBatches.reduce(
    (s, b) => s + (b.receivedQty || b.qtyGood || 0),
    0,
  );

  if (!isOpen || !supplier) return null;

  const toggleExpand = (materialId) => {
    setExpandedItems((prev) => {
      const next = new Set(prev);
      next.has(materialId) ? next.delete(materialId) : next.add(materialId);
      return next;
    });
  };

  return (
    <div className="modal-overlay">
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: "700px",
          width: "95%",
          maxHeight: "85vh",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div className="modal-header" style={{ flexShrink: 0 }}>
          <div>
            <h2 className="modal-title">{supplier.name} — Catalog</h2>
            <p
              style={{
                fontSize: "0.75rem",
                color: "var(--gray)",
                marginTop: "0.2rem",
              }}
            >
              Purchase history & per-batch pricing from this supplier.
            </p>
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

        <div className="modal-body" style={{ flex: 1, overflowY: "auto" }}>
          {/* Summary Cards */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: "0.75rem",
              marginBottom: "1.25rem",
            }}
          >
            <div
              style={{
                padding: "0.875rem",
                background: "rgba(0,0,0,0.2)",
                borderRadius: "8px",
                textAlign: "center",
              }}
            >
              <div
                style={{
                  fontSize: "0.68rem",
                  color: "var(--gray)",
                  textTransform: "uppercase",
                  marginBottom: "0.4rem",
                }}
              >
                Total Spent
              </div>
              <div
                style={{ fontSize: "1rem", fontWeight: 700, color: "#facc15" }}
              >
                ₱
                {totalSpent.toLocaleString("en-PH", {
                  minimumFractionDigits: 2,
                })}
              </div>
            </div>
            <div
              style={{
                padding: "0.875rem",
                background: "rgba(0,0,0,0.2)",
                borderRadius: "8px",
                textAlign: "center",
              }}
            >
              <div
                style={{
                  fontSize: "0.68rem",
                  color: "var(--gray)",
                  textTransform: "uppercase",
                  marginBottom: "0.4rem",
                }}
              >
                Purchases
              </div>
              <div
                style={{
                  fontSize: "1rem",
                  fontWeight: 700,
                  color: "var(--gold)",
                }}
              >
                {totalBatches} batch{totalBatches !== 1 ? "es" : ""}
              </div>
            </div>
            <div
              style={{
                padding: "0.875rem",
                background: "rgba(0,0,0,0.2)",
                borderRadius: "8px",
                textAlign: "center",
              }}
            >
              <div
                style={{
                  fontSize: "0.68rem",
                  color: "var(--gray)",
                  textTransform: "uppercase",
                  marginBottom: "0.4rem",
                }}
              >
                Items Received
              </div>
              <div
                style={{
                  fontSize: "1rem",
                  fontWeight: 700,
                  color: "var(--white)",
                }}
              >
                {totalItems} pcs
              </div>
            </div>
          </div>

          {groupedByMaterial.length === 0 ? (
            <div
              style={{
                padding: "2rem",
                textAlign: "center",
                color: "var(--gray)",
                fontStyle: "italic",
              }}
            >
              No materials found for this supplier's categories.
            </div>
          ) : (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "0.75rem",
              }}
            >
              {groupedByMaterial.map((item) => {
                const isExpanded = expandedItems.has(item.materialId);
                const latest = item.priceHistory[item.priceHistory.length - 1];
                const priceChanges = [];
                for (let i = 1; i < item.priceHistory.length; i++) {
                  const prev = item.priceHistory[i - 1].unitCost;
                  const curr = item.priceHistory[i].unitCost;
                  if (prev !== curr) {
                    priceChanges.push({
                      from: prev,
                      to: curr,
                      change: curr - prev,
                      date: item.priceHistory[i].dateReceived,
                    });
                  }
                }

                return (
                  <div
                    key={item.materialId}
                    style={{
                      background: "rgba(255,255,255,0.02)",
                      border: "1px solid rgba(255,255,255,0.06)",
                      borderRadius: "10px",
                      overflow: "hidden",
                    }}
                  >
                    {/* Header Row */}
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        padding: "1rem 1.25rem",
                        cursor: "pointer",
                      }}
                      onClick={() => toggleExpand(item.materialId)}
                    >
                      <div>
                        <div
                          style={{
                            fontWeight: 700,
                            color: "#E5E2E1",
                            fontSize: "0.95rem",
                          }}
                        >
                          {item.materialName}
                        </div>
                        <div
                          style={{
                            display: "flex",
                            gap: "0.75rem",
                            marginTop: "0.2rem",
                            fontSize: "0.72rem",
                            color: "var(--gray)",
                          }}
                        >
                          {item.sku && (
                            <span style={{ fontFamily: "monospace" }}>
                              {item.sku}
                            </span>
                          )}
                          <span>
                            {item.priceHistory.length} purchase
                            {item.priceHistory.length !== 1 ? "s" : ""}
                          </span>
                        </div>
                      </div>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "0.75rem",
                        }}
                      >
                        {priceChanges.length > 0 &&
                          (() => {
                            const lastChange =
                              priceChanges[priceChanges.length - 1];
                            const isUp = lastChange.change > 0;
                            return (
                              <span
                                style={{
                                  fontSize: "0.65rem",
                                  fontWeight: 700,
                                  color: isUp ? "#f87171" : "#4ade80",
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "0.2rem",
                                }}
                              >
                                <svg
                                  width="10"
                                  height="10"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="3"
                                >
                                  {isUp ? (
                                    <path d="M18 15l-6-6-6 6" />
                                  ) : (
                                    <path d="M6 9l6 6 6-6" />
                                  )}
                                </svg>
                                ₱
                                {Math.abs(lastChange.change).toLocaleString(
                                  "en-PH",
                                  { minimumFractionDigits: 2 },
                                )}
                              </span>
                            );
                          })()}
                        <div style={{ textAlign: "right" }}>
                          <div
                            style={{
                              fontSize: "1.1rem",
                              fontWeight: 800,
                              color: "#D4A843",
                              fontFamily: "monospace",
                            }}
                          >
                            ₱
                            {(
                              latest?.unitCost ||
                              item.currentBaseCost ||
                              0
                            ).toLocaleString("en-PH", {
                              minimumFractionDigits: 2,
                            })}
                          </div>
                          <div
                            style={{
                              fontSize: "0.6rem",
                              color: "var(--gray)",
                              textTransform: "uppercase",
                            }}
                          >
                            {item.priceHistory.length > 0
                              ? "Latest Price"
                              : "Current Cost"}
                          </div>
                        </div>
                        <svg
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          style={{
                            transform: isExpanded ? "rotate(90deg)" : "none",
                            transition: "transform 0.2s",
                            color: "var(--gray)",
                          }}
                        >
                          <path d="M9 18l6-6-6-6" />
                        </svg>
                      </div>
                    </div>

                    {/* Expanded: Price History Table */}
                    {isExpanded && (
                      <div
                        style={{
                          borderTop: "1px solid rgba(255,255,255,0.04)",
                          background: "rgba(0,0,0,0.15)",
                        }}
                      >
                        {item.priceHistory.length === 0 ? (
                          <div
                            style={{
                              padding: "1.5rem",
                              textAlign: "center",
                              color: "var(--gray)",
                              fontSize: "0.8rem",
                            }}
                          >
                            <div style={{ marginBottom: "0.5rem" }}>
                              No purchase history yet from this supplier.
                            </div>
                            <div style={{ color: "#D4A843", fontWeight: 600 }}>
                              Current master cost: ₱
                              {item.currentBaseCost.toLocaleString("en-PH", {
                                minimumFractionDigits: 2,
                              })}
                            </div>
                          </div>
                        ) : (
                          <table
                            style={{
                              width: "100%",
                              fontSize: "0.8rem",
                              borderCollapse: "collapse",
                            }}
                          >
                            <thead>
                              <tr
                                style={{
                                  borderBottom:
                                    "1px solid rgba(255,255,255,0.06)",
                                }}
                              >
                                <th
                                  style={{
                                    padding: "0.5rem 1rem",
                                    textAlign: "left",
                                    color: "var(--gray)",
                                    fontWeight: 600,
                                    fontSize: "0.65rem",
                                    textTransform: "uppercase",
                                  }}
                                >
                                  Date
                                </th>
                                <th
                                  style={{
                                    padding: "0.5rem 1rem",
                                    textAlign: "center",
                                    color: "var(--gray)",
                                    fontWeight: 600,
                                    fontSize: "0.65rem",
                                    textTransform: "uppercase",
                                  }}
                                >
                                  Qty
                                </th>
                                <th
                                  style={{
                                    padding: "0.5rem 1rem",
                                    textAlign: "right",
                                    color: "var(--gray)",
                                    fontWeight: 600,
                                    fontSize: "0.65rem",
                                    textTransform: "uppercase",
                                  }}
                                >
                                  Unit Cost
                                </th>
                                <th
                                  style={{
                                    padding: "0.5rem 1rem",
                                    textAlign: "right",
                                    color: "var(--gray)",
                                    fontWeight: 600,
                                    fontSize: "0.65rem",
                                    textTransform: "uppercase",
                                  }}
                                >
                                  Total
                                </th>
                                <th
                                  style={{
                                    padding: "0.5rem 1rem",
                                    textAlign: "center",
                                    color: "var(--gray)",
                                    fontWeight: 600,
                                    fontSize: "0.65rem",
                                    textTransform: "uppercase",
                                  }}
                                >
                                  Ref
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {[...item.priceHistory]
                                .reverse()
                                .map((ph, idx) => {
                                  const prev =
                                    idx < item.priceHistory.length - 1
                                      ? item.priceHistory[
                                          item.priceHistory.length - 1 - idx - 1
                                        ]
                                      : null;
                                  const change = prev
                                    ? ph.unitCost - prev.unitCost
                                    : 0;
                                  const isUp = change > 0;
                                  const isDown = change < 0;
                                  return (
                                    <tr
                                      key={idx}
                                      style={{
                                        borderBottom:
                                          "1px solid rgba(255,255,255,0.03)",
                                      }}
                                    >
                                      <td
                                        style={{
                                          padding: "0.5rem 1rem",
                                          color: "#E5E2E1",
                                          fontSize: "0.78rem",
                                        }}
                                      >
                                        {new Date(
                                          ph.dateReceived,
                                        ).toLocaleDateString("en-PH", {
                                          month: "short",
                                          day: "numeric",
                                          year: "numeric",
                                        })}
                                      </td>
                                      <td
                                        style={{
                                          padding: "0.5rem 1rem",
                                          textAlign: "center",
                                          color: "#D4A843",
                                          fontWeight: 600,
                                        }}
                                      >
                                        {ph.qty}
                                      </td>
                                      <td
                                        style={{
                                          padding: "0.5rem 1rem",
                                          textAlign: "right",
                                          fontWeight: 700,
                                          fontFamily: "monospace",
                                          color: "#E5E2E1",
                                        }}
                                      >
                                        <div
                                          style={{
                                            display: "flex",
                                            alignItems: "center",
                                            justifyContent: "flex-end",
                                            gap: "0.4rem",
                                          }}
                                        >
                                          ₱
                                          {ph.unitCost.toLocaleString("en-PH", {
                                            minimumFractionDigits: 2,
                                          })}
                                          {change !== 0 && (
                                            <span
                                              style={{
                                                fontSize: "0.65rem",
                                                fontWeight: 700,
                                                color: isUp
                                                  ? "#f87171"
                                                  : "#4ade80",
                                              }}
                                            >
                                              {isUp ? "↑" : "↓"}₱
                                              {Math.abs(change).toLocaleString(
                                                "en-PH",
                                                { minimumFractionDigits: 2 },
                                              )}
                                            </span>
                                          )}
                                        </div>
                                      </td>
                                      <td
                                        style={{
                                          padding: "0.5rem 1rem",
                                          textAlign: "right",
                                          color: "#facc15",
                                          fontWeight: 600,
                                          fontFamily: "monospace",
                                        }}
                                      >
                                        ₱
                                        {(ph.qty * ph.unitCost).toLocaleString(
                                          "en-PH",
                                          { minimumFractionDigits: 2 },
                                        )}
                                      </td>
                                      <td
                                        style={{
                                          padding: "0.5rem 1rem",
                                          textAlign: "center",
                                          color: "var(--gray)",
                                          fontSize: "0.72rem",
                                          fontFamily: "monospace",
                                        }}
                                      >
                                        {ph.poNumber ||
                                          ph.grNumber ||
                                          ph.invoiceNumber ||
                                          "—"}
                                      </td>
                                    </tr>
                                  );
                                })}
                            </tbody>
                          </table>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div
          className="modal-actions"
          style={{ flexShrink: 0, justifyContent: "flex-end" }}
        >
          <button type="button" className="btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
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
  qtyValue,
}) {
  const handleChange = (e) => {
    const val = e.target.value;
    if (val === "" || /^\d+$/.test(val)) {
      const num = val === "" ? 0 : parseInt(val, 10);
      if (max !== undefined && num > max) return;
      if (num < min) return;
      if (qtyValue !== undefined) {
        const qty = parseInt(qtyValue) || 0;
        if (num > qty) return;
      }
      onChange(val);
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
      if (num <= max) onChange(val);
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

// ── Comma Number Input (for total invoice amounts) ────────────────────────────
function CommaNumberInput({
  value,
  onChange,
  placeholder,
  style,
  max = 999999999.99,
}) {
  const handleChange = (e) => {
    const val = e.target.value.replace(/,/g, "");
    if (val === "" || /^\d*\.?\d{0,2}$/.test(val)) {
      const num = parseFloat(val) || 0;
      if (num <= max) {
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
      inputMode="decimal"
      placeholder={placeholder}
      style={{
        ...style,
        background: "transparent",
        border: "none",
        outline: "none",
        minWidth: 0,
      }}
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

// ── Format price helper ────────────────────────────────────────────────────────
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

// ══════════════════════════════════════════════════════════════════════════════
// MANUAL STOCK-IN WIZARD MODAL — 3 Steps
// Step 1: Select Materials (from Master Data)
// Step 2: Stock Entry (left) + Invoice Preview placeholder (right)
// Step 3: Stock Summary (left) + Invoice Details with cost modes (right)
// ══════════════════════════════════════════════════════════════════════════════
export default function ManualStockInModal({
  materials,
  vendors,
  onClose,
  onSave,
}) {
  const [step, setStep] = useState(1);

  // Step 1
  const [search, setSearch] = useState("");
  const [selectedMaterials, setSelectedMaterials] = useState([]);

  // Step 2 – stock rows per material
  const [stockRowsByMaterial, setStockRowsByMaterial] = useState({});
  const [applyAllCost, setApplyAllCost] = useState("");

  // Step 3 – per-material cost modes & total amounts
  const [materialCostModes, setMaterialCostModes] = useState({}); // { matId: 'unit' | 'total' }
  const [materialTotalAmounts, setMaterialTotalAmounts] = useState({}); // { matId: '1000.00' }

  // Step 3 – invoice fields
  const [invoice, setInvoice] = useState({
    vendorId: "",
    vendorName: "",
    referenceNo: "",
    deliveryDate: new Date().toISOString().split("T")[0],
    notes: "",
    receiptImage: null,
  });

  const [errors, setErrors] = useState({});
  const [infoModal, setInfoModal] = useState(null);
  const [showAddVendor, setShowAddVendor] = useState(false);
  const [catalogSupplier, setCatalogSupplier] = useState(null);
  // Collect all stock-in batches for catalog price history
  const allBatches = useMemo(() => {
    const batches = [];
    // From stock_in_log
    try {
      const stockIns = JSON.parse(
        localStorage.getItem("pmp_stock_in_log") || "[]",
      );
      stockIns.forEach((si) => {
        batches.push({
          materialId: si.materialId,
          materialName: si.materialName,
          sku: si.sku || "",
          uom: si.uom || "pcs",
          vendorId: si.vendorId,
          vendorName: si.vendorName,
          unitCost: si.unitCost || 0,
          receivedQty: si.receivedQty || si.goodQty || 0,
          qtyGood: si.goodQty || 0,
          totalCost: si.totalCost || (si.receivedQty || 0) * (si.unitCost || 0),
          dateReceived: si.dateReceived,
          invoiceNumber: si.referenceNo || "",
          poNumber: si.poNumber || "",
          grNumber: si.grNumber || "",
        });
      });
    } catch {}
    // From goods_receipts
    try {
      const grs = JSON.parse(
        localStorage.getItem("pmp_goods_receipts") || "[]",
      );
      grs.forEach((gr) => {
        (gr.items || []).forEach((item) => {
          if (item.receivedQty > 0) {
            batches.push({
              materialId: item.materialId,
              materialName: item.materialName,
              sku: item.sku || "",
              uom: item.uom || "pcs",
              vendorId: gr.vendorId,
              vendorName: gr.vendorName,
              unitCost: item.unitCost || 0,
              receivedQty: item.receivedQty,
              qtyGood: item.receivedQty - (item.damagedQty || 0),
              totalCost:
                (item.receivedQty - (item.damagedQty || 0)) *
                (item.unitCost || 0),
              dateReceived: gr.receivedDate || gr.createdAt,
              invoiceNumber: gr.invoiceNo || "",
              poNumber: gr.poNumber || "",
              grNumber: gr.grNumber || "",
            });
          }
        });
      });
    } catch {}
    return batches;
  }, [catalogSupplier]); // recompute when catalog opens

  // Categories of ALL currently selected materials (used to filter supplier dropdown)
  const selectedCategories = useMemo(() => {
    const cats = selectedMaterials.map((m) => m.category).filter(Boolean);
    return [...new Set(cats)];
  }, [selectedMaterials]);

  // Categories that have qty > 0 entered (used to auto-link on save)
  const categoriesWithQty = useMemo(() => {
    const cats = selectedMaterials
      .filter((mat) =>
        (stockRowsByMaterial[mat.id] || []).some(
          (r) => (parseInt(r.qty) || 0) > 0,
        ),
      )
      .map((m) => m.category)
      .filter(Boolean);
    return [...new Set(cats)];
  }, [selectedMaterials, stockRowsByMaterial]);

  // ── Selectable: only parent materials (not variant children) ──────────────
  const selectableMaterials = useMemo(() => {
    const parents = materials.filter((m) => m.hasVariants && !m.parentId);
    const standalone = materials.filter((m) => !m.hasVariants && !m.parentId);
    return [...parents, ...standalone];
  }, [materials]);

  // ── Filtered for search ───────────────────────────────────────────────────
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

  // ── Group by category ─────────────────────────────────────────────────────
  const groupedByCategory = useMemo(() => {
    const groups = {};
    filteredMaterials.forEach((m) => {
      const cat = m.category || "Uncategorized";
      if (!groups[cat]) groups[cat] = { category: cat, materials: [] };
      groups[cat].materials.push(m);
    });
    return Object.values(groups);
  }, [filteredMaterials]);

  // ── Generate stock rows for a material ───────────────────────────────────
  const generateMaterialRows = (material) => {
    if (!material.hasVariants) {
      return [
        {
          materialId: material.id,
          materialName: material.name,
          sku: material.sku || "",
          uom: material.uom || "pcs",
          isVariant: false,
          variantLabel: material.name,
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
    const children = materials.filter((m) => m.parentId === material.id);
    if (children.length === 0) {
      return [
        {
          materialId: material.id,
          materialName: material.name,
          sku: material.sku || "",
          uom: material.uom || "pcs",
          isVariant: true,
          variantLabel: material.name + " (Parent)",
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
      materialName: c.name,
      sku: c.sku || "",
      uom: c.uom || material.uom || "pcs",
      isVariant: true,
      variantLabel: c.name.replace(
        new RegExp(`^${material.name}\\s*[-–]`, "i"),
        "",
      ),
      qty: "",
      damaged: "",
      unitCost:
        c.baseCost != null && c.baseCost > 0
          ? String(c.baseCost)
          : material.baseCost != null && material.baseCost > 0
            ? String(material.baseCost)
            : "",
      minStockLevel: "10",
    }));
  };

  // ── Toggle material selection ──────────────────────────────────────────────
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
        [material.id]: generateMaterialRows(material),
      }));
    }
  };

  // ── Update a stock row ────────────────────────────────────────────────────
  const updateStockRow = (materialId, rowIndex, field, value) => {
    setStockRowsByMaterial((prev) => {
      const rows = [...(prev[materialId] || [])];
      rows[rowIndex] = { ...rows[rowIndex], [field]: value };
      return { ...prev, [materialId]: rows };
    });
  };

  // ── Computed aggregates ───────────────────────────────────────────────────
  const allRows = Object.values(stockRowsByMaterial).flat().filter(Boolean);
  const totalReceived = allRows.reduce((s, r) => s + (parseInt(r.qty) || 0), 0);
  const totalDamaged = allRows.reduce(
    (s, r) => s + (parseInt(r.damaged) || 0),
    0,
  );
  const totalGood = totalReceived - totalDamaged;

  // Total invoice value respects per-material cost modes
  const totalInvoiceValue = useMemo(() => {
    return selectedMaterials.reduce((sum, mat) => {
      const rows = (stockRowsByMaterial[mat.id] || []).filter(
        (r) => (parseInt(r.qty) || 0) > 0,
      );
      if (rows.length === 0) return sum;
      const mode = materialCostModes[mat.id] || "unit";
      const totalAmt = materialTotalAmounts[mat.id] || "";
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

  // Effective value (good qty × unit cost)
  const effectiveValue = useMemo(() => {
    return selectedMaterials.reduce((sum, mat) => {
      const rows = (stockRowsByMaterial[mat.id] || []).filter(
        (r) => (parseInt(r.qty) || 0) > 0,
      );
      if (rows.length === 0) return sum;
      const mode = materialCostModes[mat.id] || "unit";
      const totalAmt = materialTotalAmounts[mat.id] || "";
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
          const good = Math.max(
            0,
            (parseInt(r.qty) || 0) - (parseInt(r.damaged) || 0),
          );
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

  // ── Step validation ───────────────────────────────────────────────────────
  const step1Valid = selectedMaterials.length > 0;
  const step2Valid = () => {
    if (!step1Valid) return false;
    return selectedMaterials.some((mat) => {
      const rows = stockRowsByMaterial[mat.id] || [];
      return rows.some((r) => (parseInt(r.qty) || 0) > 0);
    });
  };
  const step3Valid = () => {
    if (!invoice.referenceNo.trim() || !invoice.deliveryDate) return false;
    return selectedMaterials.every((mat) => {
      const rows = (stockRowsByMaterial[mat.id] || []).filter(
        (r) => (parseInt(r.qty) || 0) > 0,
      );
      if (rows.length === 0) return true;
      const mode = materialCostModes[mat.id] || "unit";
      const totalAmt = materialTotalAmounts[mat.id] || "";
      if (mode === "total")
        return (parseFloat(totalAmt.replace(/,/g, "")) || 0) > 0;
      return rows.some((r) => (parseFloat(r.unitCost) || 0) > 0);
    });
  };

  // ── Navigation ────────────────────────────────────────────────────────────
  const goNext = () => {
    const stepErrors = {};
    if (step === 1 && !step1Valid)
      stepErrors.step1 = "Select at least one material.";
    if (step === 2 && !step2Valid())
      stepErrors.step2 = "Enter received quantity for at least one item.";
    if (Object.keys(stepErrors).length > 0) {
      setErrors(stepErrors);
      return;
    }
    setErrors({});
    setStep((s) => Math.min(s + 1, 3));
  };
  const goBack = () => {
    setErrors({});
    setStep((s) => Math.max(s - 1, 1));
  };

  // ── Submit ────────────────────────────────────────────────────────────────
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
          "Complete all required invoice fields (reference number, delivery date, and cost).",
      });
      return;
    }

    const siEntries = selectedMaterials.flatMap((mat) => {
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
        const damaged = parseInt(r.damaged) || 0;
        const good = received - damaged;
        const unitCost =
          mode === "total" ? computedUnitCost : parseFloat(r.unitCost) || 0;
        return {
          materialId: r.materialId,
          materialName: r.materialName,
          sku: r.sku || "",
          uom: r.uom || "pcs",
          vendorId: invoice.vendorId || null,
          vendorName: invoice.vendorName || "General Merchandise",
          receivedQty: received,
          damagedQty: damaged,
          goodQty: good,
          unitCost,
          effectiveUnitCost: good > 0 ? (received * unitCost) / good : unitCost,
          totalPaid: received * unitCost,
          referenceNo: invoice.referenceNo.trim(),
          notes: invoice.notes.trim(),
          returnReason: "",
          dateReceived: invoice.deliveryDate + "T00:00:00.000Z",
          receiptImage: invoice.receiptImage || null,
        };
      });
    });

    // Auto-update vendor itemsSupplied if a specific vendor was chosen
    if (invoice.vendorId && categoriesWithQty.length > 0) {
      const vendor = vendors.find((v) => v.id === invoice.vendorId);
      if (vendor) {
        const vItems = vendor.itemsSupplied || vendor.categories || [];
        // Check for duplicates properly (items can be strings or objects {name, uom})
        const existingItemNames = vItems.map((item) =>
          typeof item === "string"
            ? item.toLowerCase()
            : (item.name || "").toLowerCase(),
        );
        const missingCats = categoriesWithQty.filter(
          (cat) => !existingItemNames.includes(cat.toLowerCase()),
        );
        if (missingCats.length > 0) {
          const newItems = missingCats.map((cat) => ({
            name: cat,
            uom: "pcs",
          }));
          const updatedVendor = {
            ...vendor,
            itemsSupplied: [...new Set([...vItems, ...newItems])],
          };
          const updatedVendors = vendors.map((v) =>
            v.id === vendor.id ? updatedVendor : v,
          );
          if (typeof window !== "undefined") {
            try {
              localStorage.setItem(
                "pmp_vendors",
                JSON.stringify(updatedVendors),
              );
            } catch {}
          }
        }
      }
    }

    onSave(siEntries, "write_off");
    onClose();
  };

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="modal-overlay">
      <style>{`
        @media (max-width: 768px) {
          .si-wizard-grid { grid-template-columns: 1fr !important; }
          .si-wizard-panel { padding: 1rem !important; }
        }
      `}</style>

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
        {/* ── Header ──────────────────────────────────────────────────────── */}
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
                Procurement
              </div>
              <h2
                style={{
                  fontSize: "1.5rem",
                  fontWeight: 700,
                  color: "#E5E2E1",
                  margin: 0,
                }}
              >
                Manual Stock-In Entry
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

          {/* Step Indicator */}
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
            {/* track lines */}
            {[
              { left: "calc(16.67%)", fill: step1Valid },
              { left: "calc(50%)", fill: step2Valid() },
              { left: "calc(83.33%)", fill: step3Valid() },
            ].map(({ left, fill }, i) => (
              <React.Fragment key={i}>
                <div
                  style={{
                    position: "absolute",
                    top: "14px",
                    left,
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
                    left,
                    width: fill ? "calc(33.33%)" : "0%",
                    height: "2px",
                    background:
                      "linear-gradient(135deg, #FFDF9F 0%, #D4A843 100%)",
                    zIndex: 1,
                    borderRadius: "2px",
                    transition: "width 0.4s cubic-bezier(0.4,0,0.2,1)",
                    boxShadow: fill ? "0 0 12px rgba(212,168,67,0.4)" : "none",
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

        {/* ── STEP 1: Select Materials ─────────────────────────────────────── */}
        {step === 1 && (
          <div style={{ flex: 1, overflowY: "auto", padding: "1.5rem 2rem" }}>
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
                placeholder="Search materials by name, SKU, or category..."
                style={{
                  width: "100%",
                  padding: "0.75rem 1rem 0.75rem 2.5rem",
                  background: "rgba(255,255,255,0.06)",
                  border: "1px solid var(--border)",
                  borderRadius: "10px",
                  color: "var(--white)",
                  fontSize: "0.875rem",
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
            </div>
            {errors.step1 && (
              <p
                style={{
                  fontSize: "0.72rem",
                  color: "#f87171",
                  marginBottom: "0.75rem",
                }}
              >
                {errors.step1}
              </p>
            )}

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
                  {selectableMaterials.length === 0
                    ? "No materials available. Add materials in Master Data first."
                    : `No results for "${search}"`}
                </div>
              ) : (
                groupedByCategory.map((group) => (
                  <div key={group.category}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.75rem",
                        padding: "0.875rem 1rem",
                        background: "rgba(255,255,255,0.04)",
                        borderBottom: "1px solid rgba(255,255,255,0.05)",
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
                    {group.materials.map((m, idx) => {
                      const isSelected = selectedMaterials.some(
                        (p) => p.id === m.id,
                      );
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
                                {
                                  materials.filter((c) => c.parentId === m.id)
                                    .length
                                }{" "}
                                variants
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
                ))
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
                Select one or more materials to receive.
              </p>
            )}
          </div>
        )}

        {/* ── STEP 2: Stock Entry ──────────────────────────────────────────── */}
        {step === 2 && (
          <div
            className="si-wizard-grid"
            style={{
              flex: 1,
              display: "grid",
              gridTemplateColumns: "1fr 420px",
              minHeight: 0,
              borderTop: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            {/* LEFT — Stock Entry */}
            <div
              className="si-wizard-panel"
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

              {errors.step2 && (
                <p
                  style={{
                    fontSize: "0.72rem",
                    color: "#f87171",
                    marginBottom: "0.75rem",
                  }}
                >
                  {errors.step2}
                </p>
              )}

              {selectedMaterials.map((mat, mIdx) => {
                const rows = stockRowsByMaterial[mat.id] || [];
                const matReceived = rows.reduce(
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
                    {/* Material header */}
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
                          flexShrink: 0,
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
                          style={{ fontSize: "0.65rem", color: "var(--gray)" }}
                        >
                          {rows.length} Variant{rows.length !== 1 ? "s" : ""}
                          {matReceived > 0 &&
                            ` • ${matReceived} ${rows[0]?.uom || "pcs"}`}
                        </div>
                      </div>
                    </div>

                    {/* Variant table — Qty + Damaged + Min Stock */}
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
                        style={{ width: "100%", borderCollapse: "collapse" }}
                      >
                        <thead>
                          <tr
                            style={{
                              background: "rgba(0,0,0,0.2)",
                              borderBottom: "1px solid rgba(255,255,255,0.08)",
                            }}
                          >
                            <th
                              style={{
                                padding: "0.875rem 1rem",
                                textAlign: "left",
                                fontSize: "0.6rem",
                                fontWeight: 700,
                                color: "var(--gray)",
                                textTransform: "uppercase",
                                letterSpacing: "0.08em",
                              }}
                            >
                              Item
                            </th>
                            <th
                              style={{
                                padding: "0.875rem 0.75rem",
                                textAlign: "center",
                                fontSize: "0.6rem",
                                fontWeight: 700,
                                color: "var(--gray)",
                                textTransform: "uppercase",
                                letterSpacing: "0.08em",
                                width: "110px",
                              }}
                            >
                              Min Stock Level
                            </th>
                            <th
                              style={{
                                padding: "0.875rem 0.75rem",
                                textAlign: "center",
                                fontSize: "0.6rem",
                                fontWeight: 700,
                                color: "var(--gray)",
                                textTransform: "uppercase",
                                letterSpacing: "0.08em",
                                width: "130px",
                              }}
                            >
                              Qty Received
                            </th>
                            <th
                              style={{
                                padding: "0.875rem 0.75rem",
                                textAlign: "center",
                                fontSize: "0.6rem",
                                fontWeight: 700,
                                color: "var(--gray)",
                                textTransform: "uppercase",
                                letterSpacing: "0.08em",
                                width: "110px",
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
                                      background: "rgba(255,255,255,0.06)",
                                      border: "1px solid rgba(255,255,255,0.1)",
                                      borderRadius: "8px",
                                      color: "#E5E2E1",
                                      fontWeight: 600,
                                      padding: "0.5rem",
                                      fontSize: "0.85rem",
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
                                      updateStockRow(mat.id, idx, "qty", val)
                                    }
                                    min={0}
                                    max={99999}
                                    placeholder="0"
                                    style={{
                                      textAlign: "center",
                                      width: "80px",
                                      background: "rgba(255,255,255,0.06)",
                                      border: "1px solid rgba(255,255,255,0.1)",
                                      borderRadius: "8px",
                                      color: q > 0 ? "#D4A843" : "var(--gray)",
                                      fontWeight: 700,
                                      padding: "0.5rem",
                                      fontSize: "0.9rem",
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
                                    qtyValue={row.qty}
                                    style={{
                                      textAlign: "center",
                                      width: "80px",
                                      background: "rgba(255,255,255,0.06)",
                                      border: "1px solid rgba(255,255,255,0.1)",
                                      borderRadius: "8px",
                                      color: d > 0 ? "#F87171" : "var(--gray)",
                                      fontWeight: 600,
                                      padding: "0.5rem",
                                      fontSize: "0.9rem",
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
                    Stock Wastage – Damaged Upon Arrival
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

            {/* RIGHT — Invoice Preview placeholder */}
            <div
              className="si-wizard-panel"
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
                      Reference / OR Number
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

        {/* ── STEP 3: Stock Summary (left) + Invoice Details (right) ───────── */}
        {step === 3 && (
          <div
            className="si-wizard-grid"
            style={{
              flex: 1,
              display: "grid",
              gridTemplateColumns: "1fr 420px",
              minHeight: 0,
              borderTop: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            {/* LEFT — Stock Summary (read-only) */}
            <div
              className="si-wizard-panel"
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
                const matDmg = rows.reduce(
                  (s, r) => s + (parseInt(r.damaged) || 0),
                  0,
                );
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
                              borderBottom: "1px solid rgba(255,255,255,0.06)",
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
                              Dmg
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
                                  {q}
                                </td>
                                <td
                                  style={{
                                    padding: "0.625rem 0.5rem",
                                    textAlign: "center",
                                    color: d > 0 ? "#F87171" : "var(--gray)",
                                    fontWeight: 600,
                                  }}
                                >
                                  {d}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* Per-material good/damaged mini cards — only if >1 materials have qty */}
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
                            Damaged
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

              {/* Overall summary cards */}
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

            {/* RIGHT — Invoice Details (editable) */}
            <div
              className="si-wizard-panel"
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
                {/* Supplier — smart filtered combobox */}
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
                    Supplier
                  </label>
                  <SupplierCombobox
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
                    onViewCatalog={(vendor) => setCatalogSupplier(vendor)}
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
                      Showing suppliers for:{" "}
                      <span style={{ color: "#D4A843", fontWeight: 600 }}>
                        {categoriesWithQty.join(", ")}
                      </span>
                    </div>
                  )}
                </div>

                {/* Reference No + Date */}
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
                      Reference / OR Number{" "}
                      <span style={{ color: "#ef4444" }}>*</span>
                    </label>
                    <input
                      type="text"
                      value={invoice.referenceNo}
                      onChange={(e) =>
                        setInvoice((p) => ({
                          ...p,
                          referenceNo: e.target.value.slice(0, 50),
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
                      Delivery Date <span style={{ color: "#ef4444" }}>*</span>
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
                          {/* Cost mode toggle */}
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              padding: "0.5rem 0.75rem",
                              background: "rgba(0,0,0,0.15)",
                              borderBottom: "1px solid rgba(255,255,255,0.04)",
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
                                      mode === val ? "#D4A843" : "transparent",
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
                            /* Total mode — single amount input */
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
                            /* Unit mode — per-variant cost */
                            <>
                              {/* Apply-all row — only when >1 variant */}
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
                                      value={applyAllCost}
                                      onChange={(val) => setApplyAllCost(val)}
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
                                      const updated = allMatRows.map((r) => ({
                                        ...r,
                                        unitCost: applyAllCost,
                                      }));
                                      setStockRowsByMaterial((p) => ({
                                        ...p,
                                        [mat.id]: updated,
                                      }));
                                    }}
                                    style={{
                                      background: "rgba(212,168,67,0.15)",
                                      border: "1px solid rgba(212,168,67,0.4)",
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

                              {/* Per-variant rows */}
                              {rows.map((row, idx) => {
                                const qty = parseInt(row.qty) || 0;
                                const cost = parseFloat(row.unitCost) || 0;
                                const subtotal = qty * cost;
                                // Find original index in full rows array
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
                                        onChange={(val) => {
                                          if (origIdx >= 0)
                                            updateStockRow(
                                              mat.id,
                                              origIdx,
                                              "unitCost",
                                              val,
                                            );
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

                {/* Notes */}
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
                    Notes <span style={{ fontWeight: 400 }}>(Optional)</span>
                  </label>
                  <textarea
                    value={invoice.notes}
                    onChange={(e) =>
                      setInvoice((p) => ({
                        ...p,
                        notes: e.target.value.slice(0, 500),
                      }))
                    }
                    placeholder="Optional notes..."
                    style={{
                      width: "100%",
                      padding: "0.65rem 0.875rem",
                      background: "rgba(255,255,255,0.06)",
                      border: "1px solid rgba(255,255,255,0.1)",
                      borderRadius: "8px",
                      color: "#E5E2E1",
                      fontSize: "0.8rem",
                      outline: "none",
                      resize: "vertical",
                      minHeight: "50px",
                      boxSizing: "border-box",
                    }}
                  />
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
                        ? "Receipt uploaded ✓"
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

                {/* Receipt Summary */}
                {totalInvoiceValue > 0 && (
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

                    {/* Per-material breakdown — only if >1 materials */}
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
                          let subtotal = 0;
                          let displayUnit = null;
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
          </div>
        )}

        {/* ── Footer ──────────────────────────────────────────────────────── */}
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
                onClick={goBack}
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
            {/* Footer totals on step 3 */}
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
              >
                Save Stock-In
              </button>
            )}
          </div>
        </div>
      </div>

      <InfoModal
        isOpen={!!infoModal}
        onClose={() => setInfoModal(null)}
        title={infoModal?.title || ""}
        message={infoModal?.message || ""}
      />
      <AddVendorQuickModal
        isOpen={showAddVendor}
        onClose={() => setShowAddVendor(false)}
        onAdd={(data) => {
          const newVendor = {
            ...data,
            id: crypto.randomUUID(),
            createdAt: new Date().toISOString(),
          };
          // Persist to localStorage so parent can pick it up
          if (typeof window !== "undefined") {
            try {
              const existing = JSON.parse(
                localStorage.getItem("pmp_vendors") || "[]",
              );
              localStorage.setItem(
                "pmp_vendors",
                JSON.stringify([...existing, newVendor]),
              );
            } catch {}
          }
          setInvoice((p) => ({
            ...p,
            vendorId: newVendor.id,
            vendorName: newVendor.name,
          }));
          setShowAddVendor(false);
        }}
        existingVendors={vendors}
        selectedCategories={selectedCategories}
      />
      <SupplierCatalogModal
        isOpen={!!catalogSupplier}
        onClose={() => setCatalogSupplier(null)}
        supplier={catalogSupplier}
        batches={allBatches}
        materials={materials}
      />
    </div>
  );
}
