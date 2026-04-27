import CustomDropdown from "@/app/components/CustomDropdown";
import { useAuth } from "@/contexts/AuthContext";
import { useEffect, useMemo, useRef, useState } from "react";

function PlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <circle cx="12" cy="12" r="10" /><path d="M12 8v8M8 12h8" />
    </svg>
  );
}
function TrashRowIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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
function LockIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

const labelStyle = {
  fontSize: "0.65rem", fontWeight: 700, textTransform: "uppercase",
  letterSpacing: "0.15em", color: "rgba(229,226,225,0.6)", display: "block", marginBottom: "0.5rem",
};
const inputStyle = {
  width: "100%", background: "rgba(255,255,255,0.06)", borderRadius: "12px",
  padding: "0.75rem 1rem", color: "#E5E2E1", fontSize: "0.875rem", outline: "none", boxSizing: "border-box",
};
const errorStyle = { fontSize: "0.72rem", color: "#ef4444", marginTop: "0.25rem", display: "block" };
const ghostBtnStyle = {
  display: "flex", alignItems: "center", gap: "0.35rem", borderRadius: "6px",
  padding: "0.3rem 0.75rem", color: "#D4A843", background: "none",
  border: "1px solid rgba(212,168,67,0.2)", fontSize: "0.72rem", fontWeight: 700, cursor: "pointer",
};

const DROPDOWN_LIST_STYLE = {
  position: "fixed", background: "#1c1c1c", border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: "10px", zIndex: 9999, boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
};

