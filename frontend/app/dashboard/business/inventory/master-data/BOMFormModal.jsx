import CustomDropdown from "@/app/components/CustomDropdown";
import { useEffect, useMemo, useState } from "react";

function PlusIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M12 8v8M8 12h8" />
    </svg>
  );
}
function TrashRowIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
    </svg>
  );
}
function CloseIcon({ size = 24 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  );
}

const labelStyle = {
  fontSize: "0.65rem",
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.15em",
  color: "rgba(229,226,225,0.6)",
  display: "block",
  marginBottom: "0.5rem",
};
const inputStyle = {
  width: "100%",
  background: "rgba(255,255,255,0.06)",
  borderRadius: "12px",
  padding: "0.75rem 1rem",
  color: "#E5E2E1",
  fontSize: "0.875rem",
  outline: "none",
  boxSizing: "border-box",
};
const errorStyle = {
  fontSize: "0.72rem",
  color: "#ef4444",
  marginTop: "0.25rem",
  display: "block",
};
const ghostBtnStyle = {
  display: "flex",
  alignItems: "center",
  gap: "0.35rem",
  borderRadius: "6px",
  padding: "0.3rem 0.75rem",
  color: "#D4A843",
  fontSize: "0.7rem",
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.1em",
  cursor: "pointer",
  transition: "all 0.15s",
};

