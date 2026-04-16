"use client";

// ══════════════════════════════════════════════════════════════════════════════
// SHARED INVENTORY UTILITIES
// Extracted from repeated patterns across all inventory module files.
// ══════════════════════════════════════════════════════════════════════════════

// ── Storage Helpers ────────────────────────────────────────────────────────────
export function getStore(key) {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(key) || "[]");
  } catch {
    return [];
  }
}

export function setStore(key, data) {
  if (typeof window === "undefined") return;
  localStorage.setItem(key, JSON.stringify(data));
}

// ── Document Number Generation ─────────────────────────────────────────────────
export function genDocNumber(prefix) {
  const year = new Date().getFullYear();
  const ts = Date.now().toString(36).slice(-4).toUpperCase();
  const seq = Math.floor(Math.random() * 10000)
    .toString()
    .padStart(4, "0");
  return `${prefix}-${year}-${ts}${seq}`;
}

// ── Chevron Icon (shared) ──────────────────────────────────────────────────────
export function ChevronIcon({ open }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      style={{
        transform: open ? "rotate(90deg)" : "none",
        transition: "transform 0.2s",
      }}
    >
      <path d="M9 18l6-6-6-6" />
    </svg>
  );
}

// ── Table Header Style (shared) ────────────────────────────────────────────────
export const thStyle = {
  padding: "0.875rem 1rem",
  textAlign: "left",
  color: "var(--gray)",
  fontWeight: 700,
  fontSize: "0.65rem",
  textTransform: "uppercase",
  letterSpacing: "0.1em",
};

// ── Integer Input ──────────────────────────────────────────────────────────────
export function IntegerInput({
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
      inputMode="numeric"
      pattern="[0-9]*"
      value={value}
      placeholder={placeholder}
      disabled={disabled}
      style={style}
      onChange={(e) => {
        const v = e.target.value;
        if (v === "" || /^\d+$/.test(v)) {
          if (v === "") {
            onChange(v);
            return;
          }
          const n = parseInt(v, 10);
          if (max !== undefined && n > max) return;
          if (n < min) return;
          onChange(v);
        }
      }}
      onKeyDown={(e) =>
        ["e", "E", "+", "-", "."].includes(e.key) && e.preventDefault()
      }
      onWheel={(e) => document.activeElement === e.target && e.target.blur()}
    />
  );
}

// ── Decimal Input ──────────────────────────────────────────────────────────────
export function DecimalInput({
  value,
  onChange,
  placeholder,
  style,
  disabled,
}) {
  return (
    <input
      type="text"
      inputMode="decimal"
      value={value}
      placeholder={placeholder}
      disabled={disabled}
      style={style}
      onChange={(e) => {
        const v = e.target.value;
        if (v === "" || /^\d*\.?\d{0,2}$/.test(v)) onChange(v);
      }}
      onKeyDown={(e) =>
        ["e", "E", "+", " "].includes(e.key) && e.preventDefault()
      }
      onWheel={(e) => document.activeElement === e.target && e.target.blur()}
    />
  );
}

// ── Issue Type Config (SINGLE SOURCE OF TRUTH) ───────────────────────────────
// Stock-In Damage Types — for damaged items during receiving
export const STOCK_IN_DAMAGE_TYPES = [
  { id: "damaged_on_arrival", label: "Damaged on Arrival" },
  { id: "shortage", label: "Shortage" },
  { id: "wrong_item", label: "Wrong Item Shipped" },
  { id: "defective", label: "Defective" },
  { id: "others", label: "Others" },
];

// Goods Issue Types — categorized for outgoing/writeoff/return
export const GOODS_ISSUE_TYPES = [
  {
    id: "manual_sale",
    label: "Manual Sale",
    category: "outgoing",
    color: "#22c55e",
  },
  {
    id: "production_use",
    label: "Production Use",
    category: "outgoing",
    color: "#8b5cf6",
  },
  { id: "transfer", label: "Transfer", category: "outgoing", color: "#3b82f6" },
  { id: "damage", label: "Damaged", category: "writeoff", color: "#ef4444" },
  {
    id: "scrap",
    label: "Expired / Scrap",
    category: "writeoff",
    color: "#f97316",
  },
  {
    id: "lost",
    label: "Missing / Lost",
    category: "writeoff",
    color: "#f59e0b",
  },
  {
    id: "rtv",
    label: "Return to Vendor",
    category: "return",
    color: "#06b6d4",
  },
];

export const ISSUE_TYPE_CATEGORIES = {
  outgoing: {
    label: "Outgoing Stock",
    description: "Stock leaving the business",
  },
  writeoff: { label: "Write-Off", description: "Permanent stock loss" },
  return: { label: "Return", description: "Returned to vendor" },
};

