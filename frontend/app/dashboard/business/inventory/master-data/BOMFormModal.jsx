import CustomDropdown from "@/app/components/CustomDropdown";
import { useAuth } from "@/contexts/AuthContext";
import { useEffect, useMemo, useRef, useState } from "react";

function PlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 8v8M8 12h8" />
    </svg>
  );
}
function TrashRowIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
    </svg>
  );
}
function CloseIcon({ size = 24 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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
  background: "none",
  border: "1px solid rgba(212,168,67,0.2)",
  fontSize: "0.72rem",
  fontWeight: 700,
  cursor: "pointer",
  letterSpacing: "0.05em",
};

function CategoryCombobox({ value, onChange, options }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value || "");
  const ref = useRef(null);

  useEffect(() => { setQuery(value || ""); }, [value]);

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filtered = options.filter((o) =>
    o.toLowerCase().includes(query.toLowerCase())
  );
  const exactMatch = options.some((o) => o.toLowerCase() === query.toLowerCase());

  const select = (val) => {
    setQuery(val);
    onChange(val);
    setOpen(false);
  };

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <input
        type="text"
        value={query}
        placeholder="e.g. Mugs, Stickers, Badges"
        onChange={(e) => { setQuery(e.target.value); onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        style={{ ...inputStyle, border: "none" }}
      />
      {open && (filtered.length > 0 || (!exactMatch && query)) && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0,
          background: "var(--dark2,#1a1a1a)", border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: "10px", zIndex: 200, maxHeight: "180px", overflowY: "auto",
        }}>
          {filtered.map((opt) => (
            <button key={opt} type="button" onClick={() => select(opt)}
              style={{
                width: "100%", textAlign: "left", background: "none", border: "none",
                padding: "0.6rem 1rem", color: opt === value ? "#D4A843" : "#E5E2E1",
                fontSize: "0.85rem", cursor: "pointer", fontWeight: opt === value ? 700 : 400,
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.05)"}
              onMouseLeave={(e) => e.currentTarget.style.background = "none"}
            >
              {opt}
            </button>
          ))}
          {!exactMatch && query && (
            <button type="button" onClick={() => select(query)}
              style={{
                width: "100%", textAlign: "left", background: "none", border: "none",
                borderTop: filtered.length ? "1px solid rgba(255,255,255,0.06)" : "none",
                padding: "0.6rem 1rem", color: "#D4A843", fontSize: "0.8rem",
                cursor: "pointer", fontWeight: 700,
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = "rgba(212,168,67,0.06)"}
              onMouseLeave={(e) => e.currentTarget.style.background = "none"}
            >
              + Use &ldquo;{query}&rdquo; as new category
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function BOMFormModal({ bom, materials, units, categories = [], onClose, onSave }) {
  const { token } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [errors, setErrors] = useState({});

  const uomLabel = (code) => {
    if (!code) return "";
    if (!units || units.length === 0) return code;
    const u = units.find((u) => u.code === code);
    return u ? u.name : code;
  };

  const [form, setForm] = useState({
    productName: "",
    category: "",
    components: [],
  });

  useEffect(() => {
    if (bom) {
      setForm({
        productName: bom.productName || "",
        category: bom.category || "",
        components: (bom.components || []).map((c) => ({
          ...c,
          materialId: c.materialId ?? c.inventoryId ?? "",
        })),
      });
    }
  }, [bom]);

  const addComponent = () =>
    setForm((p) => ({ ...p, components: [...p.components, { materialId: "", qty: 1 }] }));
  const removeComponent = (idx) =>
    setForm((p) => ({ ...p, components: p.components.filter((_, i) => i !== idx) }));
  const updateComponent = (idx, field, value) =>
    setForm((p) => {
      const c = [...p.components];
      c[idx] = { ...c[idx], [field]: value };
      return { ...p, components: c };
    });

  const bomCost = useMemo(() => {
    return form.components.reduce((sum, c) => {
      const mat = materials.find((m) => m.id === c.materialId);
      if (!mat || !mat.batches || mat.batches.length === 0) {
        return sum + (mat?.baseCost || 0) * (c.qty || 0);
      }
      const getBatchQty = (b) =>
        b.remainingQty != null ? b.remainingQty : (b.goodQty ?? b.qtyGood ?? 0);
      const activeBatches = mat.batches
        .filter((b) => getBatchQty(b) > 0)
        .sort((a, b) => new Date(a.dateReceived) - new Date(b.dateReceived));
      if (activeBatches.length === 0) {
        return sum + (mat?.baseCost || 0) * (c.qty || 0);
      }
      let remaining = c.qty || 0;
      let cost = 0;
      for (const batch of activeBatches) {
        if (remaining <= 0) break;
        const take = Math.min(remaining, getBatchQty(batch));
        cost += take * (batch.unitCost || 0);
        remaining -= take;
      }
      if (remaining > 0) {
        const totalQty = activeBatches.reduce((s, b) => s + getBatchQty(b), 0);
        const totalVal = activeBatches.reduce((s, b) => s + getBatchQty(b) * (b.unitCost || 0), 0);
        cost += remaining * (totalQty > 0 ? totalVal / totalQty : 0);
      }
      return sum + cost;
    }, 0);
  }, [form.components, materials]);

  const selectedMaterialIds = form.components
    .filter((c) => c.materialId)
    .map((c) => c.materialId);

  const availableMaterials = useMemo(
    () =>
      materials
        .filter((m) => (!m.parentId && !m.hasVariants) || m.parentId)
        .filter((m) => !selectedMaterialIds.includes(m.id))
        .map((m) => {
          const p = m.parentId ? materials.find((x) => x.id === m.parentId) : null;
          return { value: m.id, label: `${m.name}${p ? ` (${p.name})` : ""}` };
        }),
    [materials, selectedMaterialIds],
  );

  const handleSave = async () => {
    if (isSubmitting) return;
    setSubmitError("");
    const errs = {};
    if (!form.productName.trim()) errs.productName = "Product name is required";
    if (!form.category.trim()) errs.category = "Category is required";
    if (form.components.some((c) => !c.materialId)) errs.material = "Select a material for every row";
    if (Object.keys(errs).length) { setErrors(errs); return; }
    if (!token) { setSubmitError("Sign in required."); return; }
    setErrors({});
    setIsSubmitting(true);
    try {
      await onSave({
        ...bom,
        ...form,
        productName: form.productName.trim(),
        productGroupName: form.productName.trim(),
        category: form.category.trim(),
      });
    } catch (err) {
      setSubmitError(err?.message || "Save failed.");
    } finally {
      setIsSubmitting(false);
    }
  };

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
        <div style={{ padding: "2rem 2rem 1.5rem", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <span style={{ fontSize: "0.6rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.2em", color: "#D4A843", display: "block", marginBottom: "0.25rem" }}>
              {bom?.productName?.endsWith(" (Copy)") ? "Duplicate Configuration" : bom ? "Edit Configuration" : "New Configuration"}
            </span>
            <h2 style={{ fontSize: "1.5rem", fontWeight: 800, color: "#E5E2E1", letterSpacing: "-0.02em", margin: 0 }}>
              {bom?.productName?.endsWith(" (Copy)") ? "Duplicate BOM" : bom ? "Edit BOM" : "Create Product BOM"}
            </h2>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "rgba(229,226,225,0.4)", cursor: "pointer", padding: "0.25rem", lineHeight: 0 }}>
            <CloseIcon />
          </button>
        </div>

        <div style={{ padding: "0 2rem", overflowY: "auto", flex: 1 }}>
          {/* Product Name */}
          <div style={{ marginBottom: "1.5rem" }}>
            <label style={labelStyle}>Product Name</label>
            <input
              type="text"
              value={form.productName}
              onChange={(e) => {
                setForm((p) => ({ ...p, productName: e.target.value.slice(0, 120) }));
                if (errors.productName) setErrors((er) => ({ ...er, productName: "" }));
              }}
              placeholder="e.g. Custom Ceramic Mug 11oz"
              maxLength={120}
              style={{ ...inputStyle, border: errors.productName ? "1px solid rgba(239,68,68,0.5)" : "none" }}
            />
            {errors.productName && <span style={errorStyle}>{errors.productName}</span>}
          </div>

          {/* Category */}
          <div style={{ marginBottom: "2rem" }}>
            <label style={labelStyle}>Category</label>
            <CategoryCombobox
              value={form.category}
              onChange={(val) => {
                setForm((p) => ({ ...p, category: val }));
                if (errors.category) setErrors((er) => ({ ...er, category: "" }));
              }}
              options={categories}
            />
            <span style={{ fontSize: "0.6rem", color: "rgba(229,226,225,0.35)", marginTop: "0.25rem", display: "block" }}>
              Used to group products on the storefront — e.g. Mugs, Stickers, Badges
            </span>
            {errors.category && <span style={errorStyle}>{errors.category}</span>}
          </div>

          {/* BOM Cost Card */}
          {form.components.length > 0 && (
            <div style={{
              background: "linear-gradient(135deg,rgba(255,255,255,0.06) 0%,rgba(255,255,255,0.03) 100%)",
              borderRadius: "12px", padding: "1.25rem 1.5rem", marginBottom: "2rem",
              display: "flex", justifyContent: "space-between", alignItems: "center",
            }}>
              <div>
                <p style={{ fontSize: "0.6rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.15em", color: "rgba(229,226,225,0.5)", margin: "0 0 0.25rem 0" }}>
                  BOM Cost
                </p>
                <span style={{ fontSize: "2rem", fontWeight: 800, color: "#D4A843", letterSpacing: "-0.03em" }}>
                  ₱{bomCost.toLocaleString("en-PH", { minimumFractionDigits: 2 })}
                </span>
                <span style={{ fontSize: "0.75rem", color: "rgba(229,226,225,0.4)", marginLeft: "0.5rem" }}>per unit</span>
              </div>
              <div style={{ textAlign: "right" }}>
                <span style={{
                  display: "inline-flex", alignItems: "center", gap: "0.35rem",
                  padding: "0.25rem 0.75rem", borderRadius: "99px",
                  background: "rgba(212,168,67,0.1)", color: "#D4A843",
                  fontSize: "0.7rem", fontWeight: 700,
                }}>
                  <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#D4A843" }} />
                  Floor Price
                </span>
                <p style={{ fontSize: "0.6rem", color: "rgba(229,226,225,0.35)", fontStyle: "italic", margin: "0.4rem 0 0 0" }}>
                  {form.components.length} material{form.components.length !== 1 ? "s" : ""} · sell above this to profit
                </p>
              </div>
            </div>
          )}

          {/* Components Section */}
          <div style={{ marginBottom: "1.5rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
              <div>
                <h3 style={{ fontSize: "1rem", fontWeight: 800, color: "#E5E2E1", margin: "0 0 0.1rem 0" }}>Components</h3>
                <p style={{ fontSize: "0.6rem", color: "rgba(229,226,225,0.35)", margin: 0 }}>
                  Materials needed to make one unit of this product
                </p>
              </div>
              <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                {errors.material && <span style={errorStyle}>{errors.material}</span>}
                {errors.components && <span style={errorStyle}>{errors.components}</span>}
                <button type="button" onClick={addComponent} style={ghostBtnStyle}>
                  <PlusIcon /> Add Material
                </button>
              </div>
            </div>

            {/* Column headers */}
            {form.components.length > 0 && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 72px 52px 100px 36px", gap: "0.75rem", padding: "0 1rem", marginBottom: "0.5rem" }}>
                {["Material", "Qty", "Unit", "Cost", ""].map((h) => (
                  <span key={h} style={{ fontSize: "0.6rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "rgba(229,226,225,0.3)" }}>{h}</span>
                ))}
              </div>
            )}

            {form.components.length === 0 ? (
              <div style={{ padding: "2rem", textAlign: "center", color: "var(--gray)", fontSize: "0.8rem", background: "rgba(255,255,255,0.02)", borderRadius: "12px", border: "1px dashed rgba(255,255,255,0.08)" }}>
                No materials yet. Click Add Material to begin.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                {form.components.map((comp, idx) => {
                  const selectedMat = materials.find((m) => m.id === comp.materialId);
                  const componentCost = selectedMat ? (selectedMat.baseCost || 0) * (comp.qty || 0) : 0;
                  const dropdownOptions = [
                    { value: "", label: "Search material…" },
                    ...(selectedMat ? [{ value: selectedMat.id, label: selectedMat.name }] : []),
                    ...availableMaterials,
                  ];
                  return (
                    <div key={idx} style={{ display: "grid", gridTemplateColumns: "1fr 72px 52px 100px 36px", gap: "0.75rem", alignItems: "center", padding: "0.875rem 1rem", background: "rgba(14,14,14,0.5)", borderRadius: "12px" }}>
                      <CustomDropdown
                        value={comp.materialId}
                        onChange={(val) => {
                          updateComponent(idx, "materialId", val);
                          if (errors.material) setErrors((er) => ({ ...er, material: "" }));
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
                              updateComponent(idx, "qty", v === "" ? 0 : parseInt(v, 10));
                          }}
                          onKeyDown={(e) => { if (["e", "E", "+", "-", "."].includes(e.key)) e.preventDefault(); }}
                          style={{ width: "100%", background: "rgba(255,255,255,0.06)", border: "none", borderRadius: "8px", padding: "0.625rem 0.5rem", color: comp.qty > 0 ? "#E5E2E1" : "transparent", fontSize: "0.85rem", textAlign: "center", fontWeight: 700, outline: "none", boxSizing: "border-box" }}
                        />
                        {!comp.qty && (
                          <span style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", color: "rgba(229,226,225,0.2)", fontSize: "0.85rem", fontWeight: 700, pointerEvents: "none" }}>0</span>
                        )}
                      </div>
                      <div style={{ textAlign: "center", fontSize: "0.62rem", fontWeight: 700, color: "var(--gray)", textTransform: "uppercase", letterSpacing: "0.04em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                        title={selectedMat ? uomLabel(selectedMat.uom) : ""}>
                        {selectedMat ? uomLabel(selectedMat.uom) : "—"}
                      </div>
                      <div style={{ textAlign: "right", fontWeight: 800, color: "#E5E2E1", fontSize: "0.9rem" }}>
                        {componentCost > 0 ? `₱${componentCost.toLocaleString("en-PH", { minimumFractionDigits: 2 })}` : "—"}
                      </div>
                      <button type="button" onClick={() => removeComponent(idx)}
                        style={{ background: "none", border: "none", color: "rgba(229,226,225,0.2)", cursor: "pointer", padding: "0.25rem", lineHeight: 0, transition: "color 0.15s" }}
                        onMouseEnter={(e) => { e.currentTarget.style.color = "#ef4444"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.color = "rgba(229,226,225,0.2)"; }}>
                        <TrashRowIcon />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div style={{ height: "1.5rem" }} />
        </div>

        {/* Footer */}
        <div style={{ padding: "1.25rem 2rem", background: "rgba(255,255,255,0.03)", borderTop: "1px solid rgba(255,255,255,0.06)", display: "flex", justifyContent: "flex-end", alignItems: "center", gap: "1rem", flexShrink: 0, flexWrap: "wrap" }}>
          {submitError && <span style={{ ...errorStyle, marginRight: "auto", marginTop: 0 }}>{submitError}</span>}
          <button type="button" onClick={onClose} disabled={isSubmitting}
            style={{ background: "none", border: "none", color: "rgba(229,226,225,0.6)", fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.15em", cursor: isSubmitting ? "not-allowed" : "pointer", padding: "0.625rem 1.5rem", opacity: isSubmitting ? 0.6 : 1 }}>
            Cancel
          </button>
          <button type="button" onClick={handleSave} disabled={isSubmitting}
            style={{ background: "linear-gradient(135deg,#FFDF9F 0%,#D4A843 100%)", border: "none", borderRadius: "8px", color: "#000", fontSize: "0.8rem", fontWeight: 800, cursor: isSubmitting ? "not-allowed" : "pointer", padding: "0.625rem 2rem", boxShadow: "0 4px 12px rgba(212,168,67,0.2)", opacity: isSubmitting ? 0.75 : 1 }}>
            {isSubmitting ? "Saving..." : bom ? "Save Changes" : "Create BOM"}
          </button>
        </div>
      </div>
    </div>
  );
}