function useFixedDropPos(open, triggerRef, setOpen, listHeight = 240) {
  const [pos, setPos] = useState(null);
  useEffect(() => {
    if (!open || !triggerRef.current) { setPos(null); return; }
    const r = triggerRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - r.bottom;
    const top = spaceBelow >= listHeight + 8
      ? r.bottom + 4
      : Math.max(8, r.top - listHeight - 4);
    setPos({ top, left: r.left, width: r.width });
    const scrollEl = triggerRef.current.closest("[data-modscroll]");
    if (!scrollEl || !setOpen) return;
    const close = () => setOpen(false);
    scrollEl.addEventListener("scroll", close, { passive: true });
    return () => scrollEl.removeEventListener("scroll", close);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  return pos;
}

function useClickOutside(refs, handler) {
  useEffect(() => {
    const h = (e) => {
      if (refs.every((r) => r.current && !r.current.contains(e.target))) handler();
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

function fifoMaterialCost(mat, qty) {
  if (!mat) return 0;
  if (!mat.batches || !mat.batches.length) return (mat.baseCost || 0) * (qty || 0);
  const getQty = (b) => b.remainingQty != null ? b.remainingQty : (b.goodQty ?? b.qtyGood ?? 0);
  const active = mat.batches.filter((b) => getQty(b) > 0).sort((a, b) => new Date(a.dateReceived) - new Date(b.dateReceived));
  if (!active.length) return (mat.baseCost || 0) * (qty || 0);
  let rem = qty || 0, cost = 0;
  for (const batch of active) {
    if (rem <= 0) break;
    const take = Math.min(rem, getQty(batch));
    cost += take * (batch.unitCost || 0);
    rem -= take;
  }
  return cost;
}

function batchCostRange(mat, qty) {
  if (!mat) return { min: 0, max: 0 };
  const getQty = (b) => b.remainingQty != null ? b.remainingQty : (b.goodQty ?? b.qtyGood ?? 0);
  const active = (mat.batches || []).filter((b) => getQty(b) > 0);
  const costs = active.map((b) => b.unitCost || 0).filter((c) => c > 0);
  if (!costs.length) { const c = (mat.baseCost || 0) * (qty || 0); return { min: c, max: c }; }
  return { min: Math.min(...costs) * (qty || 0), max: Math.max(...costs) * (qty || 0) };
}

// ── Combobox: product group name (free-text + suggestions) ──────────────────
function GroupNameCombobox({ value, onChange, options }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value || "");
  const triggerRef = useRef(null);
  const listRef = useRef(null);
  const pos = useFixedDropPos(open, triggerRef, setOpen, 200);
  useClickOutside([triggerRef, listRef], () => setOpen(false));
  useEffect(() => { setQuery(value || ""); }, [value]);

  const filtered = options.filter((o) => o.toLowerCase().includes(query.toLowerCase()));
  const exactMatch = options.some((o) => o.toLowerCase() === query.toLowerCase());

  return (
    <div style={{ position: "relative" }}>
      <input ref={triggerRef} type="text" value={query} placeholder="e.g. Custom Mugs, Mousepad, Sticker Pack"
        onChange={(e) => { setQuery(e.target.value); onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        style={{ ...inputStyle, border: "none" }}
      />
      {open && pos && (filtered.length > 0 || (!exactMatch && query)) && (
        <div ref={listRef} style={{ ...DROPDOWN_LIST_STYLE, top: pos.top, left: pos.left, width: pos.width, maxHeight: 200, overflowY: "auto" }}>
          {filtered.map((opt) => (
            <button key={opt} type="button" onClick={() => { setQuery(opt); onChange(opt); setOpen(false); }}
              style={{ width: "100%", textAlign: "left", background: "none", border: "none", padding: "0.6rem 1rem", color: opt === value ? "#D4A843" : "#E5E2E1", fontSize: "0.85rem", cursor: "pointer", fontWeight: opt === value ? 700 : 400 }}
              onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.06)"}
              onMouseLeave={(e) => e.currentTarget.style.background = "none"}
            >{opt}</button>
          ))}
          {!exactMatch && query && (
            <button type="button" onClick={() => { onChange(query); setOpen(false); }}
              style={{ width: "100%", textAlign: "left", background: "none", border: "none", borderTop: filtered.length ? "1px solid rgba(255,255,255,0.06)" : "none", padding: "0.6rem 1rem", color: "#D4A843", fontSize: "0.8rem", cursor: "pointer", fontWeight: 700 }}
              onMouseEnter={(e) => e.currentTarget.style.background = "rgba(212,168,67,0.06)"}
              onMouseLeave={(e) => e.currentTarget.style.background = "none"}
            >+ Use &ldquo;{query}&rdquo;</button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Combobox: primary material picker (inventory top-level only) ─────────────
function MaterialCombobox({ value, onChange, materials, excludeIds = [] }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const triggerRef = useRef(null);
  const listRef = useRef(null);
  const pos = useFixedDropPos(open, triggerRef, setOpen, 270);
  useClickOutside([triggerRef, listRef], () => { setOpen(false); setQuery(""); });

  const topLevel = useMemo(
    () => materials.filter((m) => !m.parentId && !excludeIds.includes(String(m.id))),
    [materials, excludeIds],
  );
  const selected = useMemo(
    () => materials.filter((m) => !m.parentId).find((m) => m.id === value),
    [materials, value],
  );

  const getLabel = (m) => {
    if (m.hasVariants) {
      const count = materials.filter((c) => c.parentId === m.id).length;
      return `${m.name} (${count} variant${count !== 1 ? "s" : ""})`;
    }
    return m.name;
  };

  const filtered = topLevel.filter((m) => m.name.toLowerCase().includes(query.toLowerCase()));

  return (
    <div>
      <div ref={triggerRef} onClick={() => setOpen((o) => !o)}
        style={{ ...inputStyle, border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", userSelect: "none" }}
      >
        {selected
          ? <span style={{ color: "#E5E2E1" }}>{getLabel(selected)}</span>
          : <span style={{ color: "rgba(229,226,225,0.35)" }}>Pick a material from inventory…</span>
        }
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(229,226,225,0.4)" strokeWidth="2.5" style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s", flexShrink: 0 }}>
          <path d="M6 9l6 6 6-6" />
        </svg>
      </div>

      {open && pos && (
        <div ref={listRef} style={{ ...DROPDOWN_LIST_STYLE, top: pos.top, left: pos.left, width: pos.width, overflow: "hidden" }}>
          <div style={{ padding: "0.45rem 0.75rem", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
            <input autoFocus type="text" value={query} onChange={(e) => setQuery(e.target.value)}
              placeholder="Search materials…"
              style={{ width: "100%", background: "none", border: "none", color: "#E5E2E1", fontSize: "0.82rem", outline: "none" }}
            />
          </div>
          <div style={{ maxHeight: 220, overflowY: "auto" }}>
            {filtered.length === 0
              ? <div style={{ padding: "1rem", textAlign: "center", color: "rgba(229,226,225,0.3)", fontSize: "0.8rem" }}>No materials found</div>
              : filtered.map((m) => (
                <button key={m.id} type="button"
                  onClick={() => { onChange(m.id); setOpen(false); setQuery(""); }}
                  style={{ width: "100%", textAlign: "left", background: "none", border: "none", padding: "0.55rem 1rem", cursor: "pointer", display: "flex", flexDirection: "column", gap: "0.08rem" }}
                  onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.05)"}
                  onMouseLeave={(e) => e.currentTarget.style.background = "none"}
                >
                  <span style={{ fontSize: "0.85rem", color: m.id === value ? "#D4A843" : "#E5E2E1", fontWeight: m.id === value ? 700 : 400 }}>{m.name}</span>
                  {m.hasVariants && (
                    <span style={{ fontSize: "0.6rem", color: "rgba(212,168,67,0.55)" }}>
                      {materials.filter((c) => c.parentId === m.id).length} variants — each becomes a BOM entry
                    </span>
                  )}
                  {!m.hasVariants && m.category && (
                    <span style={{ fontSize: "0.6rem", color: "rgba(229,226,225,0.3)" }}>{m.category}</span>
                  )}
                </button>
              ))
            }
          </div>
        </div>
      )}
    </div>
  );
}

// ── Extra material row (fixed-position dropdown) ─────────────────────────────
function ExtraRow({ extra, idx, materials, leafOptions, onChange, onRemove }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const triggerRef = useRef(null);
  const listRef = useRef(null);
  const pos = useFixedDropPos(open, triggerRef, setOpen, 200);
  useClickOutside([triggerRef, listRef], () => { setOpen(false); setQuery(""); });

  const mat = materials.find((m) => m.id === extra.materialId);
  const cost = mat ? fifoMaterialCost(mat, extra.qty) : 0;
  const uom = mat?.uom || "—";

  const filtered = leafOptions.filter((o) => !query || o.label.toLowerCase().includes(query.toLowerCase()));

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 60px 40px 80px 28px", gap: "0.4rem", alignItems: "center" }}>
      {/* Material picker trigger */}
      <div ref={triggerRef} onClick={() => setOpen((o) => !o)}
        style={{ background: "rgba(255,255,255,0.06)", borderRadius: "8px", padding: "0.45rem 0.75rem", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", userSelect: "none", minWidth: 0 }}
      >
        <span style={{ fontSize: "0.8rem", color: mat ? "#E5E2E1" : "rgba(229,226,225,0.35)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {mat ? mat.name : "Select material…"}
        </span>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="rgba(229,226,225,0.35)" strokeWidth="2.5" style={{ flexShrink: 0, marginLeft: "0.3rem" }}>
          <path d="M6 9l6 6 6-6" />
        </svg>
      </div>

      {open && (
        <div ref={listRef} style={{ ...DROPDOWN_LIST_STYLE, top: pos.top, left: pos.left, width: Math.max(pos.width, 240), overflow: "hidden" }}>
          <div style={{ padding: "0.4rem 0.65rem", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
            <input autoFocus type="text" value={query} onChange={(e) => setQuery(e.target.value)}
              placeholder="Search…"
              style={{ width: "100%", background: "none", border: "none", color: "#E5E2E1", fontSize: "0.8rem", outline: "none" }}
            />
          </div>
          <div style={{ maxHeight: 180, overflowY: "auto" }}>
            {filtered.length === 0
              ? <div style={{ padding: "0.75rem", textAlign: "center", color: "rgba(229,226,225,0.3)", fontSize: "0.78rem" }}>No materials</div>
              : filtered.map((opt) => (
                <button key={opt.value} type="button"
                  onClick={() => { onChange(idx, "materialId", opt.value); setOpen(false); setQuery(""); }}
                  style={{ width: "100%", textAlign: "left", background: "none", border: "none", padding: "0.5rem 0.75rem", color: opt.value === extra.materialId ? "#D4A843" : "#E5E2E1", fontSize: "0.82rem", cursor: "pointer", fontWeight: opt.value === extra.materialId ? 700 : 400 }}
                  onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.05)"}
                  onMouseLeave={(e) => e.currentTarget.style.background = "none"}
                >{opt.label}</button>
              ))
            }
          </div>
        </div>
      )}

      {/* Qty */}
      <div style={{ position: "relative" }}>
        <input type="text" inputMode="numeric" pattern="[0-9]*" value={extra.qty || ""}
          onChange={(e) => { const v = e.target.value; if (v === "" || /^\d+$/.test(v)) onChange(idx, "qty", v === "" ? 0 : parseInt(v, 10)); }}
          onKeyDown={(e) => { if (["e","E","+","-","."].includes(e.key)) e.preventDefault(); }}
          style={{ width: "100%", background: "rgba(255,255,255,0.06)", border: "none", borderRadius: "8px", padding: "0.45rem 0.35rem", color: extra.qty > 0 ? "#E5E2E1" : "transparent", fontSize: "0.82rem", textAlign: "center", fontWeight: 700, outline: "none", boxSizing: "border-box" }}
        />
        {!extra.qty && <span style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", color: "rgba(229,226,225,0.2)", fontSize: "0.82rem", pointerEvents: "none" }}>0</span>}
      </div>

      {/* Unit */}
      <div style={{ textAlign: "center", fontSize: "0.58rem", fontWeight: 700, color: "var(--gray)", textTransform: "uppercase", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{uom}</div>

      {/* Cost */}
      <div style={{ textAlign: "right", fontWeight: 800, color: cost > 0 ? "#E5E2E1" : "rgba(229,226,225,0.2)", fontSize: "0.8rem" }}>
        {cost > 0 ? `₱${cost.toFixed(2)}` : "—"}
      </div>

      {/* Delete */}
      <button type="button" onClick={() => onRemove(idx)}
        style={{ background: "none", border: "none", color: "rgba(229,226,225,0.2)", cursor: "pointer", padding: "0.2rem", lineHeight: 0 }}
        onMouseEnter={(e) => { e.currentTarget.style.color = "#ef4444"; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = "rgba(229,226,225,0.2)"; }}>
        <TrashRowIcon />
      </button>
    </div>
  );
}

const EXTRA_HEADERS = ["Extra Material", "Qty", "Unit", "Cost", ""];
const EXTRA_GRID = "1fr 60px 40px 80px 28px";

// ── Slot card: one per material variant (or standalone) ──────────────────────
function SlotCard({ slot, idx, isOnly, materials, leafOptions, onAddExtra, onRemoveExtra, onUpdateExtra }) {
  const primaryMat = materials.find((m) => m.id === slot.matId);
  const primaryRange = primaryMat ? batchCostRange(primaryMat, 1) : { min: 0, max: 0 };
  const extrasRange = slot.extras.reduce((s, e) => {
    const mat = materials.find((m) => m.id === e.materialId);
    const r = batchCostRange(mat, e.qty);
    return { min: s.min + r.min, max: s.max + r.max };
  }, { min: 0, max: 0 });
  const minTotal = primaryRange.min + extrasRange.min;
  const maxTotal = primaryRange.max + extrasRange.max;
  const totalCost = fifoMaterialCost(primaryMat, 1) + slot.extras.reduce((s, e) => s + fifoMaterialCost(materials.find((m) => m.id === e.materialId), e.qty), 0);
  const slotLeafOptions = leafOptions.filter((o) => o.value !== slot.matId);

  return (
    <div style={{ background: "rgba(10,10,10,0.5)", borderRadius: "12px", border: "1px solid rgba(255,255,255,0.07)", marginBottom: "0.75rem", overflow: "hidden" }}>
      {/* Locked header */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", padding: "0.65rem 1rem", background: "rgba(255,255,255,0.025)", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
        <span style={{ fontSize: "0.58rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "rgba(212,168,67,0.6)", whiteSpace: "nowrap" }}>
          {isOnly ? "Material" : `Variant ${idx + 1}`}
        </span>
        <span style={{ color: "#E5E2E1", fontWeight: 700, fontSize: "0.875rem", flex: 1 }}>{slot.matName}</span>
        <span style={{ color: "rgba(229,226,225,0.18)", lineHeight: 0 }} title="From inventory — locked"><LockIcon /></span>
      </div>

      <div style={{ padding: "0.75rem 1rem" }}>
        {slot.extras.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: EXTRA_GRID, gap: "0.4rem", marginBottom: "0.4rem" }}>
            {EXTRA_HEADERS.map((h) => (
              <span key={h} style={{ fontSize: "0.55rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "rgba(229,226,225,0.22)" }}>{h}</span>
            ))}
          </div>
        )}
        {slot.extras.length === 0 && (
          <div style={{ textAlign: "center", padding: "0.5rem 0 0.65rem", color: "rgba(229,226,225,0.18)", fontSize: "0.72rem" }}>
            No extra materials — add packaging, box, etc.
          </div>
        )}
        {slot.extras.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", marginBottom: "0.5rem" }}>
            {slot.extras.map((extra, ei) => (
              <ExtraRow key={ei} extra={extra} idx={ei} materials={materials} leafOptions={slotLeafOptions}
                onChange={(i, f, v) => onUpdateExtra(slot.matId, i, f, v)}
                onRemove={(i) => onRemoveExtra(slot.matId, i)}
              />
            ))}
          </div>
        )}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "0.35rem" }}>
          <button type="button" onClick={() => onAddExtra(slot.matId)} style={ghostBtnStyle}>
            <PlusIcon /> Add material
          </button>
          <span style={{ fontSize: "0.78rem", fontWeight: 800, color: "#D4A843" }}>
            {minTotal !== maxTotal
              ? `₱${minTotal.toFixed(2)}–₱${maxTotal.toFixed(2)}`
              : `₱${minTotal.toFixed(2)}`}{" "}
            <span style={{ fontSize: "0.6rem", fontWeight: 400, color: "rgba(229,226,225,0.4)" }}>BOM cost</span>
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Edit mode: extra row (same fixed-dropdown pattern) ───────────────────────
function EditExtraRow({ extra, idx, materials, leafOptions, onChange, onRemove }) {
  return (
    <ExtraRow extra={extra} idx={idx} materials={materials} leafOptions={leafOptions} onChange={onChange} onRemove={onRemove} />
  );
}

// ── Main modal ───────────────────────────────────────────────────────────────
export default function BOMFormModal({ bom, addToGroup = null, existingGroupBoms = [], materials, units, categories = [], productGroups = [], onClose, onSave }) {
  const { token } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [errors, setErrors] = useState({});

  const leafMaterialOptions = useMemo(
    () =>
      materials
        .filter((m) => (!m.parentId && !m.hasVariants) || m.parentId)
        .map((m) => {
          const p = m.parentId ? materials.find((x) => x.id === m.parentId) : null;
          return { value: m.id, label: `${m.name}${p ? ` (${p.name})` : ""}` };
        }),
    [materials],
  );

  // Child material IDs already used as primary in existing group BOMs (exclude specific children, not whole parents)
  const usedChildIds = useMemo(() => {
    if (!addToGroup || !existingGroupBoms.length) return new Set();
    return new Set(
      existingGroupBoms.map((b) => {
        const comp = (b.components || [])[0];
        return comp ? String(comp.materialId ?? comp.inventoryId ?? "") : "";
      }).filter(Boolean)
    );
  }, [addToGroup, existingGroupBoms]);

  // ── CREATE / ADD-VARIANT state ───────────────────────────────────────────────
  const [groupName, setGroupName] = useState(addToGroup || "");
  const [primaryMaterialId, setPrimaryMaterialId] = useState("");
  const [variantSlots, setVariantSlots] = useState([]);

  const handlePrimaryChange = (matId) => {
    setPrimaryMaterialId(matId);
    if (errors.primary) setErrors((e) => ({ ...e, primary: "" }));
    const mat = materials.find((m) => m.id === matId);
    if (!mat) { setVariantSlots([]); return; }
    if (mat.hasVariants) {
      const children = materials.filter((m) => m.parentId === mat.id && !usedChildIds.has(String(m.id)));
      setVariantSlots(children.map((c) => ({ matId: c.id, matName: c.name, extras: [] })));
    } else {
      if (usedChildIds.has(String(mat.id))) { setVariantSlots([]); return; }
      setVariantSlots([{ matId: mat.id, matName: mat.name, extras: [] }]);
    }
  };

  const addExtra = (slotMatId) =>
    setVariantSlots((p) => p.map((s) => s.matId === slotMatId ? { ...s, extras: [...s.extras, { materialId: "", qty: 1 }] } : s));
  const removeExtra = (slotMatId, idx) =>
    setVariantSlots((p) => p.map((s) => s.matId === slotMatId ? { ...s, extras: s.extras.filter((_, i) => i !== idx) } : s));
  const updateExtra = (slotMatId, idx, field, val) =>
    setVariantSlots((p) => p.map((s) => s.matId === slotMatId ? { ...s, extras: s.extras.map((e, i) => i === idx ? { ...e, [field]: val } : e) } : s));

  // ── EDIT state ──────────────────────────────────────────────────────────────
  const [editGroupName, setEditGroupName] = useState("");
  const [editExtras, setEditExtras] = useState([]);

  const editPrimaryComp = bom ? (bom.components || [])[0] : null;
  const editPrimaryMatId = editPrimaryComp ? (editPrimaryComp.materialId ?? editPrimaryComp.inventoryId ?? "") : "";
  const editPrimaryMat = materials.find((m) => String(m.id) === String(editPrimaryMatId));

  useEffect(() => {
    if (bom) {
      setEditGroupName(bom.productGroupName || bom.productName || "");
      setEditExtras(
        (bom.components || []).slice(1).map((c) => ({
          materialId: c.materialId ?? c.inventoryId ?? "",
          qty: c.qty ?? 1,
        })),
      );
    }
  }, [bom]);

  const addEditExtra = () => setEditExtras((p) => [...p, { materialId: "", qty: 1 }]);
  const removeEditExtra = (idx) => setEditExtras((p) => p.filter((_, i) => i !== idx));
  const updateEditExtra = (idx, field, val) =>
    setEditExtras((p) => p.map((e, i) => i === idx ? { ...e, [field]: val } : e));

  const editPrimaryCost = editPrimaryMat ? fifoMaterialCost(editPrimaryMat, editPrimaryComp?.qty || 1) : 0;
  const editExtrasCost = editExtras.reduce((s, e) => {
    const mat = materials.find((m) => m.id === e.materialId);
    return s + fifoMaterialCost(mat, e.qty);
  }, 0);
  const editTotalCost = editPrimaryCost + editExtrasCost;

  const editLeafOptions = useMemo(
    () => leafMaterialOptions.filter((o) => o.value !== editPrimaryMatId),
    [leafMaterialOptions, editPrimaryMatId],
  );

  // ── Save ────────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (isSubmitting) return;
    setSubmitError(""); setErrors({});

    if (bom) {
      const errs = {};
      if (!editGroupName.trim()) errs.groupName = "Product name required";
      if (editExtras.some((e) => !e.materialId)) errs.extras = "Select a material for each extra row";
      if (Object.keys(errs).length) { setErrors(errs); return; }
      if (!token) { setSubmitError("Sign in required."); return; }
      setIsSubmitting(true);
      try {
        await onSave({
          ...bom,
          productGroupName: editGroupName.trim(),
          productName: bom.productName,
          category: bom.category || editPrimaryMat?.category || null,
          components: [
            { materialId: editPrimaryMatId, qty: editPrimaryComp?.qty || 1 },
            ...editExtras,
          ],
        });
        onClose();
      } catch (err) {
        setSubmitError(err?.message || "Save failed.");
      } finally {
        setIsSubmitting(false);
      }
    } else {
      const errs = {};
      if (!groupName.trim()) errs.groupName = "Product name required";
      if (!primaryMaterialId) errs.primary = "Select a material";
      if (!variantSlots.length) errs.primary = "Select a material first";
      if (variantSlots.some((s) => s.extras.some((e) => !e.materialId))) errs.extras = "Select a material for each extra row";
      if (Object.keys(errs).length) { setErrors(errs); return; }
      if (!token) { setSubmitError("Sign in required."); return; }
      setIsSubmitting(true);
      const grp = groupName.trim();
      const primaryMat = materials.find((m) => m.id === primaryMaterialId);
      try {
        for (const slot of variantSlots) {
          await onSave({
            productGroupName: grp,
            productName: slot.matName,
            category: primaryMat?.category || null,
            components: [{ materialId: slot.matId, qty: 1 }, ...slot.extras],
          });
        }
        onClose();
      } catch (err) {
        setSubmitError(err?.message || "Save failed.");
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: "680px", width: "95%", borderRadius: "12px", overflow: "hidden", padding: 0, display: "flex", flexDirection: "column", maxHeight: "90vh" }}
      >
        {/* Header */}
        <div style={{ padding: "2rem 2rem 1.5rem", display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexShrink: 0 }}>
          <div>
            <span style={{ fontSize: "0.6rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.2em", color: "#D4A843", display: "block", marginBottom: "0.25rem" }}>
              {bom ? "Edit Configuration" : addToGroup ? "Add Variant" : "New Configuration"}
            </span>
            <h2 style={{ fontSize: "1.5rem", fontWeight: 800, color: "#E5E2E1", letterSpacing: "-0.02em", margin: 0 }}>
              {bom ? "Edit Product" : addToGroup ? `Add to "${addToGroup}"` : "Create Product"}
            </h2>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "rgba(229,226,225,0.4)", cursor: "pointer", padding: "0.25rem", lineHeight: 0 }}>
            <CloseIcon />
          </button>
        </div>

        <div data-modscroll="1" style={{ padding: "0 2rem", overflowY: "auto", flex: 1 }}>
          {bom ? (
            /* ═══════════════════ EDIT MODE ═══════════════════ */
            <>
              <div style={{ marginBottom: "1.25rem" }}>
                <label style={labelStyle}>Product Name</label>
                <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", background: "rgba(255,255,255,0.04)", borderRadius: "12px", padding: "0.75rem 1rem" }}>
                  <span style={{ color: "rgba(229,226,225,0.2)", lineHeight: 0 }}><LockIcon /></span>
                  <span style={{ color: "#E5E2E1", fontWeight: 600, fontSize: "0.875rem" }}>{editGroupName}</span>
                </div>
                <span style={{ fontSize: "0.6rem", color: "rgba(229,226,225,0.28)", marginTop: "0.25rem", display: "block" }}>
                  Product group name is locked in edit mode
                </span>
              </div>

              <div style={{ marginBottom: "1.75rem" }}>
                <label style={labelStyle}>Primary Material</label>
                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", background: "rgba(255,255,255,0.04)", borderRadius: "12px", padding: "0.75rem 1rem" }}>
                  <span style={{ color: "rgba(229,226,225,0.25)", lineHeight: 0 }}><LockIcon /></span>
                  <div style={{ flex: 1 }}>
                    <div style={{ color: "#E5E2E1", fontWeight: 700, fontSize: "0.875rem" }}>{editPrimaryMat?.name || bom.productName || "—"}</div>
                    {editPrimaryMat?.category && <div style={{ fontSize: "0.6rem", color: "rgba(229,226,225,0.35)", marginTop: "0.1rem" }}>{editPrimaryMat.category}</div>}
                  </div>
                  <span style={{ fontSize: "0.72rem", fontWeight: 800, color: "#D4A843" }}>
                    {(() => {
                      const r = batchCostRange(editPrimaryMat, editPrimaryComp?.qty || 1);
                      return r.min !== r.max
                        ? `₱${r.min.toFixed(2)}–₱${r.max.toFixed(2)}`
                        : `₱${r.min.toFixed(2)}`;
                    })()}
                  </span>
                </div>
                <span style={{ fontSize: "0.6rem", color: "rgba(229,226,225,0.28)", marginTop: "0.25rem", display: "block" }}>
                  Primary material is locked after creation
                </span>
              </div>

              <div style={{ marginBottom: "1.5rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
                  <div>
                    <h3 style={{ fontSize: "0.9rem", fontWeight: 800, color: "#E5E2E1", margin: "0 0 0.1rem 0" }}>Extra Materials</h3>
                    <p style={{ fontSize: "0.6rem", color: "rgba(229,226,225,0.35)", margin: 0 }}>Packaging, boxes, consumables</p>
                  </div>
                  <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                    {errors.extras && <span style={errorStyle}>{errors.extras}</span>}
                    <button type="button" onClick={addEditExtra} style={ghostBtnStyle}><PlusIcon /> Add</button>
                  </div>
                </div>
                {editExtras.length === 0 ? (
                  <div style={{ padding: "1.25rem", textAlign: "center", color: "rgba(229,226,225,0.22)", fontSize: "0.78rem", background: "rgba(255,255,255,0.02)", borderRadius: "10px", border: "1px dashed rgba(255,255,255,0.07)" }}>
                    No extra materials
                  </div>
                ) : (
                  <>
                    <div style={{ display: "grid", gridTemplateColumns: EXTRA_GRID, gap: "0.4rem", marginBottom: "0.4rem" }}>
                      {EXTRA_HEADERS.map((h) => (
                        <span key={h} style={{ fontSize: "0.55rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "rgba(229,226,225,0.22)" }}>{h}</span>
                      ))}
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                      {editExtras.map((extra, i) => (
                        <EditExtraRow key={i} extra={extra} idx={i} materials={materials} leafOptions={editLeafOptions}
                          onChange={updateEditExtra} onRemove={removeEditExtra}
                        />
                      ))}
                    </div>
                  </>
                )}
                {editTotalCost > 0 && (
                  <div style={{ marginTop: "1rem", display: "flex", justifyContent: "flex-end", alignItems: "center", gap: "0.5rem" }}>
                    <span style={{ fontSize: "0.6rem", color: "rgba(229,226,225,0.4)" }}>Total BOM Cost:</span>
                    <span style={{ fontSize: "1.1rem", fontWeight: 800, color: "#D4A843" }}>₱{editTotalCost.toFixed(2)}</span>
                  </div>
                )}
              </div>
            </>
          ) : (
            /* ═══════════════════ CREATE / ADD-VARIANT MODE ═══════════════════ */
            <>
              <div style={{ marginBottom: "1.25rem" }}>
                <label style={labelStyle}>Product Name</label>
                {addToGroup ? (
                  <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", background: "rgba(255,255,255,0.04)", borderRadius: "12px", padding: "0.75rem 1rem" }}>
                    <span style={{ color: "rgba(229,226,225,0.2)", lineHeight: 0 }}><LockIcon /></span>
                    <span style={{ color: "#E5E2E1", fontWeight: 600, fontSize: "0.875rem" }}>{addToGroup}</span>
                  </div>
                ) : (
                  <input type="text" value={groupName}
                    onChange={(e) => { setGroupName(e.target.value); if (errors.groupName) setErrors((ex) => ({ ...ex, groupName: "" })); }}
                    placeholder="e.g. Custom Mugs, Mousepad, Sticker Pack"
                    style={{ ...inputStyle, border: "none" }}
                  />
                )}
                {!addToGroup && (
                  <span style={{ fontSize: "0.6rem", color: "rgba(229,226,225,0.35)", marginTop: "0.25rem", display: "block" }}>
                    Type a new product group name
                  </span>
                )}
                {errors.groupName && <span style={errorStyle}>{errors.groupName}</span>}
              </div>

              {addToGroup && existingGroupBoms.length > 0 && (
                <div style={{ marginBottom: "1.5rem" }}>
                  <label style={labelStyle}>Existing Variants</label>
                  {existingGroupBoms.map((b) => {
                    const primComp = (b.components || [])[0];
                    const primMatId = primComp ? String(primComp.materialId ?? primComp.inventoryId ?? "") : "";
                    const primMat = materials.find((m) => String(m.id) === primMatId);
                    return (
                      <div key={b.id ?? b._id} style={{ display: "flex", alignItems: "center", gap: "0.6rem", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "10px", padding: "0.6rem 0.9rem", marginBottom: "0.4rem" }}>
                        <span style={{ color: "rgba(229,226,225,0.18)", lineHeight: 0 }}><LockIcon /></span>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: "0.82rem", fontWeight: 700, color: "rgba(229,226,225,0.55)" }}>{b.productName}</div>
                          {primMat && <div style={{ fontSize: "0.6rem", color: "rgba(229,226,225,0.25)", marginTop: "0.1rem" }}>{primMat.name}</div>}
                        </div>
                        <span style={{ fontSize: "0.58rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "rgba(229,226,225,0.2)" }}>Already linked</span>
                      </div>
                    );
                  })}
                </div>
              )}

              <div style={{ marginBottom: "1.75rem" }}>
                <label style={labelStyle}>Select Material</label>
                <MaterialCombobox value={primaryMaterialId} onChange={handlePrimaryChange} materials={materials} />
                <span style={{ fontSize: "0.6rem", color: "rgba(229,226,225,0.35)", marginTop: "0.25rem", display: "block" }}>
                  {addToGroup ? "Only unlinked variants will be added as new BOM slots" : "If the material has variants, each variant becomes its own BOM entry"}
                </span>
                {errors.primary && <span style={errorStyle}>{errors.primary}</span>}
              </div>

              {variantSlots.length > 0 && (
                <div style={{ marginBottom: "1rem" }}>
                  <div style={{ marginBottom: "0.75rem" }}>
                    <h3 style={{ fontSize: "0.9rem", fontWeight: 800, color: "#E5E2E1", margin: "0 0 0.1rem 0" }}>
                      {variantSlots.length === 1 ? "Extra Materials" : "Variants & Extra Materials"}
                    </h3>
                    <p style={{ fontSize: "0.6rem", color: "rgba(229,226,225,0.35)", margin: 0 }}>
                      Add packaging, boxes, or consumables per {variantSlots.length > 1 ? "variant" : "product"}
                    </p>
                  </div>
                  {errors.extras && <span style={{ ...errorStyle, display: "block", marginBottom: "0.5rem" }}>{errors.extras}</span>}
                  {variantSlots.map((slot, i) => (
                    <SlotCard key={slot.matId} slot={slot} idx={i} isOnly={variantSlots.length === 1}
                      materials={materials} leafOptions={leafMaterialOptions}
                      onAddExtra={addExtra} onRemoveExtra={removeExtra} onUpdateExtra={updateExtra}
                    />
                  ))}
                </div>
              )}

              {!primaryMaterialId && (
                <div style={{ textAlign: "center", padding: "2rem", color: "rgba(229,226,225,0.18)", fontSize: "0.8rem", background: "rgba(255,255,255,0.015)", borderRadius: "12px", border: "1px dashed rgba(255,255,255,0.07)", marginBottom: "1rem" }}>
                  Select a material above to configure the BOM
                </div>
              )}
            </>
          )}
          <div style={{ height: "1.5rem" }} />
        </div>

        {/* Footer */}
        <div style={{ padding: "1.25rem 2rem", background: "rgba(255,255,255,0.03)", borderTop: "1px solid rgba(255,255,255,0.06)", display: "flex", justifyContent: "flex-end", alignItems: "center", gap: "1rem", flexShrink: 0 }}>
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