export default function BOMFormModal({
  bom,
  materials,
  onClose,
  onSave,
  onSaveBatch,
}) {
  const [form, setForm] = useState({
    productName: "",
    productGroupName: "",
    components: [],
  });
  const [errors, setErrors] = useState({});
  const [showVariantPicker, setShowVariantPicker] = useState(false);
  const [selectedParentId, setSelectedParentId] = useState("");
  const [checkedVariantIds, setCheckedVariantIds] = useState(new Set());
  const [variantQty, setVariantQty] = useState(1);

  useEffect(() => {
    if (bom)
      setForm({
        productName: bom.productName || "",
        productGroupName: bom.productGroupName || "",
        components: bom.components || [],
      });
  }, [bom]);

  useEffect(() => {
    setCheckedVariantIds(new Set());
  }, [selectedParentId]);

  const addComponent = () =>
    setForm((p) => ({
      ...p,
      components: [...p.components, { inventoryId: "", qty: 1 }],
    }));
  const removeComponent = (idx) =>
    setForm((p) => ({
      ...p,
      components: p.components.filter((_, i) => i !== idx),
    }));
  const updateComponent = (idx, field, value) =>
    setForm((p) => {
      const c = [...p.components];
      c[idx] = { ...c[idx], [field]: value };
      return { ...p, components: c };
    });

  const sharedCost = useMemo(
    () =>
      form.components.reduce((sum, c) => {
        const mat = materials.find((m) => m._id === c.inventoryId);
        // Use FIFO cost - what you'll actually pay when consuming from oldest stock
        if (!mat || !mat.batches || mat.batches.length === 0) {
          return sum + (mat?.baseCost || mat?.averageCost || 0) * (c.qty || 0);
        }

        const activeBatches = mat.batches
          .filter((b) => (b.remainingQty || 0) > 0)
          .sort((a, b) => new Date(a.dateReceived) - new Date(b.dateReceived));
        if (activeBatches.length === 0) {
          return sum + (mat?.baseCost || mat?.averageCost || 0) * (c.qty || 0);
        }

        // Simulate FIFO consumption
        let remaining = c.qty || 0;
        let batchCost = 0;

        for (const batch of activeBatches) {
          if (remaining <= 0) break;
          const take = Math.min(remaining, batch.remainingQty || 0);
          batchCost += take * (batch.unitCost || 0);
          remaining -= take;
        }

        // If backorder, use average for remaining
        if (remaining > 0) {
          const totalQty = activeBatches.reduce(
            (s, b) => s + (b.remainingQty || 0),
            0,
          );
          const totalValue = activeBatches.reduce(
            (s, b) => s + (b.remainingQty || 0) * (b.unitCost || 0),
            0,
          );
          const avgCost = totalQty > 0 ? totalValue / totalQty : 0;
          batchCost += remaining * avgCost;
        }

        return sum + batchCost;
      }, 0),
    [form.components, materials],
  );

  const parentProducts = useMemo(
    () =>
      materials
        .filter((m) => m.hasVariants && !m.parentId)
        .map((m) => ({
          id: m._id,
          name: m.name,
          children: materials.filter((c) => c.parentId === m._id),
        })),
    [materials],
  );

  const currentVariants = useMemo(() => {
    if (!selectedParentId) return [];
    return (
      parentProducts.find((p) => p.id === selectedParentId)?.children || []
    );
  }, [selectedParentId, parentProducts]);

  const checkedVariants = useMemo(
    () => currentVariants.filter((v) => checkedVariantIds.has(v.id)),
    [currentVariants, checkedVariantIds],
  );

  const variantCostPreview = useMemo(
    () =>
      checkedVariants.map((v) => ({
        ...v,
        bomCost: sharedCost + (v.baseCost || v.averageCost || 0) * variantQty,
      })),
    [checkedVariants, sharedCost, variantQty],
  );

  const batchTotal = useMemo(
    () => variantCostPreview.reduce((s, v) => s + v.bomCost, 0),
    [variantCostPreview],
  );

  const toggleVariant = (id) =>
    setCheckedVariantIds((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  const selectAll = () =>
    setCheckedVariantIds(new Set(currentVariants.map((v) => v.id)));
  const deselectAll = () => setCheckedVariantIds(new Set());

  // Builds BOM array from a given variant list — used by both buttons
  const buildBOMs = (variants) => {
    const productGroupName = form.productGroupName.trim();
    const sharedComponents = form.components.filter((c) => c.inventoryId);
    return variants.map((v, i) => {
      // Extract just the variant-specific part (e.g., "Magic Mugs 11oz" from "Mugs - Magic Mugs 11oz")
      const variantNameOnly = v.name.includes(" - ")
        ? v.name.split(" - ").slice(1).join(" - ")
        : v.name;

      return {
        id: `bom-${Date.now()}-${i}`,
        productName: `${productGroupName} - ${variantNameOnly}`,
        productGroupName: productGroupName,
        sku: "",
        variantGroup: productGroupName,
        variantId: v.id,
        components: [
          ...sharedComponents,
          { inventoryId: v._id, qty: variantQty },
        ],
        createdAt: new Date().toISOString(),
      };
    });
  };

  const dispatchBatch = (boms) => {
    if (typeof onSaveBatch === "function") {
      onSaveBatch(boms);
    } else {
      boms.forEach((b) => onSave(b, true));
      onClose();
    }
    setShowVariantPicker(false);
    setSelectedParentId("");
    setCheckedVariantIds(new Set());
    setVariantQty(1);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const errs = {};
    if (!form.productGroupName.trim())
      errs.productGroupName = "Product group name is required";
    if (form.components.length === 0)
      errs.components = "Add at least one component";
    if (form.components.some((c) => !c.inventoryId))
      errs.material = "Select a material for every row";
    if (Object.keys(errs).length) {
      setErrors(errs);
      return;
    }
    setErrors({});
    onSave({ ...bom, ...form });
  };

  const selectedMaterialIds = form.components
    .filter((c) => c.inventoryId)
    .map((c) => c.inventoryId);

  // Get variant IDs to exclude from shared materials when variant picker is open
  const variantIdsToExclude = useMemo(() => {
    if (!showVariantPicker || !selectedParentId) return [];
    return currentVariants.map((v) => v.id);
  }, [showVariantPicker, selectedParentId, currentVariants]);

  const availableMaterials = useMemo(
    () =>
      materials
        .filter((m) => (!m.parentId && !m.hasVariants) || m.parentId)
        .filter((m) => !selectedMaterialIds.includes(m._id))
        .filter((m) => !variantIdsToExclude.includes(m._id)) // Exclude variants from shared materials
        .map((m) => {
          const p = m.parentId
            ? materials.find((x) => x._id === m.parentId)
            : null;
          return { value: m._id, label: `${m.name}${p ? ` (${p.name})` : ""}` };
        }),
    [materials, selectedMaterialIds, variantIdsToExclude],
  );

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: "680px",
          width: "95%",
          borderRadius: "12px",
          overflow: "hidden",
          padding: 0,
          display: "flex",
          flexDirection: "column",
          maxHeight: "90vh",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "2rem 2rem 1.5rem",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
          }}
        >
          <div>
            <span
              style={{
                fontSize: "0.6rem",
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.2em",
                color: "#D4A843",
                display: "block",
                marginBottom: "0.25rem",
              }}
            >
              {bom?.productName?.endsWith(" (Copy)")
                ? "Duplicate Configuration"
                : bom
                  ? "Edit Configuration"
                  : "New Configuration"}
            </span>
            <h2
              style={{
                fontSize: "1.5rem",
                fontWeight: 800,
                color: "#E5E2E1",
                letterSpacing: "-0.02em",
                margin: 0,
              }}
            >
              {bom?.productName?.endsWith(" (Copy)")
                ? "Duplicate BOM"
                : bom
                  ? "Edit BOM"
                  : "Create New Product BOM"}
            </h2>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              color: "rgba(229,226,225,0.4)",
              cursor: "pointer",
              padding: "0.25rem",
              lineHeight: 0,
            }}
          >
            <CloseIcon />
          </button>
        </div>

        <form
          onSubmit={handleSubmit}
          style={{
            display: "flex",
            flexDirection: "column",
            flex: 1,
            overflow: "hidden",
          }}
        >
          <div style={{ padding: "0 2rem", overflowY: "auto", flex: 1 }}>
            {/* Product Group */}
            <div style={{ marginBottom: "2rem" }}>
              <label style={labelStyle}>Product Group Name</label>
              <input
                type="text"
                value={form.productGroupName}
                onChange={(e) => {
                  setForm((p) => ({
                    ...p,
                    productGroupName: e.target.value.slice(0, 100),
                  }));
                  if (errors.productGroupName)
                    setErrors((er) => ({ ...er, productGroupName: "" }));
                }}
                placeholder="e.g. Custom Mugs, T-Shirts, Bags"
                maxLength={100}
                style={{
                  ...inputStyle,
                  border: errors.productGroupName
                    ? "1px solid rgba(239,68,68,0.5)"
                    : "none",
                }}
              />
              <span
                style={{
                  fontSize: "0.6rem",
                  color: "rgba(229,226,225,0.35)",
                  marginTop: "0.25rem",
                  display: "block",
                }}
              >
                Group related BOMs together (e.g., all mug variants)
              </span>
              {errors.productGroupName && (
                <span style={errorStyle}>{errors.productGroupName}</span>
              )}
            </div>

            {/* Shared cost card */}
            {form.components.length > 0 && (
              <div
                style={{
                  background:
                    "linear-gradient(135deg,rgba(255,255,255,0.06) 0%,rgba(255,255,255,0.03) 100%)",
                  borderRadius: "12px",
                  padding: "1.25rem 1.5rem",
                  marginBottom: "2rem",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div>
                  <p
                    style={{
                      fontSize: "0.6rem",
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: "0.15em",
                      color: "rgba(229,226,225,0.5)",
                      margin: "0 0 0.25rem 0",
                    }}
                  >
                    Shared Cost
                  </p>
                  <span
                    style={{
                      fontSize: "2rem",
                      fontWeight: 800,
                      color: "#D4A843",
                      letterSpacing: "-0.03em",
                    }}
                  >
                    ₱
                    {sharedCost.toLocaleString("en-PH", {
                      minimumFractionDigits: 2,
                    })}
                  </span>
                  <span
                    style={{
                      fontSize: "0.75rem",
                      color: "rgba(229,226,225,0.4)",
                      marginLeft: "0.5rem",
                    }}
                  >
                    per unit
                  </span>
                </div>
                <div style={{ textAlign: "right" }}>
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "0.35rem",
                      padding: "0.25rem 0.75rem",
                      borderRadius: "99px",
                      background: "rgba(212,168,67,0.1)",
                      color: "#D4A843",
                      fontSize: "0.7rem",
                      fontWeight: 700,
                    }}
                  >
                    <span
                      style={{
                        width: "6px",
                        height: "6px",
                        borderRadius: "50%",
                        background: "#D4A843",
                      }}
                    />
                    Shared Materials
                  </span>
                  <p
                    style={{
                      fontSize: "0.6rem",
                      color: "rgba(229,226,225,0.35)",
                      fontStyle: "italic",
                      margin: "0.4rem 0 0 0",
                    }}
                  >
                    {form.components.length} component
                    {form.components.length > 1 ? "s" : ""} · variant cost added
                    per BOM
                  </p>
                </div>
              </div>
            )}

            {/* Section: Shared Materials */}
            <div style={{ marginBottom: "1.5rem" }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "1rem",
                }}
              >
                <div>
                  <h3
                    style={{
                      fontSize: "1rem",
                      fontWeight: 800,
                      color: "#E5E2E1",
                      margin: "0 0 0.1rem 0",
                    }}
                  >
                    Shared Materials
                  </h3>
                  <p
                    style={{
                      fontSize: "0.6rem",
                      color: "rgba(229,226,225,0.35)",
                      margin: 0,
                    }}
                  >
                    Ink, packaging, transfer paper — same across all variants
                  </p>
                </div>
                <div
                  style={{
                    display: "flex",
                    gap: "0.5rem",
                    alignItems: "center",
                    flexWrap: "wrap",
                    justifyContent: "flex-end",
                  }}
                >
                  {errors.material && (
                    <span style={errorStyle}>{errors.material}</span>
                  )}
                  {errors.components && (
                    <span style={errorStyle}>{errors.components}</span>
                  )}
                  {onSaveBatch && (
                    <button
                      type="button"
                      onClick={() => setShowVariantPicker((p) => !p)}
                      style={{
                        ...ghostBtnStyle,
                        background: showVariantPicker
                          ? "rgba(212,168,67,0.1)"
                          : "none",
                        border: showVariantPicker
                          ? "1px solid rgba(212,168,67,0.3)"
                          : "1px solid rgba(212,168,67,0.2)",
                      }}
                    >
                      Add All Variants
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={addComponent}
                    style={{ ...ghostBtnStyle, border: "none" }}
                  >
                    <PlusIcon /> Add Material
                  </button>
                </div>
              </div>

              {/* ── Variant Picker Panel ───────────────────────────────────────────
                  Handles: no-variant (skip), single-dim, and multi-dim products.
                  Multi-dim combos (e.g. Small White) are stored as flat children
                  in Material Master, so we treat them identically to single-dim.
                  "Add All"   → generates BOMs for EVERY child of selected parent.
                  Checkboxes  → user picks which children get their own BOM.
              ──────────────────────────────────────────────────────────────────── */}
              {showVariantPicker && (
                <div
                  style={{
                    background: "rgba(212,168,67,0.04)",
                    border: "1px solid rgba(212,168,67,0.2)",
                    borderRadius: "12px",
                    padding: "1.25rem",
                    marginBottom: "1rem",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      marginBottom: "1rem",
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontSize: "0.75rem",
                          fontWeight: 700,
                          color: "#D4A843",
                        }}
                      >
                        Generate Separate BOMs — One per Variant
                      </div>
                      <div
                        style={{
                          fontSize: "0.62rem",
                          color: "rgba(229,226,225,0.4)",
                          marginTop: "0.2rem",
                        }}
                      >
                        Shared materials above are included in every generated
                        BOM
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowVariantPicker(false)}
                      style={{
                        background: "none",
                        border: "none",
                        color: "rgba(229,226,225,0.4)",
                        cursor: "pointer",
                        padding: "0.25rem",
                        lineHeight: 0,
                      }}
                    >
                      <CloseIcon size={18} />
                    </button>
                  </div>

                  {/* Parent group dropdown */}
                  <div style={{ marginBottom: "1rem" }}>
                    <CustomDropdown
                      value={selectedParentId}
                      onChange={setSelectedParentId}
                      options={[
                        { value: "", label: "Select product group…" },
                        ...parentProducts.map((p) => ({
                          value: p.id,
                          label: `${p.name} (${p.children.length} variant${p.children.length !== 1 ? "s" : ""})`,
                        })),
                      ]}
                      placeholder="Select product group…"
                    />
                  </div>

                  {/* Variant list with checkboxes */}
                  {currentVariants.length > 0 && (
                    <>
                      {/* Shared cost indicator */}
                      {form.components.length > 0 && (
                        <div
                          style={{
                            fontSize: "0.65rem",
                            color: "rgba(212,168,67,0.8)",
                            background: "rgba(212,168,67,0.06)",
                            borderRadius: "6px",
                            padding: "0.4rem 0.75rem",
                            marginBottom: "0.75rem",
                          }}
                        >
                          + ₱
                          {sharedCost.toLocaleString("en-PH", {
                            minimumFractionDigits: 2,
                          })}{" "}
                          shared cost will be added to each BOM
                        </div>
                      )}

                      {/* Select / Deselect controls */}
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          marginBottom: "0.6rem",
                        }}
                      >
                        <div
                          style={{
                            fontSize: "0.65rem",
                            color: "rgba(229,226,225,0.5)",
                            fontWeight: 600,
                          }}
                        >
                          {checkedVariantIds.size} of {currentVariants.length}{" "}
                          selected
                        </div>
                        <div style={{ display: "flex", gap: "0.5rem" }}>
                          {[
                            ["Select All", selectAll, "#D4A843"],
                            [
                              "Deselect All",
                              deselectAll,
                              "rgba(229,226,225,0.5)",
                            ],
                          ].map(([label, fn, color]) => (
                            <button
                              key={label}
                              type="button"
                              onClick={fn}
                              style={{
                                background: "none",
                                border: "none",
                                fontSize: "0.65rem",
                                fontWeight: 700,
                                color,
                                cursor: "pointer",
                                padding: "0.1rem 0.4rem",
                                textTransform: "uppercase",
                                letterSpacing: "0.08em",
                              }}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Checkbox rows */}
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: "0.3rem",
                          maxHeight: "180px",
                          overflowY: "auto",
                          marginBottom: "1rem",
                        }}
                      >
                        {currentVariants.map((v) => {
                          const isChecked = checkedVariantIds.has(v.id);
                          const bomCost =
                            sharedCost +
                            (v.baseCost || v.averageCost || 0) * variantQty;
                          return (
                            <div
                              key={v.id}
                              onClick={() => toggleVariant(v.id)}
                              style={{
                                display: "grid",
                                gridTemplateColumns: "20px 1fr auto auto",
                                alignItems: "center",
                                gap: "0.6rem",
                                padding: "0.5rem 0.75rem",
                                background: isChecked
                                  ? "rgba(212,168,67,0.06)"
                                  : "rgba(255,255,255,0.02)",
                                border: `1px solid ${isChecked ? "rgba(212,168,67,0.2)" : "rgba(255,255,255,0.05)"}`,
                                borderRadius: "8px",
                                cursor: "pointer",
                                transition: "all 0.15s",
                              }}
                            >
                              {/* Custom checkbox */}
                              <div
                                style={{
                                  width: "16px",
                                  height: "16px",
                                  borderRadius: "4px",
                                  border: `2px solid ${isChecked ? "#D4A843" : "rgba(229,226,225,0.2)"}`,
                                  background: isChecked
                                    ? "#D4A843"
                                    : "transparent",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  flexShrink: 0,
                                  transition: "all 0.15s",
                                }}
                              >
                                {isChecked && (
                                  <svg
                                    width="10"
                                    height="10"
                                    viewBox="0 0 12 12"
                                    fill="none"
                                  >
                                    <path
                                      d="M2 6l3 3 5-5"
                                      stroke="#000"
                                      strokeWidth="2"
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                    />
                                  </svg>
                                )}
                              </div>
                              <span
                                style={{
                                  fontSize: "0.8rem",
                                  fontWeight: 500,
                                  color: isChecked
                                    ? "#E5E2E1"
                                    : "rgba(229,226,225,0.6)",
                                }}
                              >
                                {v.name}
                              </span>
                              <span
                                style={{
                                  fontSize: "0.65rem",
                                  color: "var(--gray)",
                                  fontWeight: 600,
                                }}
                              >
                                {v.stockQty || 0} pcs
                              </span>
                              <span
                                style={{
                                  fontSize: "0.75rem",
                                  color: isChecked
                                    ? "#D4A843"
                                    : "rgba(212,168,67,0.35)",
                                  fontWeight: 700,
                                  fontFamily: "monospace",
                                  minWidth: "70px",
                                  textAlign: "right",
                                }}
                              >
                                ₱
                                {bomCost.toLocaleString("en-PH", {
                                  minimumFractionDigits: 2,
                                })}
                              </span>
                            </div>
                          );
                        })}
                      </div>

                      {/* Qty row */}
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "0.75rem",
                          marginBottom: "0.75rem",
                        }}
                      >
                        <span
                          style={{
                            fontSize: "0.7rem",
                            color: "rgba(229,226,225,0.6)",
                            fontWeight: 600,
                          }}
                        >
                          Qty per variant:
                        </span>
                        <input
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          value={variantQty}
                          onChange={(e) => {
                            const v = e.target.value;
                            if (v === "" || /^\d+$/.test(v))
                              setVariantQty(
                                v === "" ? 1 : Math.max(1, parseInt(v, 10)),
                              );
                          }}
                          onClick={(e) => e.stopPropagation()}
                          style={{
                            width: "56px",
                            background: "rgba(255,255,255,0.06)",
                            border: "none",
                            borderRadius: "8px",
                            padding: "0.4rem 0.5rem",
                            color: "#E5E2E1",
                            fontSize: "0.85rem",
                            textAlign: "center",
                            fontWeight: 700,
                            outline: "none",
                          }}
                        />
                        <span
                          style={{
                            fontSize: "0.65rem",
                            color: "rgba(229,226,225,0.3)",
                          }}
                        >
                          per variant
                        </span>
                      </div>

                      {/* Summary pill */}
                      {checkedVariantIds.size > 0 && (
                        <div
                          style={{
                            fontSize: "0.65rem",
                            color: "rgba(212,168,67,0.8)",
                            background: "rgba(212,168,67,0.06)",
                            borderRadius: "6px",
                            padding: "0.4rem 0.75rem",
                            marginBottom: "0.75rem",
                          }}
                        >
                          {checkedVariantIds.size} BOMs · combined cost ₱
                          {batchTotal.toLocaleString("en-PH", {
                            minimumFractionDigits: 2,
                          })}
                        </div>
                      )}
                    </>
                  )}

                  {currentVariants.length === 0 && selectedParentId && (
                    <div
                      style={{
                        padding: "1rem",
                        textAlign: "center",
                        color: "var(--gray)",
                        fontSize: "0.8rem",
                      }}
                    >
                      No variants found for this product.
                    </div>
                  )}
                </div>
              )}

              {/* Shared material rows */}
              {form.components.length === 0 && !showVariantPicker ? (
                <div
                  style={{
                    padding: "2rem",
                    textAlign: "center",
                    color: "var(--gray)",
                    fontSize: "0.8rem",
                    background: "rgba(255,255,255,0.02)",
                    borderRadius: "12px",
                    border: "1px dashed rgba(255,255,255,0.08)",
                  }}
                >
                  No shared materials yet. Add ink, packaging, transfer paper,
                  etc.
                </div>
              ) : (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.5rem",
                  }}
                >
                  {form.components.map((comp, idx) => {
                    const selectedMat = materials.find(
                      (m) => m._id === comp.inventoryId,
                    );
                    const componentCost = selectedMat
                      ? (selectedMat.baseCost || selectedMat.averageCost || 0) *
                        (comp.qty || 0)
                      : 0;
                    const dropdownOptions = [
                      { value: "", label: "Search material…" },
                      ...(selectedMat
                        ? [{ value: selectedMat._id, label: selectedMat.name }]
                        : []),
                      ...availableMaterials,
                    ];
                    return (
                      <div
                        key={idx}
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1fr 72px 100px 36px",
                          gap: "0.75rem",
                          alignItems: "center",
                          padding: "0.875rem 1rem",
                          background: "rgba(14,14,14,0.5)",
                          borderRadius: "12px",
                        }}
                      >
                        <CustomDropdown
                          value={comp.inventoryId}
                          onChange={(val) => {
                            updateComponent(idx, "inventoryId", val);
                            if (errors.material)
                              setErrors((er) => ({ ...er, material: "" }));
                          }}
                          options={dropdownOptions}
                          placeholder="Search material…"
                        />
                        <div style={{ position: "relative" }}>
                          <input
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            value={comp.qty || ""}
                            onChange={(e) => {
                              const v = e.target.value;
                              if (v === "" || /^\d+$/.test(v))
                                updateComponent(
                                  idx,
                                  "qty",
                                  v === "" ? 0 : parseInt(v, 10),
                                );
                            }}
                            onKeyDown={(e) => {
                              if (["e", "E", "+", "-", "."].includes(e.key))
                                e.preventDefault();
                            }}
                            style={{
                              width: "100%",
                              background: "rgba(255,255,255,0.06)",
                              border: "none",
                              borderRadius: "8px",
                              padding: "0.625rem 0.5rem",
                              color: comp.qty > 0 ? "#E5E2E1" : "transparent",
                              fontSize: "0.85rem",
                              textAlign: "center",
                              fontWeight: 700,
                              outline: "none",
                              boxSizing: "border-box",
                            }}
                          />
                          {!comp.qty && (
                            <span
                              style={{
                                position: "absolute",
                                top: "50%",
                                left: "50%",
                                transform: "translate(-50%,-50%)",
                                color: "rgba(229,226,225,0.2)",
                                fontSize: "0.85rem",
                                fontWeight: 700,
                                pointerEvents: "none",
                              }}
                            >
                              0
                            </span>
                          )}
                        </div>
                        <div
                          style={{
                            textAlign: "right",
                            fontWeight: 800,
                            color: "#E5E2E1",
                            fontSize: "0.9rem",
                          }}
                        >
                          {componentCost > 0
                            ? `₱${componentCost.toLocaleString("en-PH", { minimumFractionDigits: 2 })}`
                            : "—"}
                        </div>
                        <button
                          type="button"
                          onClick={() => removeComponent(idx)}
                          style={{
                            background: "none",
                            border: "none",
                            color: "rgba(229,226,225,0.2)",
                            cursor: "pointer",
                            padding: "0.25rem",
                            lineHeight: 0,
                            transition: "color 0.15s",
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.color = "#ef4444";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.color =
                              "rgba(229,226,225,0.2)";
                          }}
                        >
                          <TrashRowIcon />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div
            style={{
              padding: "1.25rem 2rem",
              background: "rgba(255,255,255,0.03)",
              borderTop: "1px solid rgba(255,255,255,0.06)",
              display: "flex",
              justifyContent: "flex-end",
              alignItems: "center",
              gap: "1rem",
              flexShrink: 0,
            }}
          >
            <button
              type="button"
              onClick={onClose}
              style={{
                background: "none",
                border: "none",
                color: "rgba(229,226,225,0.6)",
                fontSize: "0.75rem",
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.15em",
                cursor: "pointer",
                padding: "0.625rem 1.5rem",
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                // If variants are selected, create BOMs for each
                if (checkedVariantIds.size > 0 && onSaveBatch) {
                  const newBOMs = buildBOMs(checkedVariants);
                  onSaveBatch(newBOMs);
                  onClose();
                  setShowVariantPicker(false);
                  setSelectedParentId("");
                  setCheckedVariantIds(new Set());
                  setVariantQty(1);
                } else {
                  // Normal single BOM save
                  const errs = {};
                  if (!form.productGroupName.trim())
                    errs.productGroupName = "Product group name is required";
                  if (form.components.length === 0)
                    errs.components = "Add at least one component";
                  if (form.components.some((c) => !c.inventoryId))
                    errs.material = "Select a material for every row";
                  if (Object.keys(errs).length) {
                    setErrors(errs);
                    return;
                  }
                  setErrors({});
                  onSave({ ...bom, ...form });
                }
              }}
              style={{
                background: "linear-gradient(135deg,#FFDF9F 0%,#D4A843 100%)",
                border: "none",
                borderRadius: "8px",
                color: "#000",
                fontSize: "0.8rem",
                fontWeight: 800,
                cursor: "pointer",
                padding: "0.625rem 2rem",
                boxShadow: "0 4px 12px rgba(212,168,67,0.2)",
              }}
            >
              {checkedVariantIds.size > 0
                ? `Create ${checkedVariantIds.size} BOM${checkedVariantIds.size > 1 ? "s" : ""}`
                : bom
                  ? "Save Changes"
                  : "Create BOM"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
