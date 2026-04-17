import { useMemo, useState } from "react";

// Helper function to calculate FIFO cost from active batches
// FIFO = use oldest batches first (what you'll actually consume)
function computeFifoCost(material, requiredQty = 1) {
  if (!material || !material.batches || material.batches.length === 0) {
    return material?.baseCost || material?.averageCost || 0;
  }

  // Get all active batches sorted by date (FIFO order - oldest first)
  const activeBatches = material.batches
    .filter((b) => (b.remainingQty || 0) > 0)
    .sort((a, b) => new Date(a.dateReceived) - new Date(b.dateReceived));

  if (activeBatches.length === 0) {
    return material?.baseCost || material?.averageCost || 0;
  }

  // Simulate FIFO consumption to calculate actual cost
  let remaining = requiredQty;
  let totalCost = 0;

  for (const batch of activeBatches) {
    if (remaining <= 0) break;

    const take = Math.min(remaining, batch.remainingQty || 0);
    totalCost += take * (batch.unitCost || 0);
    remaining -= take;
  }

  // If we couldn't fulfill all (backorder), use the average of what we have
  if (remaining > 0) {
    const totalQty = activeBatches.reduce(
      (sum, b) => sum + (b.remainingQty || 0),
      0,
    );
    const totalValue = activeBatches.reduce(
      (sum, b) => sum + (b.remainingQty || 0) * (b.unitCost || 0),
      0,
    );
    const avgCost = totalQty > 0 ? totalValue / totalQty : 0;
    totalCost += remaining * avgCost;
  }

  return totalCost / requiredQty;
}

// Helper function to get cost statistics for a material (min, max, avg)
function getMaterialCostStats(material) {
  if (!material || !material.batches || material.batches.length === 0) {
    const cost = material?.baseCost || material?.averageCost || 0;
    return { avg: cost, min: cost, max: cost, batches: 0 };
  }

  const activeBatches = material.batches.filter(
    (b) => (b.remainingQty || 0) > 0,
  );

  if (activeBatches.length === 0) {
    const cost = material?.baseCost || material?.averageCost || 0;
    return { avg: cost, min: cost, max: cost, batches: 0 };
  }

  const costs = activeBatches.map((b) => b.unitCost || 0);
  const totalValue = activeBatches.reduce(
    (sum, b) => sum + (b.remainingQty || 0) * (b.unitCost || 0),
    0,
  );
  const totalQty = activeBatches.reduce(
    (sum, b) => sum + (b.remainingQty || 0),
    0,
  );
  const avg = totalQty > 0 ? totalValue / totalQty : material?.baseCost || material?.averageCost || 0;

  return {
    avg,
    min: Math.min(...costs),
    max: Math.max(...costs),
    batches: activeBatches.length,
  };
}

// Helper function to generate abbreviation from material name
function abbreviateMaterial(name) {
  if (!name) return "";
  // Split by common separators
  const parts = name.split(/[-\s]+/);

  // Take first letter of each word/part, up to 3-4 chars
  let abbr = "";
  for (const part of parts) {
    if (part.length === 0) continue;
    // Skip common filler words
    if (
      ["a", "an", "the", "of", "for", "with", "in", "on"].includes(
        part.toLowerCase(),
      )
    )
      continue;
    abbr += part[0].toUpperCase();
    if (abbr.length >= 4) break;
  }

  // Also extract numbers if present
  const numbers = name.match(/\d+/g);
  if (numbers && abbr.length > 0) {
    abbr += numbers[0].substring(0, 3); // Take first number group, max 3 digits
  }

  return abbr || name.substring(0, 4).toUpperCase();
}

// Helper function to generate SKU on-the-fly from BOM components
function generateBomSku(bom, materials) {
  if (!bom || !bom.components || bom.components.length === 0) return "BOM-NEW";

  // Get material names from components
  const materialNames = bom.components
    .map((c) => {
      const mat = materials.find((m) => m._id === c.inventoryId);
      return mat?.name || "";
    })
    .filter((name) => name);

  if (materialNames.length === 0) return "BOM-NEW";

  // Generate abbreviation for each material and combine
  const abbreviations = materialNames.map((name) => abbreviateMaterial(name));
  const combined = abbreviations.join("-");

  return `BOM-${combined}`;
}

function CopyIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
    </svg>
  );
}
function EditIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}
function TrashIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
    </svg>
  );
}
function ClockIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function BOMIcon({ filled }) {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
      <line x1="12" y1="22.08" x2="12" y2="12" />
    </svg>
  );
}
function BoxIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
      <path d="M20 2H4c-1 0-2 .9-2 2v3.01c0 .72.43 1.34 1 1.69V20c0 1.1 1.1 2 2 2h14c.9 0 2-.9 2-2V8.7c.57-.35 1-.97 1-1.69V4c0-1.1-1-2-2-2zm-5 12H9v-2h6v2zm5-7H4V4h16v3z" />
    </svg>
  );
}

export default function BOMCardList({
  boms,
  materials,
  search,
  onEdit,
  onDelete,
  onDuplicate,
}) {
  const [expandedGroups, setExpandedGroups] = useState({});

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return boms.filter(
      (b) =>
        !q ||
        b.productName.toLowerCase().includes(q) ||
        generateBomSku(b, materials).toLowerCase().includes(q) ||
        (b.variantGroup || "").toLowerCase().includes(q),
    );
  }, [boms, search, materials]);

  // Group BOMs by variantGroup
  const groupedBOMs = useMemo(() => {
    const groups = {};

    filtered.forEach((bom) => {
      const group = (bom.variantGroup || "").trim();
      // If no variantGroup, use productName as the group name so it still appears as a collapsible header
      const groupName = group || bom.productName;
      
      if (!groups[groupName]) {
        groups[groupName] = [];
      }
      groups[groupName].push(bom);
    });

    return groups;
  }, [filtered]);

  const toggleGroup = (groupName) => {
    setExpandedGroups((prev) => ({
      ...prev,
      [groupName]: !prev[groupName],
    }));
  };

  const expandAll = () => {
    const allExpanded = {};
    Object.keys(groupedBOMs).forEach((group) => {
      allExpanded[group] = true;
    });
    setExpandedGroups(allExpanded);
  };

  const collapseAll = () => {
    setExpandedGroups({});
  };

  const stats = useMemo(() => {
    const totalComponents = boms.reduce(
      (sum, b) => sum + (b.components || []).length,
      0,
    );
    // Count groups based on the actual grouped structure
    const groupCount = Object.keys(groupedBOMs).length;
    return { total: boms.length, totalComponents, groupCount };
  }, [boms, groupedBOMs]);

  return (
    <div>
      {/* Summary Stats */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2,1fr)",
          gap: "1rem",
          marginBottom: "1.5rem",
        }}
      >
        <div
          style={{
            background: "rgba(255,255,255,0.04)",
            borderRadius: "12px",
            padding: "1.25rem",
            position: "relative",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              position: "absolute",
              top: "-1rem",
              right: "-1rem",
              width: "5rem",
              height: "5rem",
              borderRadius: "50%",
              background: "rgba(212,168,67,0.05)",
              filter: "blur(2rem)",
            }}
          />
          <p
            style={{
              fontSize: "0.6rem",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.15em",
              color: "var(--gray)",
              marginBottom: "0.75rem",
            }}
          >
            Total Blueprints
          </p>
          <div
            style={{
              display: "flex",
              alignItems: "flex-end",
              justifyContent: "space-between",
            }}
          >
            <h3
              style={{
                fontSize: "2rem",
                fontWeight: 800,
                color: "#E5E2E1",
                margin: 0,
              }}
            >
              {stats.total}{" "}
              <span
                style={{
                  fontSize: "0.75rem",
                  fontWeight: 500,
                  color: "rgba(212,168,67,0.6)",
                }}
              >
                {stats.groupCount > 0
                  ? `${stats.groupCount} group${stats.groupCount > 1 ? "s" : ""}`
                  : "Active"}
              </span>
            </h3>
            <span style={{ color: "rgba(212,168,67,0.4)" }}>
              <BOMIcon />
            </span>
          </div>
        </div>
        <div
          style={{
            background: "rgba(255,255,255,0.04)",
            borderRadius: "12px",
            padding: "1.25rem",
          }}
        >
          <p
            style={{
              fontSize: "0.6rem",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.15em",
              color: "var(--gray)",
              marginBottom: "0.75rem",
            }}
          >
            Material Items
          </p>
          <div
            style={{
              display: "flex",
              alignItems: "flex-end",
              justifyContent: "space-between",
            }}
          >
            <h3
              style={{
                fontSize: "2rem",
                fontWeight: 800,
                color: "#E5E2E1",
                margin: 0,
              }}
            >
              {stats.totalComponents}
            </h3>
            <span style={{ color: "rgba(229,226,225,0.2)" }}>
              <BoxIcon />
            </span>
          </div>
        </div>
      </div>

      {/* BOM Cards */}
      <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        {filtered.length === 0 ? (
          <div
            style={{
              padding: "3rem",
              textAlign: "center",
              color: "var(--gray)",
              background: "rgba(255,255,255,0.02)",
              borderRadius: "12px",
              border: "1px solid var(--border)",
            }}
          >
            {boms.length === 0
              ? 'No BOMs yet. Click "Add BOM" to define product recipes.'
              : "No BOMs match your search."}
          </div>
        ) : (
          <>
            {/* Expand/Collapse Controls */}
            {Object.keys(groupedBOMs).length > 0 && (
              <div
                style={{
                  display: "flex",
                  gap: "0.5rem",
                  justifyContent: "flex-end",
                  marginBottom: "0.5rem",
                }}
              >
                <button
                  type="button"
                  onClick={expandAll}
                  style={{
                    background: "none",
                    border: "1px solid rgba(212,168,67,0.3)",
                    borderRadius: "6px",
                    padding: "0.35rem 0.75rem",
                    color: "#D4A843",
                    fontSize: "0.7rem",
                    fontWeight: 700,
                    cursor: "pointer",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                  }}
                >
                  Expand All
                </button>
                <button
                  type="button"
                  onClick={collapseAll}
                  style={{
                    background: "none",
                    border: "1px solid rgba(212,168,67,0.3)",
                    borderRadius: "6px",
                    padding: "0.35rem 0.75rem",
                    color: "#D4A843",
                    fontSize: "0.7rem",
                    fontWeight: 700,
                    cursor: "pointer",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                  }}
                >
                  Collapse All
                </button>
              </div>
            )}

            {/* Grouped BOMs */}
            {Object.entries(groupedBOMs).map(([groupName, groupBOMs]) => {
              const isExpanded = expandedGroups[groupName] === true;
              return (
                <div key={groupName}>
                  {/* Group Header */}
                  <button
                    type="button"
                    onClick={() => toggleGroup(groupName)}
                    style={{
                      width: "100%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "0.875rem 1.25rem",
                      background: isExpanded
                        ? "rgba(212,168,67,0.08)"
                        : "rgba(255,255,255,0.02)",
                      border: `1px solid ${isExpanded ? "rgba(212,168,67,0.3)" : "rgba(255,255,255,0.06)"}`,
                      borderRadius: "10px",
                      marginBottom: isExpanded ? "0.5rem" : "0",
                      cursor: "pointer",
                      transition: "all 0.2s",
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
                        stroke={isExpanded ? "#D4A843" : "var(--gray)"}
                        strokeWidth="2.5"
                        style={{
                          transform: isExpanded ? "rotate(90deg)" : "none",
                          transition: "transform 0.2s",
                        }}
                      >
                        <path d="M9 18l6-6-6-6" />
                      </svg>
                      <span
                        style={{
                          fontSize: "0.85rem",
                          fontWeight: 700,
                          color: "#E5E2E1",
                          textTransform: "uppercase",
                          letterSpacing: "0.05em",
                        }}
                      >
                        {groupName}
                      </span>
                      <span
                        style={{
                          fontSize: "0.7rem",
                          fontWeight: 600,
                          color: "rgba(212,168,67,0.6)",
                          background: "rgba(212,168,67,0.1)",
                          padding: "0.15rem 0.5rem",
                          borderRadius: "99px",
                        }}
                      >
                        {groupBOMs.length} variant{groupBOMs.length !== 1 ? "s" : ""}
                      </span>
                    </div>
                    <span
                      style={{
                        fontSize: "0.7rem",
                        color: "var(--gray)",
                        fontWeight: 600,
                      }}
                    >
                      {isExpanded ? "Click to collapse" : "Click to expand"}
                    </span>
                  </button>

                  {/* Group Content */}
                  {isExpanded && (
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "0.75rem",
                        paddingLeft: "1.5rem",
                      }}
                    >
                      {groupBOMs.map((b) => (
                        <BOMCard
                          key={b._id}
                          bom={b}
                          materials={materials}
                          onEdit={onEdit}
                          onDelete={onDelete}
                          onDuplicate={onDuplicate}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}

function BOMCard({ bom, materials, onEdit, onDelete, onDuplicate }) {
  const totalCost = useMemo(
    () =>
      (bom.components || []).reduce((sum, c) => {
        const mat = materials.find((m) => m._id === c.inventoryId);
        // Use FIFO cost - what you'll actually pay when consuming from oldest stock
        const cost = computeFifoCost(mat, c.qty || 1);
        return sum + cost * (c.qty || 1);
      }, 0),
    [bom, materials],
  );

  const componentDetails = useMemo(
    () =>
      (bom.components || []).map((c) => {
        const mat = materials.find((m) => m._id === c.inventoryId);
        const stats = getMaterialCostStats(mat);

        // Get detailed batch breakdown with FIFO ordering
        const batchBreakdown =
          mat?.batches
            ?.filter((b) => (b.remainingQty || 0) > 0)
            .sort((a, b) => new Date(a.dateReceived) - new Date(b.dateReceived))
            .map((batch) => ({
              batchId: batch.batchId,
              invoiceNumber: batch.invoiceNumber,
              vendorName: batch.vendorName || "General Merchandise",
              unitCost: batch.unitCost || 0,
              remainingQty: batch.remainingQty || 0,
              dateReceived: batch.dateReceived,
              totalValue: (batch.remainingQty || 0) * (batch.unitCost || 0),
            })) || [];

        // Calculate FIFO cost for this component
        const fifoCost = computeFifoCost(mat, c.qty || 1);

        // Check if any component is in backorder (insufficient stock)
        const totalAvailableStock = batchBreakdown.reduce(
          (sum, b) => sum + b.remainingQty,
          0,
        );
        const isInBackorder = totalAvailableStock < (c.qty || 1);
        const backorderQty = isInBackorder
          ? (c.qty || 1) - totalAvailableStock
          : 0;

        return {
          name: mat?.name || "Unknown",
          qty: c.qty || 1,
          uom: mat?.uom || "pcs",
          // Use FIFO cost for line cost (actual consumption cost)
          fifoCost,
          lineCost: fifoCost * (c.qty || 1),
          // Cost range info
          minCost: stats.min,
          maxCost: stats.max,
          batchCount: stats.batches,
          hasMultipleCosts: stats.batches > 1 && stats.min !== stats.max,
          // Batch breakdown with FIFO details
          batchBreakdown,
          totalAvailableStock,
          isInBackorder,
          backorderQty,
          inventoryId: c.inventoryId,
        };
      }),
    [bom, materials],
  );

  const lastUpdated = bom.createdAt
    ? new Date(bom.createdAt).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "—";

  return (
    <div
      style={{
        background: "rgba(255,255,255,0.04)",
        borderRadius: "12px",
        padding: "1rem",
        border: "1px solid transparent",
        transition: "all 0.3s",
        cursor: "default",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = "rgba(78,70,54,0.3)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "transparent";
      }}
    >
      {/* Card Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: "1rem",
          paddingBottom: "1rem",
          borderBottom: "1px solid rgba(78,70,54,0.1)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <div
            style={{
              width: "40px",
              height: "40px",
              borderRadius: "10px",
              background: "rgba(212,168,67,0.15)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#D4A843",
              flexShrink: 0,
            }}
          >
            <BOMIcon filled />
          </div>
          <div>
            {/* Variant group badge */}
            {bom.variantGroup && (
              <span
                style={{
                  fontSize: "0.55rem",
                  background: "rgba(212,168,67,0.1)",
                  color: "rgba(212,168,67,0.7)",
                  padding: "0.1rem 0.45rem",
                  borderRadius: "3px",
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  display: "inline-block",
                  marginBottom: "0.25rem",
                }}
              >
                {bom.variantGroup}
              </span>
            )}
            <h3
              style={{
                fontSize: "0.95rem",
                fontWeight: 700,
                color: "#E5E2E1",
                margin: "0 0 0.15rem 0",
              }}
            >
              {bom.variantGroup
                ? bom.productName.replace(`${bom.variantGroup} - `, "")
                : bom.productName}
            </h3>
            <code
              style={{
                fontSize: "0.55rem",
                background: "rgba(14,14,14,0.6)",
                padding: "0.1rem 0.4rem",
                borderRadius: "3px",
                color: "rgba(212,168,67,0.7)",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              {generateBomSku(bom, materials)}
            </code>
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <p
            style={{
              fontSize: "0.5rem",
              fontWeight: 800,
              textTransform: "uppercase",
              letterSpacing: "0.15em",
              color: "var(--gray)",
              margin: "0 0 0.15rem 0",
            }}
          >
            Cost
          </p>
          <p
            style={{
              fontSize: "1.25rem",
              fontWeight: 800,
              color: "#D4A843",
              margin: 0,
            }}
          >
            ₱{totalCost.toLocaleString("en-PH", { minimumFractionDigits: 2 })}
          </p>
        </div>
      </div>

      {/* Material Breakdown */}
      {componentDetails.length > 0 && (
        <div style={{ marginTop: "1rem" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "0.5rem",
            }}
          >
            <div
              style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
            >
              <h4
                style={{
                  fontSize: "0.55rem",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.15em",
                  color: "var(--gray)",
                  margin: 0,
                }}
              >
                Material Breakdown
              </h4>
              {componentDetails.some((cd) => cd.isInBackorder) && (
                <span
                  style={{
                    fontSize: "0.6rem",
                    fontWeight: 700,
                    color: "#D4A843",
                    background: "rgba(212,168,67,0.12)",
                    border: "1px solid rgba(212,168,67,0.2)",
                    padding: "0.15rem 0.5rem",
                    borderRadius: "99px",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                  }}
                >
                  ⚠ Need to Order
                </span>
              )}
            </div>
            <span
              style={{
                fontSize: "0.55rem",
                color: "rgba(229,226,225,0.3)",
                textTransform: "uppercase",
              }}
            >
              {componentDetails.length} items
            </span>
          </div>
          <div
            style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}
          >
            {componentDetails.map((cd, i) => (
              <div key={i}>
                {/* Main component row */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr auto",
                    alignItems: "center",
                    background: "rgba(14,14,14,0.3)",
                    padding: "0.6rem 0.75rem",
                    borderRadius: "8px",
                    border: "1px solid rgba(78,70,54,0.05)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.5rem",
                      flexWrap: "wrap",
                    }}
                  >
                    <span
                      style={{
                        width: "4px",
                        height: "4px",
                        borderRadius: "50%",
                        background: cd.isInBackorder
                          ? "#D4A843"
                          : "rgba(212,168,67,0.4)",
                        flexShrink: 0,
                      }}
                    />
                    <span
                      style={{
                        fontSize: "0.75rem",
                        fontWeight: 500,
                        color: "#E5E2E1",
                      }}
                    >
                      {cd.name}
                    </span>
                    <span style={{ fontSize: "0.65rem", color: "var(--gray)" }}>
                      ×{cd.qty} {cd.uom}
                    </span>
                    {cd.isInBackorder && (
                      <span
                        style={{
                          fontSize: "0.6rem",
                          fontWeight: 700,
                          color: "#D4A843",
                          background: "rgba(212,168,67,0.12)",
                          border: "1px solid rgba(212,168,67,0.2)",
                          padding: "0.1rem 0.4rem",
                          borderRadius: "3px",
                          textTransform: "uppercase",
                        }}
                      >
                        ⚠ Need to Order: {cd.backorderQty} {cd.uom}
                      </span>
                    )}
                  </div>
                  <div
                    style={{
                      fontSize: "0.75rem",
                      fontWeight: 700,
                      color: "#E5E2E1",
                      fontFamily: "monospace",
                    }}
                  >
                    ₱
                    {cd.lineCost.toLocaleString("en-PH", {
                      minimumFractionDigits: 2,
                    })}
                  </div>
                </div>

                {/* Batch breakdown with FIFO details */}
                {cd.batchBreakdown.length > 0 && (
                  <div
                    style={{
                      marginTop: "0.35rem",
                      marginLeft: "1rem",
                      paddingLeft: "0.75rem",
                      borderLeft: "2px solid rgba(212,168,67,0.2)",
                      display: "flex",
                      flexDirection: "column",
                      gap: "0.25rem",
                    }}
                  >
                    {cd.batchBreakdown.map((batch, j) => (
                      <div
                        key={j}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          fontSize: "0.65rem",
                          padding: "0.3rem 0",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "0.5rem",
                            flex: 1,
                          }}
                        >
                          <span
                            style={{
                              color: "rgba(229,226,225,0.4)",
                              fontSize: "0.6rem",
                            }}
                          >
                            →
                          </span>
                          <span style={{ color: "rgba(229,226,225,0.6)" }}>
                            {batch.invoiceNumber || "No Invoice"}
                          </span>
                          <span
                            style={{
                              color: "rgba(212,168,67,0.6)",
                              fontSize: "0.6rem",
                            }}
                          >
                            ({batch.vendorName})
                          </span>
                          <span style={{ color: "var(--gray)" }}>
                            {batch.remainingQty} {cd.uom} avail
                          </span>
                        </div>
                        <span
                          style={{
                            color: "#E5E2E1",
                            fontWeight: 600,
                            fontFamily: "monospace",
                            minWidth: "60px",
                            textAlign: "right",
                          }}
                        >
                          ₱
                          {batch.unitCost.toLocaleString("en-PH", {
                            minimumFractionDigits: 2,
                          })}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Actions Footer */}
      <div
        style={{
          marginTop: "1rem",
          paddingTop: "0.75rem",
          borderTop: "1px solid rgba(78,70,54,0.1)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.25rem",
            fontSize: "0.6rem",
            color: "var(--gray)",
          }}
        >
          <ClockIcon /> {lastUpdated}
        </div>
        <div style={{ display: "flex", gap: "0.35rem" }}>
          {onDuplicate && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDuplicate(bom);
              }}
              style={actionBtnBase}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "rgba(255,255,255,0.1)";
                e.currentTarget.style.color = "#E5E2E1";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "rgba(255,255,255,0.06)";
                e.currentTarget.style.color = "var(--gray)";
              }}
            >
              <CopyIcon />
            </button>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onEdit(bom);
            }}
            style={actionBtnBase}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "rgba(255,255,255,0.1)";
              e.currentTarget.style.color = "#E5E2E1";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "rgba(255,255,255,0.06)";
              e.currentTarget.style.color = "var(--gray)";
            }}
          >
            <EditIcon />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete(bom._id);
            }}
            style={{
              ...actionBtnBase,
              background: "rgba(239,68,68,0.08)",
              color: "#f87171",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "rgba(239,68,68,0.15)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "rgba(239,68,68,0.08)";
            }}
          >
            <TrashIcon />
          </button>
        </div>
      </div>
    </div>
  );
}

const actionBtnBase = {
  display: "flex",
  alignItems: "center",
  gap: "0.25rem",
  padding: "0.35rem 0.6rem",
  background: "rgba(255,255,255,0.06)",
  border: "none",
  borderRadius: "6px",
  color: "var(--gray)",
  fontSize: "0.65rem",
  fontWeight: 600,
  cursor: "pointer",
  transition: "all 0.15s",
};