// Legacy ISSUE_TYPES alias for backward compatibility with existing stock-out records
export const ISSUE_TYPES = {
  damage: {
    label: "Damage",
    color: "#ef4444",
    bg: "rgba(239,68,68,0.1)",
    border: "rgba(239,68,68,0.2)",
  },
  scrap: {
    label: "Scrap",
    color: "#f97316",
    bg: "rgba(249,115,22,0.1)",
    border: "rgba(249,115,22,0.2)",
  },
  production: {
    label: "Production Use",
    color: "#8b5cf6",
    bg: "rgba(139,92,246,0.1)",
    border: "rgba(139,92,246,0.2)",
  },
  lost: {
    label: "Lost/Missing",
    color: "#f59e0b",
    bg: "rgba(245,158,11,0.1)",
    border: "rgba(245,158,11,0.2)",
  },
  return: {
    label: "Return to Vendor",
    color: "#3b82f6",
    bg: "rgba(59,130,246,0.1)",
    border: "rgba(59,130,246,0.2)",
  },
  adjustment: {
    label: "Adjustment",
    color: "#9ca3af",
    bg: "rgba(156,163,175,0.1)",
    border: "rgba(156,163,175,0.2)",
  },
};

export function IssueTypeBadge({ type }) {
  const cfg = ISSUE_TYPES[type] || ISSUE_TYPES.adjustment;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.3rem",
        padding: "0.2rem 0.6rem",
        borderRadius: "6px",
        fontSize: "0.65rem",
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

// ── RTV Status Config ──────────────────────────────────────────────────────────
export const RTV_STATUS = {
  pending: {
    label: "Pending",
    color: "#f59e0b",
    bg: "rgba(245,158,11,0.1)",
    border: "rgba(245,158,11,0.2)",
  },
  replacement_received: {
    label: "Replacement Received",
    color: "#22c55e",
    bg: "rgba(34,197,94,0.1)",
    border: "rgba(34,197,94,0.2)",
  },
  credited: {
    label: "Credited",
    color: "#8b5cf6",
    bg: "rgba(139,92,246,0.1)",
    border: "rgba(139,92,246,0.2)",
  },
  cancelled: {
    label: "Cancelled",
    color: "#ef4444",
    bg: "rgba(239,68,68,0.1)",
    border: "rgba(239,68,68,0.2)",
  },
};

export function RTVStatusBadge({ status }) {
  const cfg = RTV_STATUS[status] || RTV_STATUS.pending;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "0.15rem 0.5rem",
        borderRadius: "99px",
        fontSize: "0.6rem",
        fontWeight: 700,
        textTransform: "uppercase",
        background: cfg.bg,
        color: cfg.color,
        border: `1px solid ${cfg.border}`,
      }}
    >
      {cfg.label}
    </span>
  );
}

// ── FIFO Batch Deduction ───────────────────────────────────────────────────────
// Deducts qty from material batches in FIFO order. Mutates batches array.
// Returns { success, deducted, remaining, error }.
export function deductFromBatchesFIFO(batches, qtyToDeduct) {
  let remaining = qtyToDeduct;
  let deducted = 0;

  const sorted = [...batches].sort(
    (a, b) => new Date(a.dateReceived) - new Date(b.dateReceived),
  );

  for (const batch of sorted) {
    if (remaining <= 0) break;
    const available = batch.remainingQty || batch.qtyGood || 0;
    if (available <= 0) continue;
    const take = Math.min(remaining, available);
    batch.remainingQty = available - take;
    batch.qtyGood = batch.remainingQty;
    remaining -= take;
    deducted += take;
  }

  return {
    success: remaining === 0,
    deducted,
    remaining,
    error:
      remaining > 0
        ? `Insufficient stock. Could only deduct ${deducted} of ${qtyToDeduct}.`
        : null,
  };
}

// ── Restore Stock to Batch (for RTV replacement_received) ─────────────────────
// Finds the matching batch by PO number and restores damaged qty to good qty.
export function restoreStockToBatch(material, poNumber, qtyToRestore) {
  if (!material || !material.batches || !Array.isArray(material.batches))
    return false;

  const updatedBatches = material.batches.map((batch) => {
    if (
      batch.poNumber === poNumber &&
      (batch.qtyDamaged || batch.damagedQty || 0) > 0
    ) {
      const damaged = batch.qtyDamaged || batch.damagedQty || 0;
      const good = batch.qtyGood || 0;
      const restore = Math.min(qtyToRestore, damaged);
      return {
        ...batch,
        qtyGood: good + restore,
        qtyDamaged: damaged - restore,
        remainingQty: good + restore,
        updatedAt: new Date().toISOString(),
      };
    }
    return batch;
  });

  material.batches = updatedBatches;
  return true;
}
