"use client";

/* eslint-disable @next/next/no-img-element */

import ErrorBoundary from "../../../../components/ErrorBoundary";

/**
 * PRODUCT LIST PAGE - with Full Edit Modal
 * Edit modal now reuses the full Add Products form UI, pre-filled with existing product data.
 *
 * CONNECTED TO MONGODB BACKEND via Laravel API
 * - Fetches products from GET /api/admin/products
 * - Saves products via PUT /api/admin/products/:id
 * - Deletes products via DELETE /api/admin/products/:id
 */

import { useAuth } from "@/contexts/AuthContext";
import { fetchInventory, fetchBoms } from "@/lib/inventoryApi";
import { fetchAllOrders } from "@/lib/ordersApi";
import {
  createProduct,
  deleteProduct,
  fetchProducts,
  togglePublishProduct,
  updateProduct,
  uploadImage,
} from "@/lib/productApi";
import { useRouter, useSearchParams } from "next/navigation";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

// ── Reusable Number Input ──────────────────────────────────────────────────────
function NumberInput({
  value,
  onChange,
  min = 0,
  max,
  placeholder,
  className,
  disabled,
  step,
}) {
  const handleChange = (e) => {
    const val = e.target.value;
    if (val === "" || /^\d*\.?\d*$/.test(val)) {
      onChange({ ...e, target: { ...e.target, value: val } });
    }
  };
  return (
    <input
      type="number"
      className={className}
      value={value}
      onChange={handleChange}
      onKeyDown={(e) =>
        ["e", "E", "+", "-"].includes(e.key) && e.preventDefault()
      }
      onWheel={(e) => {
        e.target.blur();
        e.preventDefault();
      }}
      min={min}
      max={max}
      placeholder={placeholder}
      disabled={disabled}
      step={step}
    />
  );
}

const sanitizeNumber = (val) => {
  if (val === "") return "";
  const num = parseFloat(val);
  return isNaN(num) || num < 0 ? "0" : val;
};

function getAvailableQty(inv) {
  if (!inv) return 0;
  if (inv.batches && inv.batches.length) {
    return inv.batches.reduce((sum, b) => {
      const rem = b.remainingQty != null ? b.remainingQty : (b.goodQty ?? b.qtyGood ?? 0);
      return sum + Math.max(0, rem);
    }, 0);
  }
  return inv.stockQty || 0;
}

/** Maps frontend product shape to Laravel API (name, priceTiers, strips id). */
function normalizeProductForApi(p) {
  const name = p.name || p.productName || p.subCategoryName || "";
  const priceTiers = p.priceTiers || p.tiers || [];
  // eslint-disable-next-line no-unused-vars
  const { id, _id, tiers, productName, ...rest } = p;
  return {
    ...rest,
    name,
    priceTiers,
  };
}

const EMPTY_NEW_PRODUCT = {
  productName: "",
  subCategoryName: "",
  subCategoryCode: "",
  category: "",
  description: "",
  priceType: "fixed",
  trackInventory: true,
  stock: "",
  inventoryId: "",
  storeStockCap: "",
  price: "",
  variantPrices: {},
  tiers: [{ id: 1, minQty: 1, maxQty: 20, prices: { __base__: "" } }],
  variantGroups: [],
  combinations: [],
  thumbnail: null,
  images: [],
  isPublished: false,
  isArchived: false,
};

function comboLabel(combo) {
  return Object.values(combo).join(" / ");
}

// ── Combobox ───────────────────────────────────────────────────────────────────
function Combobox({ value, onChange, options, placeholder, label, required }) {
  const [open, setOpen] = useState(false);
  const [inputVal, setInputVal] = useState(value || "");
  const ref = useRef(null);
  useEffect(() => {
    setInputVal(value || "");
  }, [value]);
  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);
  const filtered = options.filter((o) =>
    o.toLowerCase().includes((inputVal || "").toLowerCase()),
  );
  const showAdd =
    inputVal &&
    !options.find((o) => o.toLowerCase() === inputVal.toLowerCase());
  const select = (val) => {
    setInputVal(val);
    onChange(val);
    setOpen(false);
  };
  return (
    <div ref={ref} className="combobox-root">
      {label && (
        <label className="form-label">
          {label} {required && <span className="required">*</span>}
        </label>
      )}
      <div className="combobox-field">
        <input
          type="text"
          className="form-input"
          value={inputVal}
          placeholder={placeholder}
          required={required}
          onChange={(e) => {
            setInputVal(e.target.value);
            onChange(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
        />
        <button
          type="button"
          className="combobox-toggle"
          onClick={() => setOpen((o) => !o)}
        >
          {open ? "▲" : "▼"}
        </button>
      </div>
      {open && (filtered.length > 0 || showAdd) && (
        <div className="combobox-menu">
          {filtered.map((opt, i) => (
            <button
              key={i}
              type="button"
              className={`combobox-item${opt === value ? " active" : ""}`}
              onClick={() => select(opt)}
            >
              {opt}
            </button>
          ))}
          {showAdd && (
            <button
              type="button"
              className="combobox-item combobox-add"
              onClick={() => select(inputVal)}
            >
              <span>+</span> Add "{inputVal}"
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── InventoryCombobox ──────────────────────────────────────────────────────────
function InventoryCombobox({
  value,
  onChange,
  inventoryList,
  placeholder,
  label,
  currentProductId,
  products,
}) {
  const [open, setOpen] = useState(false);
  const [inputVal, setInputVal] = useState("");
  const ref = useRef(null);

  const linkedProductIds = useMemo(() => {
    // Use products from state instead of localStorage
    return new Set(
      products
        .filter((p) => p.id !== currentProductId)
        .map((p) => p.inventoryId)
        .filter((id) => id),
    );
  }, [currentProductId, products]);

  // Only show active inventory items (exclude archived)
  const availableInventoryList = inventoryList.filter(
    (item) => item.isActive !== false && !linkedProductIds.has(item.id),
  );

  const getDisplayName = useCallback(
    (id) => {
      const item =
        availableInventoryList.find((inv) => inv.id === id) ||
        inventoryList.find((inv) => inv.id === id);
      if (!item) return "";
      return `${item.name} (${item.category}) - ${item.isOnDemand ? "Upon Order" : `${item.stockQty} stocks`}`;
    },
    [availableInventoryList, inventoryList],
  );

  useEffect(() => {
    setInputVal(value ? getDisplayName(value) : "");
  }, [value, getDisplayName]);

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filtered = availableInventoryList.filter((item) => {
    const dn = `${item.name} (${item.category}) - ${item.isOnDemand ? "Upon Order" : `${item.stockQty} stocks`}`;
    return dn.toLowerCase().includes((inputVal || "").toLowerCase());
  });

  const select = (item) => {
    const dn = `${item.name} (${item.category}) - ${item.isOnDemand ? "Upon Order" : `${item.stockQty} stocks`}`;
    setInputVal(dn);
    onChange(item.id);
    setOpen(false);
  };

  return (
    <div ref={ref} className="combobox-root">
      {label && <label className="form-label">{label}</label>}
      <div className="combobox-field">
        <input
          type="text"
          className="form-input"
          value={inputVal}
          placeholder={placeholder}
          readOnly
          onFocus={() => setOpen(true)}
        />
        <div
          style={{
            position: "absolute",
            right: "0.75rem",
            top: "50%",
            transform: "translateY(-50%)",
            display: "flex",
            alignItems: "center",
            gap: "0.25rem",
          }}
        >
          {value && (
            <button
              type="button"
              onClick={() => {
                setInputVal("");
                onChange("");
                setOpen(true);
              }}
              style={{
                background: "none",
                border: "none",
                color: "var(--gray)",
                cursor: "pointer",
                fontSize: "1.2rem",
                padding: "0 0.25rem",
                lineHeight: "1",
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
          )}
          <button
            type="button"
            className="combobox-toggle"
            onClick={() => setOpen((o) => !o)}
            style={{
              background: "none",
              border: "none",
              color: "var(--gray)",
              cursor: "pointer",
              fontSize: "0.72rem",
              padding: "0",
            }}
          >
            {open ? " " : " "}
          </button>
        </div>
      </div>
      {open && (
        <div className="combobox-menu">
          {filtered.length === 0 ? (
            <div
              style={{
                padding: "1rem",
                color: "var(--gray)",
                fontSize: "0.85rem",
                textAlign: "center",
              }}
            >
              No available inventory items
            </div>
          ) : (
            filtered.map((item, i) => {
              const dn = `${item.name} (${item.category}) - ${item.isOnDemand ? "Upon Order" : `${item.stockQty} stocks`}`;
              return (
                <button
                  key={i}
                  type="button"
                  className={`combobox-item${item.id === value ? " active" : ""}`}
                  onClick={() => select(item)}
                >
                  {dn}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

// ── SmartPricingTable ──────────────────────────────────────────────────────────
function buildColumnGroups(variantGroups, combinations, groupChecks) {
  if (variantGroups.length === 0) return [];
  if (variantGroups.length === 1) {
    const g = variantGroups[0];
    return g.options.map((opt) => {
      const combo = combinations.find((c) => c.combo[g.id] === opt.value);
      return {
        key: opt.value,
        primaryVal: null,
        secondaryVals: [opt.value],
        label: opt.value,
        comboIds: combo ? [combo.id] : [],
        isMerged: false,
      };
    });
  }
  const [g1, g2] = variantGroups;
  const cols = [];
  g1.options.forEach((p) => {
    const checked = groupChecks[p.value] || new Set();
    const checkedArr = g2.options.filter((s) => checked.has(s.value));
    const uncheckedArr = g2.options.filter((s) => !checked.has(s.value));
    if (checkedArr.length >= 2) {
      const comboIds = checkedArr
        .map((s) =>
          combinations.find(
            (c) => c.combo[g1.id] === p.value && c.combo[g2.id] === s.value,
          ),
        )
        .filter(Boolean)
        .map((c) => c.id);
      cols.push({
        key: `${p.value}::${checkedArr.map((s) => s.value).join("|")}`,
        primaryVal: p.value,
        secondaryVals: checkedArr.map((s) => s.value),
        label: checkedArr.map((s) => s.value).join(" | "),
        comboIds,
        isMerged: true,
      });
    }
    if (checkedArr.length === 1) {
      const s = checkedArr[0];
      const combo = combinations.find(
        (c) => c.combo[g1.id] === p.value && c.combo[g2.id] === s.value,
      );
      cols.push({
        key: `${p.value}::${s.value}`,
        primaryVal: p.value,
        secondaryVals: [s.value],
        label: s.value,
        comboIds: combo ? [combo.id] : [],
        isMerged: false,
      });
    }
    uncheckedArr.forEach((s) => {
      const combo = combinations.find(
        (c) => c.combo[g1.id] === p.value && c.combo[g2.id] === s.value,
      );
      cols.push({
        key: `${p.value}::${s.value}`,
        primaryVal: p.value,
        secondaryVals: [s.value],
        label: s.value,
        comboIds: combo ? [combo.id] : [],
        isMerged: false,
      });
    });
  });
  return cols;
}

function getColumnPrice(comboIds, prices) {
  if (!comboIds.length) return "";
  const vals = comboIds.map((id) => prices[id] || "");
  const nonEmpty = vals.find((v) => v !== "");
  return nonEmpty !== undefined ? nonEmpty : "";
}

function SmartPricingTable({
  tiers,
  variantGroups,
  combinations,
  groupChecks,
  onPriceChange,
  updateTierRange,
  removeTier,
  mode,
}) {
  const hasVariants = variantGroups.length > 0 && combinations.length > 0;
  const columnGroups = buildColumnGroups(
    variantGroups,
    combinations,
    groupChecks,
  );

  if (!hasVariants) {
    return (
      <div className="tier-table-wrap">
        <table className="tier-table">
          <thead>
            <tr>
              {mode === "tiered" && (
                <>
                  <th>Tier</th>
                  <th>Min Qty</th>
                  <th>Max Qty</th>
                </>
              )}
              <th>Price (₱)</th>
              {mode === "tiered" && <th></th>}
            </tr>
          </thead>
          <tbody>
            {tiers.map((tier, idx) => (
              <tr key={tier.id}>
                {mode === "tiered" && (
                  <>
                    <td>
                      <span className="tier-badge">Tier {idx + 1}</span>
                    </td>
                    <td>
                      <NumberInput
                        className="tier-input"
                        value={tier.minQty ?? ""}
                        placeholder=""
                        min={0}
                        onChange={(e) => {
                          const v = e.target.value;
                          if (v === "" || parseInt(v) >= 0)
                            updateTierRange(tier.id, "minQty", v);
                        }}
                      />
                    </td>
                    <td>
                      <NumberInput
                        className="tier-input"
                        value={tier.maxQty ?? ""}
                        placeholder="∞"
                        min={0}
                        onChange={(e) => {
                          const v = e.target.value;
                          if (v === "" || parseInt(v) >= 0)
                            updateTierRange(tier.id, "maxQty", v);
                        }}
                      />
                    </td>
                  </>
                )}
                <td>
                  <div className="tier-price-cell">
                    <span className="peso">₱</span>
                    <NumberInput
                      className="tier-input"
                      value={tier.prices["__base__"] || ""}
                      onChange={(e) =>
                        onPriceChange(
                          tier.id,
                          "__base__",
                          sanitizeNumber(e.target.value),
                        )
                      }
                      placeholder="0"
                      min={0}
                      step="0.01"
                    />
                  </div>
                </td>
                {mode === "tiered" && (
                  <td>
                    {tiers.length > 1 && (
                      <button
                        type="button"
                        className="btn-remove-tier"
                        onClick={() => removeTier(tier.id)}
                      >
                        Remove
                      </button>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="tier-table-wrap">
      <table className="tier-table smart-tier-table">
        <thead>
          <tr>
            {mode === "tiered" && (
              <>
                <th>Tier</th>
                <th>Min Qty</th>
                <th>Max Qty</th>
              </>
            )}
            {columnGroups.map((cg) => {
              const fullLabel = cg.primaryVal
                ? `${cg.primaryVal} / ${cg.label}`
                : cg.label;
              return (
                <th
                  key={cg.key}
                  className={`tier-variant-header${cg.isMerged ? " tier-header-merged" : ""}`}
                >
                  {cg.isMerged ? (
                    <span className="tier-merged-label">
                      {fullLabel}{" "}
                      <span className="tier-merged-badge">same ₱</span>
                    </span>
                  ) : (
                    fullLabel
                  )}
                </th>
              );
            })}
            {mode === "tiered" && <th></th>}
          </tr>
        </thead>
        <tbody>
          {tiers.map((tier, idx) => (
            <tr key={tier.id}>
              {mode === "tiered" && (
                <>
                  <td>
                    <span className="tier-badge">Tier {idx + 1}</span>
                  </td>
                  <td>
                    <NumberInput
                      className="tier-input"
                      value={tier.minQty ?? ""}
                      placeholder="1"
                      min={0}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v === "" || parseInt(v) >= 0)
                          updateTierRange(tier.id, "minQty", v);
                      }}
                    />
                  </td>
                  <td>
                    <NumberInput
                      className="tier-input"
                      value={tier.maxQty ?? ""}
                      placeholder="∞"
                      min={0}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v === "" || parseInt(v) >= 0)
                          updateTierRange(tier.id, "maxQty", v);
                      }}
                    />
                  </td>
                </>
              )}
              {columnGroups.map((cg) => {
                const colPrice = getColumnPrice(cg.comboIds, tier.prices);
                return (
                  <td
                    key={cg.key}
                    className={cg.isMerged ? "smart-cell-merged" : ""}
                  >
                    <div className="tier-price-cell">
                      <span className="peso">₱</span>
                      <NumberInput
                        className="tier-input"
                        value={colPrice}
                        onChange={(e) => {
                          const newVal = sanitizeNumber(e.target.value);
                          cg.comboIds.forEach((cid) =>
                            onPriceChange(tier.id, cid, newVal),
                          );
                        }}
                        placeholder="0"
                        min={0}
                        step="0.01"
                      />
                    </div>
                  </td>
                );
              })}
              {mode === "tiered" && (
                <td>
                  {tiers.length > 1 && (
                    <button
                      type="button"
                      className="btn-remove-tier"
                      onClick={() => removeTier(tier.id)}
                    >
                      Remove
                    </button>
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── VariantGroupingCheckboxes ──────────────────────────────────────────────────
function VariantGroupingCheckboxes({
  variantGroups,
  groupChecks,
  onGroupChecksChange,
}) {
  if (variantGroups.length < 2) return null;
  const [g1, g2] = variantGroups;
  const toggle = (primaryVal, secondaryVal) => {
    const current = groupChecks[primaryVal] || new Set();
    const next = new Set(current);
    next.has(secondaryVal) ? next.delete(secondaryVal) : next.add(secondaryVal);
    onGroupChecksChange({ ...groupChecks, [primaryVal]: next });
  };
  const toggleAll = (primaryVal) => {
    const current = groupChecks[primaryVal] || new Set();
    const allVals = g2.options.map((o) => o.value);
    const allChecked = allVals.every((v) => current.has(v));
    onGroupChecksChange({
      ...groupChecks,
      [primaryVal]: allChecked ? new Set() : new Set(allVals),
    });
  };
  return (
    <div className="vgc-wrapper">
      <div className="vgc-hint">Merge variants with the same price</div>
      <div className="vgc-rows">
        {g1.options.map((p) => {
          const checked = groupChecks[p.value] || new Set();
          const allChecked =
            g2.options.length > 0 &&
            g2.options.every((o) => checked.has(o.value));
          const someChecked = g2.options.some((o) => checked.has(o.value));
          return (
            <div key={p.id} className="vgc-row">
              <span className="vgc-primary-badge">{p.value}</span>
              <span className="vgc-g2-name">{g2.name || "V2"}:</span>
              <label className="vgc-check-label vgc-all-label">
                <input
                  type="checkbox"
                  className="vgc-checkbox"
                  checked={allChecked}
                  ref={(el) => {
                    if (el) el.indeterminate = someChecked && !allChecked;
                  }}
                  onChange={() => toggleAll(p.value)}
                />
                <span className="vgc-check-text">(all)</span>
              </label>
              {g2.options.map((s) => (
                <label key={s.id} className="vgc-check-label">
                  <input
                    type="checkbox"
                    className="vgc-checkbox"
                    checked={checked.has(s.value)}
                    onChange={() => toggle(p.value, s.value)}
                  />
                  <span className="vgc-check-text">{s.value}</span>
                </label>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── EditProductModal — Full form reusing Add Products UI ──────────────────────
function EditProductModal({
  product,
  inventoryList,
  onClose,
  onSave,
  onPriceError,
  products,
  token,
  isNew,
}) {
  const [formData, setFormData] = useState({
    category: product.category || "",
    subCategoryName: product.subCategoryName || "",
    subCategoryCode: product.subCategoryCode || "",
    description: product.description || "",
    priceType: product.priceType || "fixed",
    trackInventory: product.trackInventory !== false,
    stock:
      product.stock !== null && product.stock !== undefined
        ? String(product.stock)
        : "",
    inventoryId: product.inventoryId || "",
    storeStockCap: product.storeStockCap != null ? String(product.storeStockCap) : "",
  });

  const [fixedPrice, setFixedPrice] = useState(product.price || "");
  const [fixedPriceVariants, setFixedPriceVariants] = useState(
    product.variantPrices || {},
  );
  const [tiers, setTiers] = useState(
    product.tiers && product.tiers.length > 0
      ? product.tiers
      : [{ id: 1, minQty: 1, maxQty: 20, prices: { __base__: "" } }],
  );

  const [variantGroups, setVariantGroups] = useState(
    product.variantGroups || [],
  );
  const [combinations, setCombinations] = useState(product.combinations || []);
  const [optionInputs, setOptionInputs] = useState({});
  const [groupChecks, setGroupChecks] = useState({});
  const [duplicateWarning, setDuplicateWarning] = useState("");
  const [variantWarning, setVariantWarning] = useState("");
  const [optionImages, setOptionImages] = useState(() => {
    // Initialize with existing images from product
    const initialImages = {};
    (product.variantGroups || []).forEach((group) => {
      (group.options || []).forEach((opt) => {
        if (opt.image) {
          initialImages[`${group.id}-${opt.id}`] = {
            preview:
              typeof opt.image === "string" ? opt.image : opt.image.preview,
          };
        }
      });
    });
    return initialImages;
  });

  const [thumbnail, setThumbnail] = useState(
    product.thumbnail ? { preview: product.thumbnail } : null,
  );
  const [images, setImages] = useState(
    (product.images || []).map((url, i) => ({ id: i, preview: url })),
  );
  const [dragOver, setDragOver] = useState(false);
  const [dragOverThumb, setDragOverThumb] = useState(false);
  const [uploadingMedia, setUploadingMedia] = useState(false);

  const [showStockErrorModal, setShowStockErrorModal] = useState(false);
  const [maxStockQty, setMaxStockQty] = useState(0);

  const hasVariants = combinations.length > 0;

  // Sync formData when inventory changes (e.g., Upon Order to Track Stock)
  useEffect(() => {
    const inv = inventoryList.find((i) => i.id === formData.inventoryId);
    if (inv && inv.id) {
      // If inventory changed from Upon Order to Track Stock or vice versa
      const shouldTrackInventory = !inv.isOnDemand;
      const currentTrackInventory = formData.trackInventory;

      if (shouldTrackInventory !== currentTrackInventory) {
        setFormData((prev) => ({
          ...prev,
          trackInventory: shouldTrackInventory,
          stock: shouldTrackInventory ? String(inv.stockQty || 0) : "",
        }));
      }
    }
  }, [inventoryList, formData.inventoryId, formData.trackInventory]);

  // ── Sync tier prices when groupChecks change (merge/unmerge) ──────────────────
  // This is the KEY fix: when user checks/unchecks merge boxes, sync all prices in a group
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!hasVariants || tiers.length === 0 || variantGroups.length < 2) return;

    setTiers((prevTiers) =>
      prevTiers.map((tier) => {
        const newPrices = { ...tier.prices };
        let changed = false;

        Object.entries(groupChecks).forEach(([primaryVal, checkedSet]) => {
          if (!(checkedSet instanceof Set) || checkedSet.size <= 1) return;

          const comboIdsForGroup = combinations
            .filter(
              (c) =>
                c.combo[variantGroups[0]?.id] === primaryVal &&
                checkedSet.has(c.combo[variantGroups[1]?.id]),
            )
            .map((c) => c.id);

          if (comboIdsForGroup.length <= 1) return;

          // Find first non-empty price in the group to use as the canonical value
          const firstPrice =
            comboIdsForGroup
              .map((id) => newPrices[id])
              .find((p) => p !== "" && p !== undefined) || "";

          comboIdsForGroup.forEach((id) => {
            if (newPrices[id] !== firstPrice) {
              newPrices[id] = firstPrice;
              changed = true;
            }
          });
        });

        return changed ? { ...tier, prices: newPrices } : tier;
      }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupChecks]);

  // ── Sync fixed prices when groupChecks change ────────────────────────────────
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!hasVariants || variantGroups.length < 2) return;

    setFixedPriceVariants((prev) => {
      const newPrices = { ...prev };
      let changed = false;

      Object.entries(groupChecks).forEach(([primaryVal, checkedSet]) => {
        if (!(checkedSet instanceof Set) || checkedSet.size <= 1) return;

        const comboIdsForGroup = combinations
          .filter(
            (c) =>
              c.combo[variantGroups[0]?.id] === primaryVal &&
              checkedSet.has(c.combo[variantGroups[1]?.id]),
          )
          .map((c) => c.id);

        if (comboIdsForGroup.length <= 1) return;

        const firstPrice =
          comboIdsForGroup
            .map((id) => newPrices[id])
            .find((p) => p !== "" && p !== undefined) || "";

        comboIdsForGroup.forEach((id) => {
          if (newPrices[id] !== firstPrice) {
            newPrices[id] = firstPrice;
            changed = true;
          }
        });
      });

      return changed ? newPrices : prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupChecks]);

  // ── Inventory change handler ──
  const handleInventoryChange = (inventoryId) => {
    const selectedItem = inventoryId
      ? inventoryList.find((inv) => inv.id === inventoryId)
      : null;
    setFormData((prev) => ({
      ...prev,
      inventoryId,
      category: selectedItem ? selectedItem.category : "",
      subCategoryName: selectedItem ? selectedItem.name : "",
      subCategoryCode: selectedItem
        ? selectedItem.name
            .split(" ")
            .filter((w) => w.length > 0)
            .map((w) => w[0])
            .join("")
            .toUpperCase()
            .slice(0, 8)
        : "",
      trackInventory: selectedItem ? !selectedItem.isOnDemand : true,
      stock:
        selectedItem && !selectedItem.isOnDemand
          ? String(selectedItem.stockQty)
          : "",
    }));
  };

  // ── Variant helpers ──
  const cartesian = (groups) => {
    const filled = groups.filter((g) => g.options.length > 0);
    if (!filled.length) return [];
    return filled.reduce((acc, g) => {
      if (!acc.length) return g.options.map((o) => ({ [g.id]: o.value }));
      return acc.flatMap((ex) =>
        g.options.map((o) => ({ ...ex, [g.id]: o.value })),
      );
    }, []);
  };

  const rebuildAll = (groups) => {
    const combos = cartesian(groups);
    if (groups.length >= 2) {
      const g1 = groups[0];
      setGroupChecks((prev) => {
        const next = {};
        g1.options.forEach((o) => {
          next[o.value] =
            prev[o.value] instanceof Set ? prev[o.value] : new Set();
        });
        return next;
      });
    } else {
      setGroupChecks({});
    }
    if (combos.length === 0) {
      setCombinations([]);
      setTiers((prev) =>
        prev.map((t) => ({
          ...t,
          prices: { __base__: t.prices["__base__"] || "" },
        })),
      );
      return;
    }
    const newCombos = combos.map((combo) => ({
      id: JSON.stringify(combo),
      combo,
      label: comboLabel(combo),
    }));
    setCombinations(newCombos);
    setTiers((prev) =>
      prev.map((t) => {
        const p = {};
        newCombos.forEach((c) => {
          p[c.id] = t.prices[c.id] !== undefined ? t.prices[c.id] : "";
        });
        return { ...t, prices: p };
      }),
    );
  };

  const addGroup = () => {
    if (variantGroups.length >= 2) return;
    if (variantGroups.length === 1) {
      const firstGroup = variantGroups[0];
      if (!firstGroup.name.trim() || firstGroup.options.length === 0) {
        setVariantWarning(
          "Please fill in Variant 1 name and add at least 1 option first!",
        );
        setTimeout(() => setVariantWarning(""), 4000);
        return;
      }
    }
    setVariantWarning("");
    const g = { id: Date.now(), name: "", options: [] };
    setVariantGroups((prev) => [...prev, g]);
    setOptionInputs((prev) => ({ ...prev, [g.id]: "" }));
    setFixedPriceVariants({});
  };

  const removeGroup = (gid) => {
    const u = variantGroups.filter((g) => g.id !== gid);
    setVariantGroups(u);
    setFixedPriceVariants({});
    rebuildAll(u);
  };

  const updateGroupName = (gid, name) =>
    setVariantGroups(
      variantGroups.map((g) => (g.id === gid ? { ...g, name } : g)),
    );

  // ── Variant Option Image Helpers ──────────────────────────────────────────────
  const handleOptionImageChange = (groupId, optionId, file) => {
    if (!file) return;
    const preview = URL.createObjectURL(file);
    const imageKey = `${groupId}-${optionId}`;
    setOptionImages((prev) => ({ ...prev, [imageKey]: { file, preview } }));
  };

  const removeOptionImage = (groupId, optionId) => {
    const imageKey = `${groupId}-${optionId}`;
    setOptionImages((prev) => {
      const next = { ...prev };
      delete next[imageKey];
      return next;
    });
  };

  const getOptionImage = (groupId, optionId, existingImage) => {
    const imageKey = `${groupId}-${optionId}`;
    if (optionImages[imageKey]) return optionImages[imageKey].preview;
    if (existingImage && typeof existingImage === "object")
      return existingImage.preview;
    if (typeof existingImage === "string") return existingImage;
    return null;
  };

  const addOption = (gid) => {
    const val = (optionInputs[gid] || "").trim();
    if (!val) return;
    const group = variantGroups.find((g) => g.id === gid);
    if (
      group &&
      group.options.some((o) => o.value.toLowerCase() === val.toLowerCase())
    ) {
      setDuplicateWarning(`"${val}" already exists!`);
      setTimeout(() => setDuplicateWarning(""), 3000);
      return;
    }
    const u = variantGroups.map((g) =>
      g.id === gid
        ? {
            ...g,
            options: [
              ...g.options,
              { id: Date.now(), value: val, image: null },
            ],
          }
        : g,
    );
    setVariantGroups(u);
    setOptionInputs((prev) => ({ ...prev, [gid]: "" }));
    rebuildAll(u);
  };

  const removeOption = (gid, oid) => {
    const u = variantGroups.map((g) =>
      g.id === gid
        ? { ...g, options: g.options.filter((o) => o.id !== oid) }
        : g,
    );
    setVariantGroups(u);
    rebuildAll(u);
  };

  const addTier = () => {
    const last = tiers[tiers.length - 1];
    const emptyPrices = hasVariants
      ? combinations.reduce((acc, c) => ({ ...acc, [c.id]: "" }), {})
      : { __base__: "" };
    setTiers((prev) => [
      ...prev,
      {
        id: Date.now(),
        minQty: last ? (parseInt(last.maxQty) || 0) + 1 : 1,
        maxQty: "",
        prices: emptyPrices,
      },
    ]);
  };

  const removeTier = (id) => setTiers(tiers.filter((t) => t.id !== id));
  const updateTierRange = (id, field, val) =>
    setTiers(tiers.map((t) => (t.id === id ? { ...t, [field]: val } : t)));

  // ── Merge-aware tier price update ────────────────────────────────────────────
  // When a priceKey belongs to a merged group, update ALL combos in that group
  const updateTierPrice = (tierId, priceKey, val) => {
    // Check if this combo is part of a merged group
    if (variantGroups.length >= 2 && priceKey !== "__base__") {
      const combo = combinations.find((c) => c.id === priceKey);
      if (combo) {
        const primaryVal = combo.combo[variantGroups[0]?.id];
        const checkedSet = groupChecks[primaryVal];

        if (checkedSet instanceof Set && checkedSet.size > 1) {
          // Get all combo IDs in this merged group
          const mergedComboIds = combinations
            .filter(
              (c) =>
                c.combo[variantGroups[0]?.id] === primaryVal &&
                checkedSet.has(c.combo[variantGroups[1]?.id]),
            )
            .map((c) => c.id);

          if (mergedComboIds.includes(priceKey)) {
            // Update ALL combos in the merged group at once
            setTiers((prev) =>
              prev.map((t) => {
                if (t.id !== tierId) return t;
                const newPrices = { ...t.prices };
                mergedComboIds.forEach((cid) => {
                  newPrices[cid] = val;
                });
                return { ...t, prices: newPrices };
              }),
            );
            return;
          }
        }
      }
    }

    // Not merged — update single price
    setTiers((prev) =>
      prev.map((t) =>
        t.id === tierId
          ? { ...t, prices: { ...t.prices, [priceKey]: val } }
          : t,
      ),
    );
  };

  // ── Merge-aware fixed price update ───────────────────────────────────────────
  const updateFixedPrice = (comboId, val) => {
    if (variantGroups.length >= 2) {
      const combo = combinations.find((c) => c.id === comboId);
      if (combo) {
        const primaryVal = combo.combo[variantGroups[0]?.id];
        const checkedSet = groupChecks[primaryVal];

        if (checkedSet instanceof Set && checkedSet.size > 1) {
          const mergedComboIds = combinations
            .filter(
              (c) =>
                c.combo[variantGroups[0]?.id] === primaryVal &&
                checkedSet.has(c.combo[variantGroups[1]?.id]),
            )
            .map((c) => c.id);

          if (mergedComboIds.includes(comboId)) {
            setFixedPriceVariants((prev) => {
              const next = { ...prev };
              mergedComboIds.forEach((cid) => {
                next[cid] = val;
              });
              return next;
            });
            return;
          }
        }
      }
    }

    setFixedPriceVariants((prev) => ({ ...prev, [comboId]: val }));
  };

  // ── Image helpers ──
  const createImageObj = (file) => ({
    file,
    preview: URL.createObjectURL(file),
    id: Date.now() + Math.random(),
  });
  const handleThumbnailUpload = (files) => {
    const file = files[0];
    if (file) setThumbnail(createImageObj(file));
  };
  const handleThumbnailDrop = (e) => {
    e.preventDefault();
    setDragOverThumb(false);
    if (e.dataTransfer.files?.length)
      handleThumbnailUpload(e.dataTransfer.files);
  };
  const handleImageUpload = (files) =>
    setImages((prev) => [...prev, ...Array.from(files).map(createImageObj)]);
  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files?.length) handleImageUpload(e.dataTransfer.files);
  };
  const removeImage = (id) => setImages(images.filter((img) => img.id !== id));

  // ── Price helpers ──
  const fixedPricesArray = hasVariants
    ? Object.values(fixedPriceVariants)
        .map((p) => parseFloat(p))
        .filter((p) => p > 0)
    : [];
  const fixedMinP = fixedPricesArray.length
    ? Math.min(...fixedPricesArray)
    : null;
  const fixedMaxP = fixedPricesArray.length
    ? Math.max(...fixedPricesArray)
    : null;
  const allPrices = tiers.flatMap((t) =>
    Object.values(t.prices)
      .map((p) => parseFloat(p))
      .filter((p) => p > 0),
  );
  const minP = allPrices.length ? Math.min(...allPrices) : null;
  const maxP = allPrices.length ? Math.max(...allPrices) : null;

  const handleSave = async () => {
    if (!token) {
      onPriceError("You must be signed in to save.");
      return;
    }
    // Validate prices before saving
    if (formData.priceType === "fixed") {
      if (hasVariants) {
        const allPricesFilled = Object.values(fixedPriceVariants).every(
          (p) => p !== "" && p !== null && p !== undefined && parseFloat(p) > 0,
        );
        if (!allPricesFilled) {
          onPriceError("Please enter prices for all variants.");
          return;
        }
      } else if (!fixedPrice || parseFloat(fixedPrice) <= 0) {
        onPriceError("Please enter a price.");
        return;
      }
    } else if (formData.priceType === "tiered") {
      const allTiersFilled = tiers.every((tier) =>
        Object.values(tier.prices).every(
          (p) => p !== "" && p !== null && p !== undefined && parseFloat(p) > 0,
        ),
      );
      if (!allTiersFilled) {
        onPriceError("Please enter prices for all items in the pricing tiers.");
        return;
      }
    }

    const stockVal = formData.trackInventory
      ? parseInt(formData.stock) || 0
      : null;

    setUploadingMedia(true);
    try {
      let thumbFinal = thumbnail?.preview || null;
      if (thumbnail?.file) {
        const up = await uploadImage(thumbnail.file, "pmp-products", token);
        thumbFinal = up.url || up?.data?.url;
      } else if (
        typeof thumbFinal === "string" &&
        thumbFinal.startsWith("blob:")
      ) {
        thumbFinal = null;
      }

      const galleryUrls = [];
      for (const img of images) {
        if (img.file) {
          const up = await uploadImage(img.file, "pmp-products", token);
          galleryUrls.push(up.url || up?.data?.url);
        } else if (
          img.preview &&
          typeof img.preview === "string" &&
          !img.preview.startsWith("blob:")
        ) {
          galleryUrls.push(img.preview);
        }
      }

      const variantGroupsWithImages = await Promise.all(
        variantGroups.map(async (group) => ({
          ...group,
          options: await Promise.all(
            group.options.map(async (opt) => {
              const imageKey = `${group.id}-${opt.id}`;
              const optionImage = optionImages[imageKey] || opt.image;
              let url = null;
              if (optionImage?.file) {
                const up = await uploadImage(
                  optionImage.file,
                  "pmp-products",
                  token,
                );
                url = up.url || up?.data?.url;
              } else if (optionImage) {
                const raw = optionImage.preview || optionImage;
                url =
                  typeof raw === "string" && !raw.startsWith("blob:")
                    ? raw
                    : null;
              }
              return { ...opt, image: url };
            }),
          ),
        })),
      );

      const updatedProduct = {
        ...product,
        inventoryId: formData.inventoryId || null,
        category: formData.category,
        subCategoryCode: formData.subCategoryCode,
        subCategoryName: formData.subCategoryName,
        description: formData.description,
        priceType: formData.priceType,
        ...(formData.priceType === "fixed"
          ? hasVariants
            ? { variantPrices: fixedPriceVariants, price: undefined }
            : { price: fixedPrice, variantPrices: undefined }
          : { tiers }),
        variantGroups: variantGroupsWithImages,
        combinations,
        thumbnail: thumbFinal,
        images: galleryUrls,
        trackInventory: formData.trackInventory,
        stock: stockVal,
        storeStockCap: formData.storeStockCap !== "" ? parseInt(formData.storeStockCap) || null : null,
        updatedAt: new Date().toISOString(),
      };
      onSave(updatedProduct);
    } catch (err) {
      console.error(err);
      onPriceError(err.message || "Image upload failed.");
    } finally {
      setUploadingMedia(false);
    }
  };

  const inv = inventoryList.find((i) => i.id === formData.inventoryId);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--dark)",
          border: "1px solid var(--border)",
          borderRadius: "16px",
          width: "100%",
          maxWidth: "860px",
          maxHeight: "92vh",
          overflowY: "auto",
          boxShadow: "0 20px 60px rgba(0,0,0,0.6)",
          scrollbarWidth: "thin",
          scrollbarColor: "var(--gold) var(--dark2)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Modal Header */}
        <div
          style={{
            position: "sticky",
            top: 0,
            zIndex: 10,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "1.25rem 1.5rem",
            background: "var(--dark)",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <div>
            <h2 className="modal-title">
              {isNew ? "Add Product" : "Edit Product"}
            </h2>
            <p
              style={{
                color: "var(--gray)",
                fontSize: "0.8rem",
                margin: "0.25rem 0 0",
              }}
            >
              {product.productName || product.subCategoryName || "Product"}
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "var(--dark2)",
              border: "1px solid var(--border)",
              borderRadius: "8px",
              width: "36px",
              height: "36px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--gray)",
              cursor: "pointer",
              fontSize: "1.1rem",
              flexShrink: 0,
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

        {/* Form Body */}
        <div
          style={{
            padding: "1.5rem",
            display: "flex",
            flexDirection: "column",
            gap: "0",
            flex: 1,
          }}
        >
          <form
            className="product-form"
            style={{ background: "transparent", border: "none", padding: 0 }}
            onSubmit={(e) => {
              e.preventDefault();
              handleSave();
            }}
          >
            {/* ── PRODUCT SECTION ── */}
            <div className="form-section">
              <h2 className="form-section-title">Product</h2>

              <div className="form-group" style={{ marginBottom: "1rem" }}>
                <InventoryCombobox
                  label="Product / Blank Item"
                  value={formData.inventoryId}
                  onChange={handleInventoryChange}
                  inventoryList={inventoryList}
                  placeholder="Select a Product from inventory..."
                  currentProductId={product.id}
                  products={products}
                />
                <p className="form-hint">
                  {formData.inventoryId && inv
                    ? inv.isOnDemand
                      ? " This item is Upon Order - stock tracking disabled."
                      : ` Current stock: ${inv.stockQty} pcs (Min: ${inv.minStockLevel})`
                    : "Select a material to auto-fill category, sub-category, and stock."}
                </p>
              </div>

              <div className="category-row">
                <div className="form-group">
                  <label className="form-label">
                    Category{" "}
                    <span className="form-label-sub">(from Material)</span>
                  </label>
                  <input
                    type="text"
                    className="form-input"
                    value={formData.category}
                    readOnly
                    style={{ cursor: "not-allowed", opacity: 0.7 }}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">
                    Sub-category{" "}
                    <span className="form-label-sub">(from Material)</span>
                  </label>
                  <input
                    type="text"
                    className="form-input"
                    value={formData.subCategoryName}
                    readOnly
                    style={{ cursor: "not-allowed", opacity: 0.7 }}
                  />
                </div>
              </div>

              <div className="form-group" style={{ marginTop: "1rem" }}>
                <label className="form-label">Description</label>
                <textarea
                  className="form-textarea"
                  value={formData.description}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      description: e.target.value,
                    }))
                  }
                  placeholder="Materials, printing details, sizes, notes…"
                />
              </div>

              {formData.category && (
                <div className="sku-preview">
                  <span className="sku-label">Product ID:</span>
                  <span className="sku-value">
                    [{formData.category}]
                    {formData.subCategoryName
                      ? `- [${formData.subCategoryName}]`
                      : ""}
                  </span>
                </div>
              )}
            </div>

            {/* ── AVAILABILITY ── */}
            <div className="form-section">
              <h2 className="form-section-title">Availability</h2>
              {!formData.inventoryId ? (
                <p className="form-hint" style={{ color: "#f87171" }}>
                  Please select a Product / Blank Item first
                </p>
              ) : inv?.isOnDemand ? (
                <div
                  className="availability-card selected"
                  style={{ cursor: "not-allowed", opacity: 0.7 }}
                >
                  <div className="availability-title">
                    Upon Order / Supplied
                  </div>
                  <div className="availability-desc">
                    Stock tracking is disabled for this item.
                  </div>
                </div>
              ) : (
                <div
                  className="availability-card selected"
                  style={{ cursor: "not-allowed", opacity: 0.7 }}
                >
                  <div className="availability-title">Track Stock</div>
                  <div className="availability-desc">
                    Current Inventory Stock:{" "}
                    <strong style={{ color: "var(--gold)" }}>
                      {inv?.stockQty || 0} pcs
                    </strong>
                  </div>
                  <div
                    className="stock-qty-input-wrap"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <label className="form-label">
                      Available Stock (Storefront){" "}
                      <span className="required">*</span>
                    </label>
                    <NumberInput
                      className="form-input"
                      value={formData.stock}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === "" || parseInt(val) >= 0) {
                          if (parseInt(val) > inv.stockQty) {
                            setMaxStockQty(inv.stockQty);
                            setShowStockErrorModal(true);
                            return;
                          }
                          setFormData((prev) => ({ ...prev, stock: val }));
                        }
                      }}
                      placeholder="0"
                      min={0}
                      max={inv?.stockQty}
                      required
                    />
                    {parseInt(formData.stock) > 0 && inv && (
                      <p
                        className="form-hint"
                        style={{ marginTop: "0.5rem", color: "var(--gray)" }}
                      >
                        {inv.stockQty - parseInt(formData.stock)} pcs remaining
                        in Inventory for this product
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* ── STOREFRONT CAP ── */}
            <div className="form-section">
              <h2 className="form-section-title">Storefront Cap</h2>
              <div
                className="stock-qty-input-wrap"
                style={{ marginTop: "0.5rem" }}
              >
                <label className="form-label">Max Sellable Qty (optional)</label>
                <NumberInput
                  className="form-input"
                  value={formData.storeStockCap}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === "" || parseInt(val) >= 0)
                      setFormData((prev) => ({ ...prev, storeStockCap: val }));
                  }}
                  placeholder="Leave blank for unlimited"
                  min={0}
                />
                <p className="form-hint" style={{ marginTop: "0.5rem", color: "var(--gray)" }}>
                  Caps how many units customers can order even if inventory allows more. Leave blank to use live inventory / can-produce count.
                </p>
              </div>
            </div>

            {/* ── VARIANTS ── */}
            <div className="form-section">
              <h2 className="form-section-title">Variants</h2>
              <div className="variant-groups">
                {variantGroups.map((group, gIdx) => (
                  <div key={group.id} className="variant-group">
                    <div className="variant-group-header">
                      <span className="variant-group-label">
                        VARIANT {gIdx + 1}
                      </span>
                      <input
                        type="text"
                        className="form-input"
                        value={group.name}
                        onChange={(e) =>
                          updateGroupName(group.id, e.target.value)
                        }
                        onKeyDown={(e) => {
                          if (e.key === "Enter") e.preventDefault();
                        }}
                        placeholder={
                          gIdx === 0
                            ? "e.g. Finish, Size, Type…"
                            : "e.g. Color, Size…"
                        }
                        required
                      />
                      <button
                        type="button"
                        className="btn-remove-group"
                        onClick={() => removeGroup(group.id)}
                      >
                        Remove
                      </button>
                    </div>
                    <div className="variant-options">
                      {group.options.map((opt) => {
                        const optionImage = getOptionImage(
                          group.id,
                          opt.id,
                          opt.image,
                        );
                        return (
                          <span key={opt.id} className="variant-chip">
                            {optionImage && (
                              <img
                                src={optionImage}
                                alt={opt.value}
                                className="variant-chip-image"
                              />
                            )}
                            {opt.value}
                            <button
                              type="button"
                              className="variant-chip-remove"
                              onClick={() => removeOption(group.id, opt.id)}
                            >
                              ×
                            </button>
                            <label
                              className="variant-chip-image-btn"
                              title="Add/Change image"
                            >
                              <svg
                                width="14"
                                height="14"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                              >
                                <rect
                                  x="3"
                                  y="3"
                                  width="18"
                                  height="18"
                                  rx="2"
                                  ry="2"
                                />
                                <circle cx="8.5" cy="8.5" r="1.5" />
                                <polyline points="21 15 16 10 5 21" />
                              </svg>
                              <input
                                type="file"
                                accept="image/*"
                                style={{ display: "none" }}
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file)
                                    handleOptionImageChange(
                                      group.id,
                                      opt.id,
                                      file,
                                    );
                                }}
                              />
                            </label>
                            {optionImage && (
                              <button
                                type="button"
                                className="variant-chip-image-remove"
                                onClick={() =>
                                  removeOptionImage(group.id, opt.id)
                                }
                                title="Remove image"
                              >
                                ×
                              </button>
                            )}
                          </span>
                        );
                      })}
                      <input
                        type="text"
                        className="variant-option-input"
                        value={optionInputs[group.id] || ""}
                        onChange={(e) =>
                          setOptionInputs((prev) => ({
                            ...prev,
                            [group.id]: e.target.value,
                          }))
                        }
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            addOption(group.id);
                          }
                        }}
                        placeholder="Add option…"
                      />
                      <button
                        type="button"
                        className="btn-add-option"
                        onClick={() => addOption(group.id)}
                      >
                        + Add
                      </button>
                    </div>
                    {duplicateWarning && (
                      <p className="duplicate-warning">{duplicateWarning}</p>
                    )}
                  </div>
                ))}
              </div>
              {variantGroups.length < 2 && (
                <>
                  <button
                    type="button"
                    className="add-variant-btn"
                    onClick={addGroup}
                  >
                    Add Variant Type{" "}
                    <span className="add-variant-max">(max 2)</span>
                  </button>
                  {variantWarning && (
                    <p
                      className="duplicate-warning"
                      style={{ color: "#f87171", marginTop: "0.5rem" }}
                    >
                      {variantWarning}
                    </p>
                  )}
                </>
              )}
            </div>

            {/* ── PRICING ── */}
            <div className="form-section">
              <h2 className="form-section-title">Pricing</h2>

              <div className="price-type-row">
                {[
                  { val: "fixed", label: "Fixed Price" },
                  { val: "tiered", label: "Tier Price" },
                  { val: "inquiry", label: "For Inquiry" },
                ].map(({ val, label }) => (
                  <button
                    key={val}
                    type="button"
                    className={`price-type-btn${formData.priceType === val ? " selected" : ""}`}
                    onClick={() =>
                      setFormData((prev) => ({ ...prev, priceType: val }))
                    }
                  >
                    {label}
                  </button>
                ))}
              </div>

              {formData.priceType === "fixed" && (
                <>
                  {hasVariants
                    ? fixedMinP !== null && (
                        <div className="price-preview">
                          <p className="price-preview-value">
                            ₱{fixedMinP}
                            {fixedMaxP !== fixedMinP ? ` – ₱${fixedMaxP}` : ""}
                            <span className="price-preview-unit">
                              {" "}
                              per item
                            </span>
                          </p>
                        </div>
                      )
                    : fixedPrice && (
                        <div className="price-preview">
                          <p className="price-preview-value">
                            ₱{fixedPrice}
                            <span className="price-preview-unit">
                              {" "}
                              per item
                            </span>
                          </p>
                        </div>
                      )}
                  {variantGroups.length >= 2 && combinations.length > 0 && (
                    <VariantGroupingCheckboxes
                      variantGroups={variantGroups}
                      groupChecks={groupChecks}
                      onGroupChecksChange={setGroupChecks}
                    />
                  )}
                  {hasVariants ? (
                    <SmartPricingTable
                      tiers={[
                        {
                          id: "__fixed__",
                          minQty: null,
                          maxQty: null,
                          prices: fixedPriceVariants,
                        },
                      ]}
                      variantGroups={variantGroups}
                      combinations={combinations}
                      groupChecks={groupChecks}
                      onPriceChange={(_tierId, comboId, val) =>
                        updateFixedPrice(comboId, val)
                      }
                      updateTierRange={() => {}}
                      removeTier={() => {}}
                      mode="fixed"
                    />
                  ) : (
                    <div className="form-group">
                      <div className="tier-price-cell">
                        <span className="peso">₱</span>
                        <NumberInput
                          className="tier-input"
                          value={fixedPrice || ""}
                          onChange={(e) =>
                            setFixedPrice(sanitizeNumber(e.target.value))
                          }
                          placeholder="0"
                          min={0}
                          step="0.01"
                        />
                      </div>
                    </div>
                  )}
                </>
              )}

              {formData.priceType === "tiered" && (
                <>
                  {minP !== null && (
                    <div className="price-preview">
                      <p className="price-preview-value">
                        ₱{minP}
                        {maxP !== minP ? ` – ₱${maxP}` : ""}
                        <span className="price-preview-unit"> per item</span>
                      </p>
                    </div>
                  )}
                  {variantGroups.length >= 2 && combinations.length > 0 && (
                    <VariantGroupingCheckboxes
                      variantGroups={variantGroups}
                      groupChecks={groupChecks}
                      onGroupChecksChange={setGroupChecks}
                    />
                  )}
                  <SmartPricingTable
                    tiers={tiers}
                    variantGroups={variantGroups}
                    combinations={combinations}
                    groupChecks={groupChecks}
                    onPriceChange={updateTierPrice}
                    updateTierRange={updateTierRange}
                    removeTier={removeTier}
                    mode="tiered"
                  />
                  <button
                    type="button"
                    className="add-tier-btn"
                    onClick={addTier}
                  >
                    Add Price Tier
                  </button>
                </>
              )}

              {formData.priceType === "inquiry" && (
                <div
                  style={{
                    padding: "1rem",
                    background: "rgba(212,168,67,0.08)",
                    border: "1px solid rgba(212,168,67,0.3)",
                    borderRadius: "8px",
                    color: "var(--gold)",
                    fontSize: "0.9rem",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                  }}
                >
                  This product will be listed as "For Inquiry" customers will
                  contact you for pricing.
                </div>
              )}
            </div>

            {/* ── IMAGES ── */}
            <div className="form-section">
              <div className="images-row">
                <div className="images-col">
                  <h2 className="form-section-title">Thumbnail</h2>
                  {thumbnail ? (
                    <div className="thumbnail-preview-wrap">
                      <div className="thumbnail-preview">
                        <img src={thumbnail.preview} alt="Thumbnail" />
                        <button
                          type="button"
                          className="image-remove-btn"
                          onClick={() => setThumbnail(null)}
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div
                      className={`image-upload-area${dragOverThumb ? " drag-over" : ""}`}
                      onDrop={handleThumbnailDrop}
                      onDragOver={(e) => {
                        e.preventDefault();
                        setDragOverThumb(true);
                      }}
                      onDragLeave={() => setDragOverThumb(false)}
                      onClick={() =>
                        document.getElementById("editThumbnailInput").click()
                      }
                    >
                      <div className="image-upload-text">
                        <strong>Click to upload thumbnail</strong> or drag and
                        drop
                      </div>
                      <div className="image-upload-hint">
                        PNG, JPG — 200x200 to 800x800px
                      </div>
                      <input
                        id="editThumbnailInput"
                        type="file"
                        accept="image/*"
                        style={{ display: "none" }}
                        onChange={(e) => {
                          if (e.target.files?.length)
                            handleThumbnailUpload(e.target.files);
                        }}
                      />
                    </div>
                  )}
                </div>
                <div className="images-col">
                  <h2 className="form-section-title">Product Gallery</h2>
                  <div
                    className={`image-upload-area${dragOver ? " drag-over" : ""}`}
                    onDrop={handleDrop}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDragOver(true);
                    }}
                    onDragLeave={() => setDragOver(false)}
                    onClick={() =>
                      document.getElementById("editImageInput").click()
                    }
                  >
                    <div className="image-upload-text">
                      <strong>Click to upload</strong> or drag and drop
                    </div>
                    <div className="image-upload-hint">PNG, JPG, GIF</div>
                    <input
                      id="editImageInput"
                      type="file"
                      accept="image/*"
                      multiple
                      style={{ display: "none" }}
                      onChange={(e) => {
                        if (e.target.files?.length)
                          handleImageUpload(e.target.files);
                      }}
                    />
                  </div>
                  {images.length > 0 && (
                    <div className="image-preview-grid">
                      {images.map((img) => (
                        <div key={img.id} className="image-preview-item">
                          <img src={img.preview} alt="Preview" />
                          <button
                            type="button"
                            className="image-remove-btn"
                            onClick={() => removeImage(img.id)}
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* ── ACTIONS ── */}
            <div className="form-actions">
              <button type="button" className="btn-cancel" onClick={onClose} disabled={uploadingMedia}>
                Cancel
              </button>
              <button type="submit" className="btn-submit" disabled={uploadingMedia}>
                {uploadingMedia ? "Uploading…" : isNew ? "Continue" : "Save Changes"}
              </button>
            </div>
          </form>
        </div>

        {/* Stock Error Modal */}
        {showStockErrorModal && (
          <div
            className="modal-overlay"
            onClick={() => setShowStockErrorModal(false)}
          >
            <div
              className="modal-content modal-content-sm"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="modal-header">
                <h2 className="modal-title modal-title-danger">
                  Invalid Stock Quantity
                </h2>
                <button
                  className="modal-close"
                  onClick={() => setShowStockErrorModal(false)}
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
              <div className="modal-body">
                <p className="delete-confirm-text">
                  Cannot set higher Availability than Inventory stock (
                  <strong>{maxStockQty} pcs</strong>).
                </p>
                <p
                  className="delete-confirm-warning"
                  style={{ marginTop: "0.75rem" }}
                >
                  Please enter a value that is less than or equal to the
                  available inventory.
                </p>
              </div>
              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setShowStockErrorModal(false)}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Toggle Switch ─────────────────────────────────────────────────────────────
function ToggleSwitch({ checked, onChange, disabled }) {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onChange}
      disabled={disabled}
      style={{
        position: "relative",
        display: "inline-flex",
        alignItems: "center",
        width: "44px",
        height: "24px",
        borderRadius: "12px",
        border: "none",
        background: checked ? "var(--primary)" : "var(--border)",
        cursor: disabled ? "not-allowed" : "pointer",
        transition: "background 0.2s ease",
        flexShrink: 0,
        padding: 0,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <span
        style={{
          position: "absolute",
          left: checked ? "22px" : "2px",
          width: "20px",
          height: "20px",
          borderRadius: "50%",
          background: "var(--white)",
          transition: "left 0.2s ease",
          boxShadow: "0 1px 4px rgba(0,0,0,0.3)",
        }}
      />
    </button>
  );
}

// ── Confirm Modal ─────────────────────────────────────────────────────────────
function ConfirmModal({
  title,
  message,
  confirmLabel,
  confirmClass,
  onConfirm,
  onCancel,
  children,
}) {
  return (
    <div className="modal-overlay" style={{ zIndex: 3000 }}>
      <div
        className="modal-content modal-content-sm"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2 className="modal-title">{title}</h2>
          <button className="modal-close" onClick={onCancel}>
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
        <div className="modal-body">
          <p className="delete-confirm-text">{message}</p>
          {children}
        </div>
        <div className="modal-actions">
          <button type="button" className="btn-secondary" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className={confirmClass || "btn-primary"}
            onClick={onConfirm}
            disabled={confirmLabel === "Processing..."}
            style={{
              opacity: confirmLabel === "Processing..." ? 0.6 : 1,
              cursor:
                confirmLabel === "Processing..." ? "not-allowed" : "pointer",
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Confirm Edit Modal (Shows changes preview) ─────────────────────────────────
function ConfirmEditModal({
  isOpen,
  onClose,
  originalProduct,
  updatedProduct,
  inventoryList,
  onConfirm,
}) {
  if (!isOpen || !originalProduct || !updatedProduct) return null;

  const getInventoryName = (id) => {
    const inv = inventoryList.find((i) => i.id === id);
    return inv ? inv.name : "N/A";
  };

  // Calculate price info
  let priceInfo = "";
  if (updatedProduct.priceType === "inquiry") {
    priceInfo = "For Inquiry";
  } else if (updatedProduct.priceType === "fixed") {
    if (
      updatedProduct.variantPrices &&
      Object.keys(updatedProduct.variantPrices).length > 0
    ) {
      const prices = Object.values(updatedProduct.variantPrices)
        .map((p) => parseFloat(p))
        .filter((p) => p > 0);
      const minP = prices.length ? Math.min(...prices) : 0;
      const maxP = prices.length ? Math.max(...prices) : 0;
      priceInfo = `₱${minP}${maxP !== minP ? ` – ₱${maxP}` : ""}`;
    } else if (updatedProduct.price) {
      priceInfo = `₱${updatedProduct.price}`;
    }
  } else if (updatedProduct.priceType === "tiered" && updatedProduct.tiers) {
    const allPrices = updatedProduct.tiers.flatMap((t) =>
      Object.values(t.prices)
        .map((p) => parseFloat(p))
        .filter((p) => p > 0),
    );
    const minP = allPrices.length ? Math.min(...allPrices) : 0;
    const maxP = allPrices.length ? Math.max(...allPrices) : 0;
    priceInfo = `₱${minP}${maxP !== minP ? ` – ₱${maxP}` : ""} (tiered)`;
  }

  // Stock info
  let stockInfo = "";
  if (!updatedProduct.trackInventory) {
    stockInfo = "Upon Order / Supplied";
  } else {
    stockInfo = `${updatedProduct.stock || 0} pcs available`;
  }

  // Variant info
  const variantCount = updatedProduct.variantGroups?.length || 0;
  const combinationCount = updatedProduct.combinations?.length || 0;

  // Check what changed
  const changes = [];
  if (originalProduct.stock !== updatedProduct.stock) {
    changes.push({
      field: "Availability (Storefront)",
      old: `${originalProduct.stock || 0} pcs`,
      new: `${updatedProduct.stock || 0} pcs`,
    });
  }
  if (originalProduct.isPublished !== updatedProduct.isPublished) {
    changes.push({
      field: "Status",
      old: originalProduct.isPublished ? "Published" : "Unpublished",
      new: updatedProduct.isPublished ? "Published" : "Unpublished",
    });
  }
  if (originalProduct.priceType !== updatedProduct.priceType) {
    changes.push({
      field: "Price Type",
      old: originalProduct.priceType || "N/A",
      new: updatedProduct.priceType || "N/A",
    });
  }
  if (
    originalProduct.price !== updatedProduct.price &&
    updatedProduct.priceType === "fixed"
  ) {
    changes.push({
      field: "Price",
      old: originalProduct.price
        ? `₱${parseFloat(originalProduct.price).toFixed(2)}`
        : "N/A",
      new: updatedProduct.price
        ? `₱${parseFloat(updatedProduct.price).toFixed(2)}`
        : "N/A",
    });
  }
  if (originalProduct.description !== updatedProduct.description) {
    changes.push({
      field: "Description",
      old: originalProduct.description || "—",
      new: updatedProduct.description || "—",
    });
  }

  const hasChanges = changes.length > 0;

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 4000 }}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">Confirm Save Product</h2>
          <button className="modal-close" onClick={onClose}>
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

        <div className="modal-body">
          <p className="delete-confirm-text" style={{ marginBottom: "1.5rem" }}>
            Please review the product details before saving to your catalog.
          </p>

          <div
            className="confirm-summary"
            style={{
              background: "rgba(255, 255, 255, 0.03)",
              border: "1px solid var(--border)",
              borderRadius: "8px",
              padding: "1.25rem",
              marginBottom: "1.5rem",
            }}
          >
            {/* Thumbnail Preview */}
            {updatedProduct.thumbnail && (
              <div style={{ marginBottom: "1rem", textAlign: "center" }}>
                <img
                  src={updatedProduct.thumbnail}
                  alt="Product thumbnail"
                  style={{
                    width: "120px",
                    height: "120px",
                    objectFit: "cover",
                    borderRadius: "8px",
                    border: "1px solid var(--border)",
                  }}
                />
              </div>
            )}

            <div className="confirm-row" style={{ marginBottom: "0.75rem" }}>
              <span
                className="confirm-label"
                style={{ color: "var(--gray)", fontSize: "0.875rem" }}
              >
                Product:
              </span>
              <span
                className="confirm-value"
                style={{ fontWeight: "600", color: "var(--white)" }}
              >
                {updatedProduct.category}{" "}
                {updatedProduct.subCategoryName
                  ? `- ${updatedProduct.subCategoryName}`
                  : ""}
              </span>
            </div>

            {updatedProduct.description && (
              <div className="confirm-row" style={{ marginBottom: "0.75rem" }}>
                <span
                  className="confirm-label"
                  style={{ color: "var(--gray)", fontSize: "0.875rem" }}
                >
                  Description:
                </span>
                <span
                  className="confirm-value"
                  style={{ color: "var(--white)" }}
                >
                  {updatedProduct.description.length > 100
                    ? updatedProduct.description.substring(0, 100) + "..."
                    : updatedProduct.description}
                </span>
              </div>
            )}

            <div className="confirm-row" style={{ marginBottom: "0.75rem" }}>
              <span
                className="confirm-label"
                style={{ color: "var(--gray)", fontSize: "0.875rem" }}
              >
                Price:
              </span>
              <span
                className="confirm-value"
                style={{ color: "#facc15", fontWeight: "600" }}
              >
                {priceInfo}
              </span>
            </div>

            <div className="confirm-row" style={{ marginBottom: "0.75rem" }}>
              <span
                className="confirm-label"
                style={{ color: "var(--gray)", fontSize: "0.875rem" }}
              >
                Stock:
              </span>
              <span className="confirm-value" style={{ color: "var(--white)" }}>
                {stockInfo}
              </span>
            </div>

            {variantCount > 0 && (
              <div className="confirm-row" style={{ marginBottom: "0.75rem" }}>
                <span
                  className="confirm-label"
                  style={{ color: "var(--gray)", fontSize: "0.875rem" }}
                >
                  Variants:
                </span>
                <span
                  className="confirm-value"
                  style={{ color: "var(--white)" }}
                >
                  {variantCount} group{variantCount > 1 ? "s" : ""} (
                  {combinationCount} combinations)
                </span>
              </div>
            )}

            {updatedProduct.images?.length > 0 && (
              <div className="confirm-row" style={{ marginBottom: "0.75rem" }}>
                <span
                  className="confirm-label"
                  style={{ color: "var(--gray)", fontSize: "0.875rem" }}
                >
                  Images:
                </span>
                <span
                  className="confirm-value"
                  style={{ color: "var(--white)" }}
                >
                  {updatedProduct.images.length} image
                  {updatedProduct.images.length > 1 ? "s" : ""}
                </span>
              </div>
            )}
          </div>

          {/* Changes Summary */}
          {hasChanges && (
            <div
              style={{
                background: "var(--dark2)",
                border: "1px solid var(--border)",
                borderRadius: "8px",
                padding: "1rem",
                marginBottom: "1rem",
              }}
            >
              <div
                style={{
                  fontSize: "0.875rem",
                  color: "var(--gray)",
                  marginBottom: "0.75rem",
                  fontWeight: 600,
                }}
              >
                Changes Summary
              </div>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.75rem",
                }}
              >
                {changes.map((change, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: "0.75rem",
                      padding: "0.75rem",
                      background: "var(--dark)",
                      borderRadius: "6px",
                      border: "1px solid var(--border)",
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <div
                        style={{
                          fontSize: "0.8rem",
                          color: "var(--gray)",
                          marginBottom: "0.25rem",
                        }}
                      >
                        {change.field}
                      </div>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "0.5rem",
                        }}
                      >
                        <span
                          style={{
                            fontSize: "0.85rem",
                            color: "#ef4444",
                            textDecoration: "line-through",
                            background: "rgba(239, 68, 68, 0.1)",
                            padding: "0.2rem 0.5rem",
                            borderRadius: "4px",
                          }}
                        >
                          {change.old}
                        </span>
                        <span
                          style={{
                            color: "var(--gray)",
                            fontSize: "0.85rem",
                            margin: "0 0.25rem",
                          }}
                        >
                          -
                        </span>
                        <span
                          style={{
                            fontSize: "0.85rem",
                            color: "#22c55e",
                            background: "rgba(34, 197, 94, 0.1)",
                            padding: "0.2rem 0.5rem",
                            borderRadius: "4px",
                            fontWeight: 600,
                          }}
                        >
                          {change.new}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <p
            className="confirm-hint"
            style={{
              marginTop: "1rem",
              color: "var(--gray)",
              fontSize: "0.875rem",
            }}
          >
            Click "Confirm Save" to update this product in your catalog.
          </p>
        </div>

        <div className="modal-actions">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={onConfirm}
            disabled={isSubmitting}
            style={{ opacity: isSubmitting ? 0.6 : 1 }}
          >
            {isSubmitting ? "Saving..." : "Confirm Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Price Error Modal ──────────────────────────────────────────────────────────
function PriceErrorModal({
  isOpen,
  onClose,
  message,
  title = "Price Required",
}) {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 5000 }}>
      <div
        className="modal-content modal-content-sm"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2 className="modal-title modal-title-warning">{title}</h2>
          <button className="modal-close" onClick={onClose}>
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

        <div className="modal-body">
          <p className="delete-confirm-text">{message}</p>
        </div>

        <div className="modal-actions">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Product Detail Expand Row ─────────────────────────────────────────────────
function ProductExpandRow({ product, inv, boms = [], inventoryList = [] }) {
  const combinations = product.combinations || [];

  const productGroupName = (product.bomGroupName || product.name || product.productName || "").trim().toLowerCase();
  const productBoms = boms.filter((b) => (b.productGroupName || "").trim().toLowerCase() === productGroupName && productGroupName);

  // Build material map tracking how many BOMs use each material
  const matMap = new Map();
  productBoms.forEach((bom) => {
    (bom.components || []).forEach((comp) => {
      const matId = String(comp.inventoryId ?? comp.materialId ?? "");
      if (!matId) return;
      const mat = inventoryList.find((m) => String(m.id) === matId);
      if (matMap.has(matId)) {
        matMap.get(matId).bomCount++;
      } else {
        matMap.set(matId, {
          name: mat?.name || comp.materialName || "?",
          stockQty: mat?.stockQty ?? 0,
          uom: mat?.uom || comp.unit || "pcs",
          bomCount: 1,
        });
      }
    });
  });

  // Per-BOM: compute available qty and which material constrains it
  const variantAvailability = productBoms.map((bom) => {
    let minCan = Infinity;
    let constraintName = null;
    (bom.components || []).forEach((comp) => {
      const matId = String(comp.inventoryId ?? comp.materialId ?? "");
      const mat = matMap.get(matId);
      if (!mat) return;
      const can = Math.floor(mat.stockQty / (comp.qty || 1));
      if (can < minCan) { minCan = can; constraintName = mat.name; }
    });
    const available = minCan === Infinity ? 0 : minCan;
    const label = combinations.find((c) => c.id === bom.id)?.label || bom.productName || bom.name || "—";
    return { label, available, constraintName, isSharedConstrained: matMap.get(
      (bom.components || []).reduce((worst, comp) => {
        const matId = String(comp.inventoryId ?? comp.materialId ?? "");
        const mat = matMap.get(matId);
        const can = mat ? Math.floor(mat.stockQty / (comp.qty || 1)) : Infinity;
        return can < (worst.can ?? Infinity) ? { matId, can } : worst;
      }, {}).matId
    )?.bomCount > 1 };
  });

  const allMaterials = [...matMap.values()];

  const hasVariantData = variantAvailability.length > 0;

  return (
    <div style={{ padding: "1rem 1.25rem 1.25rem", background: "rgba(212,168,67,0.02)", borderTop: "1px solid var(--border)", display: "flex", gap: "2rem", flexWrap: "wrap" }}>

      {/* LEFT — Per-variant availability */}
      <div style={{ flex: "2 1 260px", minWidth: 0 }}>
        <div style={{ fontSize: "0.68rem", fontWeight: 700, color: "var(--gray)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "0.5rem" }}>
          Availability
        </div>
        {hasVariantData ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.45rem" }}>
            {variantAvailability.map((v, i) => {
              const bom = productBoms[i];
              const storefrontCap = bom && product.variantStock?.[bom.id] > 0 ? product.variantStock[bom.id] : null;
              const backorderOn = bom ? (product.variantBackorder?.[bom.id] ?? false) : false;
              const effectiveStorefront = backorderOn ? 9999 : (storefrontCap != null ? Math.min(v.available, storefrontCap) : v.available);
              const stockOverMax = backorderOn && storefrontCap != null && storefrontCap > v.available;
              return (
                <div key={i} style={{ display: "flex", flexDirection: "column", gap: "0.1rem" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                    <span style={{ fontSize: "0.8rem", color: "var(--white)", fontWeight: 600, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "200px" }}>{v.label}</span>
                    {!product.isMadeToOrder && (
                      <span style={{ fontSize: "0.75rem", fontWeight: 700, color: effectiveStorefront === 0 ? "#ef4444" : effectiveStorefront <= 10 ? "#f59e0b" : "#22c55e", flexShrink: 0 }}>
                        {effectiveStorefront === 0 ? "Out of stock" : backorderOn ? "Backorder" : `${effectiveStorefront} in stock`}
                      </span>
                    )}
                    {storefrontCap != null && !backorderOn && (
                      <span style={{ fontSize: "0.6rem", color: "var(--gray)", flexShrink: 0 }}>cap: {storefrontCap}</span>
                    )}
                    {backorderOn && (
                      <span style={{ fontSize: "0.6rem", fontWeight: 700, background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.3)", borderRadius: "4px", padding: "0.05rem 0.35rem", color: "#818cf8", flexShrink: 0 }}>
                        BACKORDER
                      </span>
                    )}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", flexWrap: "wrap" }}>
                    <span style={{ fontSize: "0.68rem", color: "var(--gray)" }}>
                      Can produce: <span style={{ color: v.available > 0 ? "var(--gold)" : "var(--gray)", fontWeight: 600 }}>{v.available}</span>
                    </span>
                    {v.constraintName && v.available > 0 && (
                      <span style={{ fontSize: "0.68rem", color: "var(--gray)" }}>
                        {v.isSharedConstrained ? `⚠ limited by ${v.constraintName}` : `w/ ${v.constraintName}`}
                      </span>
                    )}
                    {stockOverMax && (
                      <span style={{ fontSize: "0.68rem", color: "#f59e0b" }}>
                        ⚠ needs restock ({storefrontStock - v.available} above capacity)
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : inv ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.1rem" }}>
            <div style={{ fontSize: "0.8rem", color: (product.stock ?? 0) > 0 ? "#22c55e" : "#ef4444", fontWeight: 700 }}>
              {inv.isOnDemand ? "Upon Order" : (product.stock ?? 0) > 0 ? `${product.stock} in stock` : "Out of stock"}
            </div>
            {!product.isMadeToOrder && inv.stockQty > 0 && (
              <div style={{ fontSize: "0.68rem", color: "var(--gray)" }}>Can produce: <span style={{ color: "var(--gold)", fontWeight: 600 }}>{inv.stockQty}</span></div>
            )}
          </div>
        ) : (
          <div style={{ fontSize: "0.8rem", color: "var(--gray)", fontStyle: "italic", opacity: 0.6 }}>—</div>
        )}
      </div>

      {/* RIGHT — Materials breakdown */}
      {allMaterials.length > 0 && (
        <div style={{ flex: "1 1 200px", minWidth: 0 }}>
          <div style={{ fontSize: "0.68rem", fontWeight: 700, color: "var(--gray)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "0.5rem" }}>
            Materials
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.22rem" }}>
            {allMaterials.map((mat, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.76rem" }}>
                <span style={{ flex: 1, color: "var(--gray-light)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{mat.name}</span>
                <span style={{ fontWeight: 700, flexShrink: 0, color: mat.stockQty === 0 ? "#ef4444" : mat.stockQty <= 10 ? "#f59e0b" : "#22c55e" }}>
                  {mat.stockQty} {mat.uom}
                </span>
                {mat.bomCount > 1 && (
                  <span style={{ fontSize: "0.6rem", fontWeight: 700, background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.3)", borderRadius: "4px", padding: "0.05rem 0.35rem", color: "#f59e0b", flexShrink: 0 }}>
                    SHARED
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}

// ── Stepper ───────────────────────────────────────────────────────────────────
function Stepper({ current, steps }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 0, marginBottom: "2rem" }}>
      {steps.map((label, i) => (
        <React.Fragment key={i}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.35rem", flexShrink: 0 }}>
            <div style={{
              width: 28, height: 28, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
              background: i < current - 1 ? "#D4A843" : i === current - 1 ? "#D4A843" : "var(--dark3)",
              border: i === current - 1 ? "2px solid #D4A843" : "1px solid var(--border)",
              fontSize: "0.72rem", fontWeight: 800,
              color: i <= current - 1 ? "#000" : "rgba(229,226,225,0.3)",
              transition: "all 0.2s",
            }}>
              {i < current - 1 ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M20 6L9 17l-5-5" /></svg>
              ) : i + 1}
            </div>
            <span style={{ fontSize: "0.58rem", fontWeight: 700, color: i === current - 1 ? "#D4A843" : "rgba(229,226,225,0.35)", textTransform: "uppercase", letterSpacing: "0.08em", whiteSpace: "nowrap" }}>
              {label}
            </span>
          </div>
          {i < steps.length - 1 && (
            <div style={{ flex: 1, height: 1, background: i < current - 1 ? "#D4A843" : "var(--border)", margin: "14px 0.5rem 0", transition: "background 0.3s" }} />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

// ── Product Card Preview ───────────────────────────────────────────────────────
function ProductCardPreview({ name, category, priceRange, variantCount, maxProducible, thumbnail, isRequestQuote }) {
  return (
    <div style={{ position: "sticky", top: "1rem" }}>
      <div style={{ fontSize: "0.58rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.15em", color: "var(--gray)", marginBottom: "0.75rem" }}>
        Storefront Preview
      </div>
      <div style={{ background: "#19171580", border: "1px solid rgba(212,168,67,0.18)", borderRadius: "16px", overflow: "hidden", maxWidth: "240px", boxShadow: "0 8px 32px rgba(0,0,0,0.5)" }}>
        {/* Thumbnail */}
        <div style={{ width: "100%", aspectRatio: "1/1", position: "relative", overflow: "hidden" }}>
          {thumbnail ? (
            <img src={thumbnail} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          ) : (
            <div style={{ width: "100%", height: "100%", background: "linear-gradient(135deg, rgba(212,168,67,0.06) 0%, rgba(99,102,241,0.04) 100%)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "0.5rem" }}>
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="rgba(212,168,67,0.25)" strokeWidth="1.2">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <path d="M21 15l-5-5L5 21" />
              </svg>
              <span style={{ fontSize: "0.6rem", color: "var(--gray)", letterSpacing: "0.06em" }}>Upload image in Details</span>
            </div>
          )}
          {category && (
            <div style={{ position: "absolute", top: "0.5rem", left: "0.5rem", fontSize: "0.55rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#D4A843", background: "rgba(10,9,8,0.82)", borderRadius: "5px", padding: "0.2rem 0.5rem" }}>
              {category}
            </div>
          )}
        </div>
        {/* Info */}
        <div style={{ padding: "0.875rem 1rem 1rem" }}>
          <div style={{ display: "flex", gap: "0.15rem", marginBottom: "0.35rem" }}>
            {"★★★★★".split("").map((s, i) => (
              <span key={i} style={{ color: "#D4A843", fontSize: "0.65rem", opacity: 0.35 }}>{s}</span>
            ))}
            <span style={{ fontSize: "0.58rem", color: "var(--gray)", marginLeft: "0.25rem" }}>New</span>
          </div>
          <div style={{ fontSize: "0.875rem", fontWeight: 700, color: "var(--white)", marginBottom: "0.4rem", lineHeight: 1.3 }}>
            {name || <span style={{ color: "var(--gray)", fontStyle: "italic", fontWeight: 400 }}>Product name</span>}
          </div>
          <div style={{ fontSize: "1rem", fontWeight: 800, color: "#D4A843", marginBottom: "0.25rem" }}>
            {priceRange || <span style={{ fontSize: "0.72rem", color: "var(--gray)", fontWeight: 400 }}>Set price in Step 3</span>}
          </div>
          {isRequestQuote && (
            <div style={{ fontSize: "0.62rem", color: "rgba(139,92,246,0.9)", marginBottom: "0.35rem", fontStyle: "italic" }}>+ Request a custom quote</div>
          )}
          {variantCount > 1 && (
            <div style={{ fontSize: "0.65rem", color: "var(--gray)", marginBottom: "0.5rem" }}>
              {variantCount} options available
            </div>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", marginBottom: "0.75rem" }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: maxProducible > 0 ? "#22c55e" : "#ef4444", flexShrink: 0 }} />
            <span style={{ fontSize: "0.62rem", color: "var(--gray)" }}>
              {maxProducible > 0 ? "In stock" : "Out of stock"}
            </span>
          </div>
          <button
            type="button"
            disabled
            style={{ width: "100%", padding: "0.55rem", background: "#D4A843", border: "none", borderRadius: "8px", color: "#1a1814", fontWeight: 800, fontSize: "0.78rem", cursor: "default", letterSpacing: "0.02em" }}
          >
            {isRequestQuote ? "Request Quote" : "Add to Cart"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Add Product Modal (4-step BOM-based) ──────────────────────────────────────
function AddProductModal({ boms, inventoryList, products, onClose, onSave, onPriceError, token }) {
  const allBoms = useMemo(() => (boms || []).filter((b) => b.productName), [boms]);
  const existingCategories = useMemo(
    () => [...new Set(products.map((p) => p.category).filter(Boolean))].sort(),
    [products],
  );

  // ── Step state ──
  const [step, setStep] = useState(1);
  const [stepError, setStepError] = useState("");

  // Step 1 — BOM selection
  const [selectedBoms, setSelectedBoms] = useState([]); // [{bom, label}]
  const [bomSearch, setBomSearch] = useState("");
  const [bomOpen, setBomOpen] = useState(false);
  const [variantSearches, setVariantSearches] = useState({}); // {idx: string}
  const [variantOpens, setVariantOpens] = useState({}); // {idx: bool}
  const bomSearchRef = useRef(null);

  // Step 2 — Details
  const [storefrontName, setStorefrontName] = useState("");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [catOpen, setCatOpen] = useState(false);
  const catRef = useRef(null);

  // Step 3 — Pricing
  const [priceType, setPriceType] = useState("fixed");
  const [isRequestQuote, setIsRequestQuote] = useState(false);
  const [variantPrices, setVariantPrices] = useState({});
  const [tiers, setTiers] = useState([{ id: 1, minQty: 1, maxQty: 20, prices: {} }]);

  // Step 4 — Availability + Media
  const [stockMap, setStockMap] = useState({});
  const [isMadeToOrder, setIsMadeToOrder] = useState(false);
  const [thumbnail, setThumbnail] = useState(null);
  const [images, setImages] = useState([]);
  const [dragOverThumb, setDragOverThumb] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [isPublished, setIsPublished] = useState(false);
  const [uploadingMedia, setUploadingMedia] = useState(false);

  // ── Derived ──
  const isStandalone = selectedBoms.length <= 1;
  const hasVariants = selectedBoms.length > 1;
  const primaryBom = selectedBoms[0]?.bom;

  const maxProducible = useMemo(() => {
    const result = {};
    selectedBoms.forEach(({ bom }) => {
      let min = Infinity;
      (bom.components || []).forEach((comp) => {
        const inv = inventoryList.find((i) => String(i.id) === String(comp.inventoryId ?? comp.materialId));
        const can = Math.floor(getAvailableQty(inv) / (comp.qty || 1));
        if (can < min) min = can;
      });
      result[bom.id] = min === Infinity ? 0 : min;
    });
    return result;
  }, [selectedBoms, inventoryList]);

  const bomCostMap = useMemo(() => {
    const result = {};
    selectedBoms.forEach(({ bom }) => { result[bom.id] = bom.totalCost || 0; });
    return result;
  }, [selectedBoms]);

  const bottleneckMap = useMemo(() => {
    const result = {};
    selectedBoms.forEach(({ bom }) => {
      let minR = Infinity, minName = null;
      (bom.components || []).forEach((comp) => {
        const inv = inventoryList.find((i) => String(i.id) === String(comp.inventoryId ?? comp.materialId));
        const r = Math.floor((inv?.stockQty || 0) / (comp.qty || 1));
        if (r < minR) { minR = r; minName = comp.materialName; }
      });
      result[bom.id] = minName;
    });
    return result;
  }, [selectedBoms, inventoryList]);

  const priceWarnings = useMemo(() => {
    if (priceType !== "fixed") return {};
    const w = {};
    selectedBoms.forEach(({ bom }) => {
      const cost = bomCostMap[bom.id] || 0;
      const p = parseFloat(variantPrices[bom.id]);
      if (variantPrices[bom.id] !== "" && !isNaN(p) && cost > 0)
        w[bom.id] = p < cost ? `Below cost — lose ₱${(cost - p).toFixed(2)}/unit` : null;
    });
    return w;
  }, [variantPrices, bomCostMap, priceType, selectedBoms]);

  const tierWarnings = useMemo(() => {
    if (priceType !== "tiered") return {};
    const w = {};
    tiers.forEach((tier) => {
      Object.entries(tier.prices || {}).forEach(([key, price]) => {
        const cost = bomCostMap[key] || 0;
        const p = parseFloat(price);
        if (price !== "" && !isNaN(p) && cost > 0 && p < cost) w[`${tier.id}_${key}`] = true;
      });
    });
    return w;
  }, [tiers, bomCostMap, priceType]);

  const overallMaxProducible = selectedBoms.length
    ? Math.min(...selectedBoms.map((s) => maxProducible[s.bom.id] ?? 0))
    : 0;

  const priceRangeText = useMemo(() => {
    if (priceType === "inquiry") return "For Inquiry";
    if (priceType === "fixed") {
      const prices = selectedBoms
        .map((s) => parseFloat(variantPrices[s.bom.id]))
        .filter((p) => !isNaN(p) && p > 0);
      if (!prices.length) return "";
      const mn = Math.min(...prices), mx = Math.max(...prices);
      return mn === mx ? `₱${mn.toLocaleString("en-PH")}` : `₱${mn.toLocaleString("en-PH")} – ₱${mx.toLocaleString("en-PH")}`;
    }
    if (priceType === "tiered") {
      const all = tiers.flatMap((t) => Object.values(t.prices || {}).map((p) => parseFloat(p)).filter((p) => !isNaN(p) && p > 0));
      if (!all.length) return "";
      const mn = Math.min(...all), mx = Math.max(...all);
      return mn === mx ? `₱${mn.toLocaleString("en-PH")}` : `From ₱${mn.toLocaleString("en-PH")}`;
    }
    return "";
  }, [priceType, variantPrices, tiers, selectedBoms]);

  // ── Sync: when selectedBoms changes, reset pricing + stock ──
  useEffect(() => {
    const initPrices = {}, initStock = {}, initTierPrices = {};
    selectedBoms.forEach(({ bom }) => {
      initPrices[bom.id] = "";
      initStock[bom.id] = "";
      initTierPrices[bom.id] = "";
    });
    setVariantPrices(initPrices);
    setStockMap(initStock);
    const priceKey = isStandalone ? { __base__: "" } : initTierPrices;
    setTiers([{ id: 1, minQty: 1, maxQty: 20, prices: priceKey }]);
  }, [selectedBoms.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Sync: storefront name defaults to primary BOM name ──
  useEffect(() => {
    if (primaryBom && !storefrontName) setStorefrontName(primaryBom.productName || "");
    if (primaryBom && !category) setCategory(primaryBom.category || "");
  }, [primaryBom]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Outside click handlers ──
  useEffect(() => {
    const h = (e) => {
      if (bomSearchRef.current && !bomSearchRef.current.contains(e.target)) setBomOpen(false);
      if (catRef.current && !catRef.current.contains(e.target)) setCatOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  // ── Tier helpers ──
  const addTier = () => {
    const last = tiers[tiers.length - 1];
    const emptyPrices = isStandalone ? { __base__: "" } : selectedBoms.reduce((acc, { bom }) => ({ ...acc, [bom.id]: "" }), {});
    setTiers((p) => [...p, { id: Date.now(), minQty: last ? (parseInt(last.maxQty) || 0) + 1 : 1, maxQty: "", prices: emptyPrices }]);
  };
  const removeTier = (id) => setTiers(tiers.filter((t) => t.id !== id));
  const updateTierRange = (id, field, val) => setTiers(tiers.map((t) => t.id === id ? { ...t, [field]: val } : t));
  const updateTierPrice = (tierId, key, val) => setTiers(tiers.map((t) => t.id === tierId ? { ...t, prices: { ...t.prices, [key]: val } } : t));

  // ── Image helpers ──
  const mkImg = (file) => ({ file, preview: URL.createObjectURL(file), id: Date.now() + Math.random() });
  const handleThumb = (files) => { const f = files[0]; if (f) setThumbnail(mkImg(f)); };
  const handleGallery = (files) => setImages((p) => [...p, ...Array.from(files).map(mkImg)]);

  // ── Step validation ──
  const validateStep = () => {
    if (step === 1) {
      if (!selectedBoms.length) { setStepError("Select at least one product."); return false; }
    }
    if (step === 2) {
      if (!storefrontName.trim()) { setStepError("Storefront name is required."); return false; }
      if (!category.trim()) { setStepError("Category is required."); return false; }
    }
    if (step === 3 && !isRequestQuote && priceType === "fixed") {
      const allSet = selectedBoms.every(({ bom }) => variantPrices[bom.id] !== "" && parseFloat(variantPrices[bom.id]) > 0);
      if (!allSet) { setStepError("Enter a price for every variant."); return false; }
    }
    if (step === 3 && !isRequestQuote && priceType === "tiered") {
      const allSet = tiers.every((t) => Object.values(t.prices).every((p) => p !== "" && parseFloat(p) > 0));
      if (!allSet) { setStepError("Fill in all tier prices."); return false; }
    }
    setStepError("");
    return true;
  };

  const goNext = () => { if (validateStep()) setStep((s) => s + 1); };
  const goBack = () => { setStepError(""); setStep((s) => s - 1); };

  // ── Save ──
  const handleSave = async () => {
    if (!selectedBoms.length) return;
    if (!token) { onPriceError("Sign in required."); return; }
    setUploadingMedia(true);
    try {
      let thumbFinal = null;
      if (thumbnail?.file) {
        const up = await uploadImage(thumbnail.file, "pmp-products", token);
        thumbFinal = up.url || up?.data?.url;
      }
      const galleryUrls = [];
      for (const img of images) {
        if (img.file) {
          const up = await uploadImage(img.file, "pmp-products", token);
          galleryUrls.push(up.url || up?.data?.url);
        }
      }
      const syntheticVarGroups = hasVariants
        ? [{ id: "bom-variant", name: "Type", options: selectedBoms.map((s) => ({ id: s.bom.id, value: s.label || s.bom.productName })) }]
        : [];
      const syntheticCombos = hasVariants
        ? selectedBoms.map((s) => ({ id: s.bom.id, combo: { "bom-variant": s.label || s.bom.productName }, label: s.label || s.bom.productName }))
        : [];
      const primaryId = primaryBom?.id;
      const stockVal = isStandalone ? (parseInt(stockMap[primaryId]) || 0) : null;
      const variantStock = hasVariants
        ? selectedBoms.reduce((acc, { bom }) => ({ ...acc, [bom.id]: parseInt(stockMap[bom.id]) || 0 }), {})
        : undefined;

      const productData = {
        productName: storefrontName,
        subCategoryName: storefrontName,
        subCategoryCode: storefrontName.split(" ").filter((w) => w).map((w) => w[0]).join("").toUpperCase().slice(0, 8),
        category,
        description,
        priceType,
        ...(priceType === "fixed"
          ? isStandalone
            ? { price: variantPrices[primaryId] }
            : { variantPrices }
          : priceType === "tiered"
          ? { tiers }
          : {}),
        variantGroups: syntheticVarGroups,
        combinations: syntheticCombos,
        stock: stockVal,
        variantStock,
        trackInventory: true,
        isMadeToOrder,
        bomId: isStandalone ? primaryId : undefined,
        bomGroupName: storefrontName,
        thumbnail: thumbFinal,
        images: galleryUrls,
        isPublished,
        isArchived: false,
        isInquiry: isRequestQuote,
      };

      const saved = await createProduct(normalizeProductForApi(productData), token);
      onSave(saved);
      onClose();
    } catch (err) {
      onPriceError(err.message || "Save failed.");
    } finally {
      setUploadingMedia(false);
    }
  };

  // ── BOM search filter ──
  const usedBomIds = new Set(selectedBoms.map((s) => s.bom.id));
  const filteredBoms = allBoms.filter(
    (b) => !usedBomIds.has(b.id) && (!bomSearch || b.productName.toLowerCase().includes(bomSearch.toLowerCase()) || (b.category || "").toLowerCase().includes(bomSearch.toLowerCase()))
  );

  // ── UI ──
  const secTitle = { fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--gray-light)", margin: "0 0 1rem 0" };
  const inputSt = { width: "100%", background: "var(--dark3)", border: "1px solid var(--border)", borderRadius: "10px", padding: "0.75rem 1rem", color: "var(--white)", fontSize: "0.875rem", outline: "none", boxSizing: "border-box" };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: "var(--dark)", border: "1px solid var(--border)", borderRadius: "16px", width: "100%", maxWidth: "900px", maxHeight: "92vh", overflowY: "auto", display: "flex", flexDirection: "column", scrollbarWidth: "thin", scrollbarColor: "var(--gold) var(--dark2)" }}
      >
        {/* Header */}
        <div style={{ position: "sticky", top: 0, zIndex: 10, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "1.25rem 1.5rem", background: "var(--dark)", borderBottom: "1px solid var(--border)" }}>
          <div>
            <h2 className="modal-title" style={{ margin: 0 }}>Add New Product</h2>
            <p style={{ color: "var(--gray)", fontSize: "0.78rem", margin: "0.2rem 0 0" }}>
              {step === 1 && "Select a product from your BOM catalog"}
              {step === 2 && "Set storefront details and preview the card"}
              {step === 3 && "Configure pricing and margins"}
              {step === 4 && "Set availability, media, and publish"}
            </p>
          </div>
          <button onClick={onClose} style={{ background: "var(--dark2)", border: "1px solid var(--border)", borderRadius: "8px", width: "36px", height: "36px", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--gray)", cursor: "pointer" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>

        <div style={{ padding: "1.5rem", flex: 1 }}>
          <Stepper current={step} steps={["Select", "Details", "Pricing", "Availability"]} />

          {/* ─── STEP 1: Select BOM ─────────────────────────────────── */}
          {step === 1 && (
            <div>
              <p style={secTitle}>Select a BOM to build this product from</p>

              {/* Search */}
              <div style={{ marginBottom: "1.25rem" }}>
                <input
                  type="text"
                  style={{ ...inputSt, paddingLeft: "2.5rem", backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23666' stroke-width='2'%3E%3Ccircle cx='11' cy='11' r='8'/%3E%3Cpath d='M21 21l-4.35-4.35'/%3E%3C/svg%3E\")", backgroundRepeat: "no-repeat", backgroundPosition: "0.75rem center" }}
                  placeholder="Search by name or category…"
                  value={bomSearch}
                  onChange={(e) => setBomSearch(e.target.value)}
                />
              </div>

              {allBoms.length === 0 ? (
                <div style={{ textAlign: "center", padding: "3rem 1rem", color: "var(--gray)", fontSize: "0.85rem" }}>
                  No BOMs found. Create a BOM first in Master Data.
                </div>
              ) : filteredBoms.length === 0 && bomSearch ? (
                <div style={{ textAlign: "center", padding: "2rem 1rem", color: "var(--gray)", fontSize: "0.85rem" }}>
                  No BOMs match &ldquo;{bomSearch}&rdquo;
                </div>
              ) : (
                (() => {
                  const groups = {};
                  filteredBoms.forEach((b) => {
                    const g = b.category || b.productGroupName || "Uncategorized";
                    if (!groups[g]) groups[g] = [];
                    groups[g].push(b);
                  });
                  return Object.entries(groups).map(([groupName, items]) => (
                    <div key={groupName} style={{ marginBottom: "1.5rem" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.75rem" }}>
                        <span style={{ fontSize: "0.68rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--gray)" }}>{groupName}</span>
                        <span style={{ fontSize: "0.6rem", background: "var(--dark3)", border: "1px solid var(--border)", borderRadius: "20px", padding: "0.1rem 0.4rem", color: "var(--gray)" }}>{items.length}</span>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(148px, 1fr))", gap: "0.625rem" }}>
                        {items.map((b) => {
                          const isPrimary = selectedBoms[0]?.bom.id === b.id;
                          const isVariant = selectedBoms.slice(1).some((s) => s.bom.id === b.id);
                          const mp = maxProducible[b.id];
                          return (
                            <button
                              key={b.id}
                              type="button"
                              onClick={() => setSelectedBoms(isPrimary ? [] : [{ bom: b, label: "" }])}
                              style={{ background: isPrimary ? "rgba(212,168,67,0.09)" : isVariant ? "rgba(99,102,241,0.07)" : "var(--dark3)", border: `1px solid ${isPrimary ? "#D4A843" : isVariant ? "rgba(99,102,241,0.45)" : "var(--border)"}`, borderRadius: "12px", padding: "0.875rem", textAlign: "left", cursor: "pointer", position: "relative", transition: "border-color 0.15s, background 0.15s" }}
                            >
                              {isPrimary && (
                                <div style={{ position: "absolute", top: "0.5rem", right: "0.5rem", width: 18, height: 18, borderRadius: "50%", background: "#D4A843", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#1a1814" strokeWidth="3.5"><path d="M20 6L9 17l-5-5" /></svg>
                                </div>
                              )}
                              <div style={{ fontSize: "0.78rem", fontWeight: 700, color: isPrimary ? "#D4A843" : "#E5E2E1", lineHeight: 1.3, marginBottom: "0.5rem", paddingRight: isPrimary ? "1.25rem" : 0 }}>
                                {b.productName}
                              </div>
                              <div style={{ fontSize: "0.75rem", fontWeight: 800, color: "#D4A843", marginBottom: "0.25rem" }}>
                                ₱{(b.totalCost || 0).toFixed(2)}
                              </div>
                              <div style={{ fontSize: "0.62rem", color: "var(--gray)", marginBottom: "0.3rem" }}>
                                {b.components?.length || 0} material{b.components?.length !== 1 ? "s" : ""}
                              </div>
                              {mp !== undefined && (
                                <div style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
                                  <span style={{ width: 5, height: 5, borderRadius: "50%", background: mp === 0 ? "#ef4444" : "#22c55e", flexShrink: 0 }} />
                                  <span style={{ fontSize: "0.6rem", color: mp === 0 ? "#f87171" : "rgba(229,226,225,0.38)" }}>
                                    {mp === 0 ? "No stock" : `${mp} can be made`}
                                  </span>
                                </div>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ));
                })()
              )}

              {/* Selected BOM stats + variant picker */}
              {selectedBoms.length > 0 && (
                <div style={{ marginTop: "1rem", background: "rgba(212,168,67,0.05)", border: "1px solid rgba(212,168,67,0.2)", borderRadius: "12px", overflow: "hidden" }}>
                  <div style={{ padding: "0.875rem 1rem", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid rgba(212,168,67,0.12)" }}>
                    <div>
                      <div style={{ fontWeight: 700, color: "#D4A843", fontSize: "0.88rem" }}>{selectedBoms[0].bom.productName}</div>
                      <div style={{ fontSize: "0.65rem", color: "var(--gray)", marginTop: "0.1rem" }}>Selected as primary BOM</div>
                    </div>
                    <button type="button" onClick={() => setSelectedBoms([])}
                      style={{ background: "none", border: "none", color: "var(--gray)", cursor: "pointer", fontSize: "0.72rem", padding: "0.25rem 0.5rem" }}>
                      Clear
                    </button>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "1px", background: "rgba(212,168,67,0.1)" }}>
                    {[
                      { label: "BOM Cost", value: `₱${(bomCostMap[selectedBoms[0].bom.id] || 0).toFixed(2)}`, color: "#D4A843" },
                      { label: "Max Producible", value: `${maxProducible[selectedBoms[0].bom.id] ?? "—"} units`, color: maxProducible[selectedBoms[0].bom.id] === 0 ? "#ef4444" : "#E5E2E1" },
                      { label: "Bottleneck", value: bottleneckMap[selectedBoms[0].bom.id] || "—", color: bottleneckMap[selectedBoms[0].bom.id] ? "#f59e0b" : "var(--gray)" },
                    ].map(({ label, value, color }) => (
                      <div key={label} style={{ background: "rgba(0,0,0,0.25)", padding: "0.625rem 0.875rem" }}>
                        <div style={{ fontSize: "0.58rem", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--gray)", marginBottom: "0.2rem" }}>{label}</div>
                        <div style={{ fontSize: "0.82rem", fontWeight: 700, color }}>{value}</div>
                      </div>
                    ))}
                  </div>

                  {/* Added variants */}
                  {selectedBoms.slice(1).length > 0 && (
                    <div style={{ padding: "0.75rem 1rem 0" }}>
                      <div style={{ fontSize: "0.62rem", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--gray)", marginBottom: "0.5rem" }}>Size / Finish Variants</div>
                      {selectedBoms.slice(1).map(({ bom }, rawIdx) => {
                        const idx = rawIdx + 1;
                        return (
                          <div key={bom.id} style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginBottom: "0.4rem" }}>
                            <div style={{ flex: 1, background: "rgba(99,102,241,0.06)", border: "1px solid rgba(99,102,241,0.25)", borderRadius: "8px", padding: "0.4rem 0.75rem", fontSize: "0.8rem", color: "var(--white)" }}>{bom.productName}</div>
                            <button type="button" onClick={() => setSelectedBoms((p) => p.filter((_, j) => j !== idx))}
                              style={{ background: "none", border: "none", color: "var(--gray)", cursor: "pointer", padding: "0.25rem" }}>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6L6 18M6 6l12 12" /></svg>
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Add variant button + dropdown */}
                  <div style={{ padding: "0.75rem 1rem", position: "relative" }}>
                    <button type="button"
                      onClick={() => setVariantOpens((p) => ({ ...p, new: !p.new }))}
                      style={{ display: "flex", alignItems: "center", gap: "0.4rem", background: "none", border: "1px dashed var(--border)", borderRadius: "8px", padding: "0.45rem 0.875rem", color: "var(--gray)", fontSize: "0.75rem", cursor: "pointer", width: "100%" }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14" /></svg>
                      Add size / finish variant
                    </button>
                    {variantOpens.new && (
                      <div style={{ position: "absolute", bottom: "calc(100% - 0.75rem)", left: "1rem", right: "1rem", background: "var(--dark2,#1a1a1a)", border: "1px solid var(--border)", borderRadius: "10px", zIndex: 100, maxHeight: "200px", overflowY: "auto" }}>
                        <div style={{ padding: "0.5rem" }}>
                          <input type="text" placeholder="Search BOM…"
                            style={{ ...inputSt, padding: "0.5rem 0.75rem", fontSize: "0.8rem" }}
                            value={variantSearches.new || ""}
                            onChange={(e) => setVariantSearches((p) => ({ ...p, new: e.target.value }))}
                          />
                        </div>
                        {allBoms
                          .filter((b) => !usedBomIds.has(b.id) && (!variantSearches.new || b.productName.toLowerCase().includes(variantSearches.new.toLowerCase())))
                          .slice(0, 15)
                          .map((b) => (
                            <button key={b.id} type="button"
                              onClick={() => {
                                setSelectedBoms((p) => [...p, { bom: b, label: "" }]);
                                setVariantOpens((p) => ({ ...p, new: false }));
                                setVariantSearches((p) => ({ ...p, new: "" }));
                              }}
                              style={{ width: "100%", textAlign: "left", background: "none", border: "none", padding: "0.6rem 1rem", color: "var(--white)", fontSize: "0.82rem", cursor: "pointer" }}
                              onMouseEnter={(e) => e.currentTarget.style.background = "var(--dark3)"}
                              onMouseLeave={(e) => e.currentTarget.style.background = "none"}
                            >
                              {b.productName}
                            </button>
                          ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ─── STEP 2: Details + Preview ──────────────────────────── */}
          {step === 2 && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 240px", gap: "2rem", alignItems: "start" }}>
              <div>
                <p style={secTitle}>Product Details</p>
                <div style={{ marginBottom: "1rem" }}>
                  <label className="form-label">Storefront Name</label>
                  <input type="text" className="form-input" value={storefrontName}
                    onChange={(e) => setStorefrontName(e.target.value)}
                    placeholder="e.g. Custom Ceramic Mug 11oz" />
                </div>
                <div style={{ marginBottom: "1rem" }} ref={catRef}>
                  <label className="form-label">Category</label>
                  <div style={{ position: "relative" }}>
                    <input type="text" className="form-input" value={category}
                      onChange={(e) => { setCategory(e.target.value); setCatOpen(true); }}
                      onFocus={() => setCatOpen(true)}
                      placeholder="e.g. Mugs, Stickers, Badges" />
                    {catOpen && (existingCategories.some((c) => c.toLowerCase().includes(category.toLowerCase())) || (!existingCategories.find((c) => c.toLowerCase() === category.toLowerCase()) && category)) && (
                      <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, background: "var(--dark2,#1a1a1a)", border: "1px solid var(--border)", borderRadius: "10px", zIndex: 100, maxHeight: "160px", overflowY: "auto" }}>
                        {existingCategories.filter((c) => c.toLowerCase().includes(category.toLowerCase())).map((c) => (
                          <button key={c} type="button" onClick={() => { setCategory(c); setCatOpen(false); }}
                            style={{ width: "100%", textAlign: "left", background: "none", border: "none", padding: "0.6rem 1rem", color: "var(--white)", fontSize: "0.85rem", cursor: "pointer" }}
                            onMouseEnter={(e) => e.currentTarget.style.background = "var(--dark3)"}
                            onMouseLeave={(e) => e.currentTarget.style.background = "none"}>{c}</button>
                        ))}
                        {category && !existingCategories.find((c) => c.toLowerCase() === category.toLowerCase()) && (
                          <button type="button" onClick={() => setCatOpen(false)}
                            style={{ width: "100%", textAlign: "left", background: "none", border: "none", borderTop: "1px solid var(--border)", padding: "0.6rem 1rem", color: "#D4A843", fontSize: "0.78rem", cursor: "pointer", fontWeight: 700 }}
                            onMouseEnter={(e) => e.currentTarget.style.background = "rgba(212,168,67,0.06)"}
                            onMouseLeave={(e) => e.currentTarget.style.background = "none"}>
                            + Use &ldquo;{category}&rdquo;
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                <div>
                  <label className="form-label">Description</label>
                  <textarea className="form-textarea" value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Materials used, printing method, available sizes, customization options…"
                    rows={4} />
                </div>
              </div>
              <ProductCardPreview
                name={storefrontName}
                category={category}
                priceRange={priceRangeText}
                variantCount={selectedBoms.length}
                maxProducible={overallMaxProducible}
                thumbnail={thumbnail?.preview}
                isRequestQuote={isRequestQuote}
              />
            </div>
          )}

          {/* ─── STEP 3: Pricing ────────────────────────────────────── */}
          {step === 3 && (
            <div>
              <p style={secTitle}>Pricing</p>
              <div className="price-type-row" style={{ marginBottom: "1.25rem" }}>
                {[{ val: "fixed", label: "Fixed Price" }, { val: "tiered", label: "Tier Price" }].map(({ val, label }) => (
                  <button key={val} type="button" className={`price-type-btn${priceType === val ? " selected" : ""}`} onClick={() => setPriceType(val)}>{label}</button>
                ))}
              </div>

              {priceType === "fixed" && (
                isStandalone ? (
                  <div>
                    <div style={{ fontSize: "0.75rem", color: "var(--gray)", marginBottom: "0.5rem" }}>
                      Floor price (BOM cost): <strong style={{ color: "#D4A843" }}>₱{(bomCostMap[primaryBom?.id] || 0).toFixed(2)}/unit</strong> — sell above this to profit
                    </div>
                    <div className="tier-price-cell">
                      <span className="peso">₱</span>
                      <NumberInput className="tier-input" value={variantPrices[primaryBom?.id] || ""} onChange={(e) => setVariantPrices((p) => ({ ...p, [primaryBom.id]: sanitizeNumber(e.target.value) }))} placeholder="0" min={0} step="0.01" />
                    </div>
                    {priceWarnings[primaryBom?.id] && <div style={{ marginTop: "0.4rem", fontSize: "0.78rem", color: "#f87171" }}>Warning: {priceWarnings[primaryBom.id]}</div>}
                  </div>
                ) : (
                  <div className="tier-table-wrap">
                    <table className="tier-table">
                      <thead>
                        <tr><th>Variant / Size</th><th>BOM Cost (Floor)</th><th>Your Price (₱)</th><th>Margin</th></tr>
                      </thead>
                      <tbody>
                        {selectedBoms.map(({ bom, label }) => {
                          const cost = bomCostMap[bom.id] || 0;
                          const price = parseFloat(variantPrices[bom.id]);
                          const hasP = variantPrices[bom.id] !== "" && !isNaN(price);
                          const margin = hasP ? price - cost : null;
                          return (
                            <tr key={bom.id}>
                              <td style={{ fontWeight: 600, color: "var(--white)" }}>{label || bom.productName}</td>
                              <td style={{ color: "#D4A843", fontWeight: 700 }}>₱{cost.toFixed(2)}</td>
                              <td>
                                <div className="tier-price-cell">
                                  <span className="peso">₱</span>
                                  <NumberInput className="tier-input" value={variantPrices[bom.id] || ""} onChange={(e) => setVariantPrices((p) => ({ ...p, [bom.id]: sanitizeNumber(e.target.value) }))} placeholder="0" min={0} step="0.01" />
                                </div>
                              </td>
                              <td>
                                {margin !== null && (
                                  <span style={{ fontSize: "0.78rem", fontWeight: 600, color: margin < 0 ? "#f87171" : "#22c55e" }}>
                                    {margin < 0 ? `-₱${Math.abs(margin).toFixed(2)}` : `+₱${margin.toFixed(2)}`}
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )
              )}

              {priceType === "tiered" && (
                <>
                  {Object.keys(tierWarnings).length > 0 && (
                    <div style={{ marginBottom: "0.75rem", padding: "0.5rem 0.75rem", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: "6px", fontSize: "0.78rem", color: "#f87171" }}>
                      Cells in red are priced below BOM cost — selling at a loss.
                    </div>
                  )}
                  <div className="tier-table-wrap">
                    <table className="tier-table smart-tier-table">
                      <thead>
                        <tr>
                          <th>Tier</th>
                          <th>Min Qty</th>
                          <th>Max Qty</th>
                          {isStandalone ? (
                            <th>Price (₱)<div style={{ fontSize: "0.6rem", color: "#D4A843", fontWeight: 600 }}>floor ₱{(bomCostMap[primaryBom?.id] || 0).toFixed(2)}</div></th>
                          ) : (
                            selectedBoms.map(({ bom, label }) => (
                              <th key={bom.id} className="tier-variant-header">
                                {label || bom.productName}
                                <div style={{ fontSize: "0.6rem", color: "#D4A843", fontWeight: 600 }}>floor ₱{(bomCostMap[bom.id] || 0).toFixed(2)}</div>
                              </th>
                            ))
                          )}
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {tiers.map((tier, idx) => (
                          <tr key={tier.id}>
                            <td><span className="tier-badge">Tier {idx + 1}</span></td>
                            <td><NumberInput className="tier-input" value={tier.minQty ?? ""} placeholder="1" min={0} onChange={(e) => updateTierRange(tier.id, "minQty", e.target.value)} /></td>
                            <td><NumberInput className="tier-input" value={tier.maxQty ?? ""} placeholder="∞" min={0} onChange={(e) => updateTierRange(tier.id, "maxQty", e.target.value)} /></td>
                            {isStandalone ? (
                              <td style={{ background: tierWarnings[`${tier.id}___base__`] ? "rgba(239,68,68,0.07)" : undefined }}>
                                <div className="tier-price-cell">
                                  <span className="peso" style={{ color: tierWarnings[`${tier.id}___base__`] ? "#f87171" : undefined }}>₱</span>
                                  <NumberInput className="tier-input" value={tier.prices["__base__"] || ""} onChange={(e) => updateTierPrice(tier.id, "__base__", sanitizeNumber(e.target.value))} placeholder="0" min={0} step="0.01" />
                                </div>
                              </td>
                            ) : (
                              selectedBoms.map(({ bom }) => {
                                const wkey = `${tier.id}_${bom.id}`;
                                return (
                                  <td key={bom.id} style={{ background: tierWarnings[wkey] ? "rgba(239,68,68,0.07)" : undefined }}>
                                    <div className="tier-price-cell">
                                      <span className="peso" style={{ color: tierWarnings[wkey] ? "#f87171" : undefined }}>₱</span>
                                      <NumberInput className="tier-input" value={tier.prices[bom.id] || ""} onChange={(e) => updateTierPrice(tier.id, bom.id, sanitizeNumber(e.target.value))} placeholder="0" min={0} step="0.01" />
                                    </div>
                                  </td>
                                );
                              })
                            )}
                            <td>{tiers.length > 1 && <button type="button" className="btn-remove-tier" onClick={() => removeTier(tier.id)}>Remove</button>}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <button type="button" className="add-tier-btn" onClick={addTier}>Add Price Tier</button>
                </>
              )}

              {/* Request Quote toggle */}
              <div style={{ marginTop: "1.25rem", padding: "0.875rem 1rem", background: "var(--dark3)", border: "1px solid var(--border)", borderRadius: "10px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontWeight: 700, color: "var(--white)", fontSize: "0.875rem" }}>Request Quote</div>
                  <div style={{ fontSize: "0.72rem", color: "var(--gray)", marginTop: "0.15rem" }}>
                    {isRequestQuote
                      ? "Customers see the price as a reference and submit a quote request. Inquiry goes to Orders."
                      : "Customer can add directly to cart. Toggle on if pricing needs discussion first."}
                  </div>
                </div>
                <button type="button" onClick={() => setIsRequestQuote((p) => !p)}
                  style={{ position: "relative", display: "inline-flex", alignItems: "center", width: "44px", height: "24px", borderRadius: "12px", border: "none", background: isRequestQuote ? "#D4A843" : "var(--border)", cursor: "pointer", flexShrink: 0, padding: 0 }}>
                  <span style={{ position: "absolute", left: isRequestQuote ? "22px" : "2px", width: "20px", height: "20px", borderRadius: "50%", background: "#fff", transition: "left 0.2s", boxShadow: "0 1px 4px rgba(0,0,0,0.3)" }} />
                </button>
              </div>
            </div>
          )}

          {/* ─── STEP 4: Availability + Media ───────────────────────── */}
          {step === 4 && (
            <div>
              {/* Made to Order toggle */}
              <div style={{ marginBottom: "1.25rem", padding: "0.875rem 1rem", background: "var(--dark3)", border: "1px solid var(--border)", borderRadius: "10px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontWeight: 700, color: "var(--white)", fontSize: "0.875rem" }}>Made to Order</div>
                  <div style={{ fontSize: "0.72rem", color: "var(--gray)", marginTop: "0.15rem" }}>
                    {isMadeToOrder ? "Published with 0 stock — fulfil orders on demand." : "Stock is capped to what you can currently produce."}
                  </div>
                </div>
                <button type="button" onClick={() => setIsMadeToOrder((p) => !p)}
                  style={{ position: "relative", display: "inline-flex", alignItems: "center", width: "44px", height: "24px", borderRadius: "12px", border: "none", background: isMadeToOrder ? "#D4A843" : "var(--border)", cursor: "pointer", flexShrink: 0, padding: 0 }}>
                  <span style={{ position: "absolute", left: isMadeToOrder ? "22px" : "2px", width: "20px", height: "20px", borderRadius: "50%", background: "#fff", transition: "left 0.2s", boxShadow: "0 1px 4px rgba(0,0,0,0.3)" }} />
                </button>
              </div>

              {/* Stock */}
              {!isMadeToOrder && (
                <div style={{ marginBottom: "1.5rem" }}>
                  <p style={secTitle}>Storefront Availability</p>
                  {isStandalone ? (
                    <div>
                      <div style={{ fontSize: "0.8rem", color: "var(--gray)", marginBottom: "0.75rem" }}>
                        Max producible from current stock: <strong style={{ color: "var(--white)" }}>{maxProducible[primaryBom?.id] ?? 0} units</strong>
                      </div>
                      <label className="form-label">Storefront Stock</label>
                      <NumberInput className="form-input"
                        value={stockMap[primaryBom?.id] ?? String(maxProducible[primaryBom?.id] ?? 0)}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (parseInt(val) > (maxProducible[primaryBom?.id] ?? 0)) return;
                          setStockMap((p) => ({ ...p, [primaryBom.id]: val }));
                        }}
                        placeholder="0" min={0} max={maxProducible[primaryBom?.id] ?? 0} />
                    </div>
                  ) : (
                    <div className="tier-table-wrap">
                      <table className="tier-table">
                        <thead><tr><th>Variant / Size</th><th>Max Producible</th><th>Storefront Stock</th></tr></thead>
                        <tbody>
                          {selectedBoms.map(({ bom, label }) => (
                            <tr key={bom.id}>
                              <td style={{ fontWeight: 600, color: "var(--white)" }}>{label || bom.productName}</td>
                              <td style={{ color: maxProducible[bom.id] === 0 ? "#ef4444" : "var(--gray)" }}>{maxProducible[bom.id]} units</td>
                              <td>
                                <NumberInput className="tier-input"
                                  value={stockMap[bom.id] ?? String(maxProducible[bom.id] ?? 0)}
                                  onChange={(e) => {
                                    if (parseInt(e.target.value) > maxProducible[bom.id]) return;
                                    setStockMap((p) => ({ ...p, [bom.id]: e.target.value }));
                                  }}
                                  placeholder="0" min={0} max={maxProducible[bom.id]} />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* Media */}
              <p style={secTitle}>Product Media</p>
              <div className="images-row">
                <div className="images-col">
                  <h2 className="form-section-title">Thumbnail</h2>
                  {thumbnail ? (
                    <div className="thumbnail-preview-wrap">
                      <div className="thumbnail-preview">
                        <img src={thumbnail.preview} alt="Thumbnail" />
                        <button type="button" className="image-remove-btn" onClick={() => setThumbnail(null)}>×</button>
                      </div>
                    </div>
                  ) : (
                    <div className={`image-upload-area${dragOverThumb ? " drag-over" : ""}`}
                      onDrop={(e) => { e.preventDefault(); setDragOverThumb(false); if (e.dataTransfer.files?.length) handleThumb(e.dataTransfer.files); }}
                      onDragOver={(e) => { e.preventDefault(); setDragOverThumb(true); }}
                      onDragLeave={() => setDragOverThumb(false)}
                      onClick={() => document.getElementById("addThumbInput").click()}>
                      <div className="image-upload-text"><strong>Click to upload thumbnail</strong> or drag and drop</div>
                      <div className="image-upload-hint">PNG, JPG — 200×200 to 800×800px</div>
                      <input id="addThumbInput" type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => { if (e.target.files?.length) handleThumb(e.target.files); }} />
                    </div>
                  )}
                </div>
                <div className="images-col">
                  <h2 className="form-section-title">Product Gallery</h2>
                  <div className={`image-upload-area${dragOver ? " drag-over" : ""}`}
                    onDrop={(e) => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files?.length) handleGallery(e.dataTransfer.files); }}
                    onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                    onDragLeave={() => setDragOver(false)}
                    onClick={() => document.getElementById("addGalleryInput").click()}>
                    <div className="image-upload-text"><strong>Click to upload</strong> or drag and drop</div>
                    <div className="image-upload-hint">PNG, JPG, GIF</div>
                    <input id="addGalleryInput" type="file" accept="image/*" multiple style={{ display: "none" }} onChange={(e) => { if (e.target.files?.length) handleGallery(e.target.files); }} />
                  </div>
                  {images.length > 0 && (
                    <div className="image-preview-grid">
                      {images.map((img) => (
                        <div key={img.id} className="image-preview-item">
                          <img src={img.preview} alt="" />
                          <button type="button" className="image-remove-btn" onClick={() => setImages(images.filter((i) => i.id !== img.id))}>×</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Publish toggle */}
              <div style={{ marginTop: "1.5rem", padding: "1rem", background: "var(--dark3)", border: "1px solid var(--border)", borderRadius: "10px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontWeight: 700, color: "var(--white)", fontSize: "0.875rem" }}>Publish immediately</div>
                  <div style={{ fontSize: "0.72rem", color: "var(--gray)", marginTop: "0.15rem" }}>
                    {isPublished ? "Product will be visible to customers on save." : "Product will be saved as a draft."}
                  </div>
                </div>
                <button type="button" onClick={() => setIsPublished((p) => !p)}
                  style={{ position: "relative", display: "inline-flex", alignItems: "center", width: "44px", height: "24px", borderRadius: "12px", border: "none", background: isPublished ? "#D4A843" : "var(--border)", cursor: "pointer", flexShrink: 0, padding: 0 }}>
                  <span style={{ position: "absolute", left: isPublished ? "22px" : "2px", width: "20px", height: "20px", borderRadius: "50%", background: "#fff", transition: "left 0.2s", boxShadow: "0 1px 4px rgba(0,0,0,0.3)" }} />
                </button>
              </div>
            </div>
          )}

          {/* Step error */}
          {stepError && (
            <div style={{ marginTop: "1rem", padding: "0.625rem 1rem", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: "8px", fontSize: "0.82rem", color: "#f87171" }}>
              {stepError}
            </div>
          )}
        </div>

        {/* Footer navigation */}
        <div style={{ padding: "1rem 1.5rem", borderTop: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center", background: "var(--dark)", position: "sticky", bottom: 0, zIndex: 10 }}>
          <button type="button" onClick={step === 1 ? onClose : goBack}
            style={{ background: "none", border: "1px solid var(--border)", borderRadius: "8px", padding: "0.5rem 1.25rem", color: "var(--gray)", fontSize: "0.82rem", cursor: "pointer" }}>
            {step === 1 ? "Cancel" : "Back"}
          </button>
          {step < 4 ? (
            <button type="button" onClick={goNext}
              style={{ background: "linear-gradient(135deg,#FFDF9F 0%,#D4A843 100%)", border: "none", borderRadius: "8px", padding: "0.5rem 1.75rem", color: "#000", fontSize: "0.82rem", fontWeight: 700, cursor: "pointer" }}>
              Continue
            </button>
          ) : (
            <button type="button" onClick={handleSave} disabled={uploadingMedia}
              style={{ background: "linear-gradient(135deg,#FFDF9F 0%,#D4A843 100%)", border: "none", borderRadius: "8px", padding: "0.5rem 1.75rem", color: "#000", fontSize: "0.82rem", fontWeight: 700, cursor: uploadingMedia ? "not-allowed" : "pointer", opacity: uploadingMedia ? 0.7 : 1 }}>
              {uploadingMedia ? "Saving…" : isPublished ? "Publish Product" : "Save as Draft"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Old modal (unused — kept for reference) ───────────────────────────────────
function AddProductModal_OLD_UNUSED({ boms, inventoryList, products, onClose, onSave, onPriceError, token }) {
  const productGroups = useMemo(() => {
    const groups = {};
    (boms || []).forEach((b) => {
      const key = b.productGroupName || b.productName || '';
      if (!groups[key]) groups[key] = [];
      groups[key].push(b);
    });
    return groups;
  }, [boms]);

  const groupNames = useMemo(() => Object.keys(productGroups).sort(), [productGroups]);

  const [selectedGroup, setSelectedGroup] = useState('');
  const [groupOpen, setGroupOpen]         = useState(false);
  const [groupSearch, setGroupSearch]     = useState('');
  const [category, setCategory]           = useState('');
  const [description, setDescription]     = useState('');
  const [priceType, setPriceType]         = useState('fixed');
  const [variantPrices, setVariantPrices] = useState({});
  const [tiers, setTiers]                 = useState([{ id: 1, minQty: 1, maxQty: 20, prices: {} }]);
  const [stockMap, setStockMap]           = useState({});
  const [thumbnail, setThumbnail]         = useState(null);
  const [images, setImages]               = useState([]);
  const [dragOver, setDragOver]           = useState(false);
  const [dragOverThumb, setDragOverThumb] = useState(false);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const groupRef = useRef(null);

  const variants    = useMemo(() => (selectedGroup ? productGroups[selectedGroup] || [] : []), [selectedGroup, productGroups]);
  const isStandalone = variants.length === 1;
  const hasVariants  = variants.length > 1;

  const existingCategories = useMemo(
    () => [...new Set(products.map((p) => p.category).filter(Boolean))].sort(),
    [products],
  );

  useEffect(() => {
    const handler = (e) => {
      if (groupRef.current && !groupRef.current.contains(e.target)) setGroupOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const maxProducible = useMemo(() => {
    const result = {};
    variants.forEach((bom) => {
      let min = Infinity;
      (bom.components || []).forEach((comp) => {
        const inv = inventoryList.find((i) => String(i.id) === String(comp.inventoryId));
        const canMake = Math.floor(getAvailableQty(inv) / (comp.qty || 1));
        if (canMake < min) min = canMake;
      });
      result[bom.id] = min === Infinity ? 0 : min;
    });
    return result;
  }, [variants, inventoryList]);

  const bottleneckMap = useMemo(() => {
    const result = {};
    variants.forEach((bom) => {
      let minRatio = Infinity, minName = null;
      (bom.components || []).forEach((comp) => {
        const inv = inventoryList.find((i) => String(i.id) === String(comp.inventoryId));
        const ratio = Math.floor((inv?.stockQty || 0) / (comp.qty || 1));
        if (ratio < minRatio) { minRatio = ratio; minName = comp.materialName; }
      });
      result[bom.id] = minName;
    });
    return result;
  }, [variants, inventoryList]);

  const bomCostMap = useMemo(() => {
    const result = {};
    variants.forEach((b) => { result[b.id] = b.totalCost || 0; });
    return result;
  }, [variants]);

  useEffect(() => {
    if (!selectedGroup) return;
    const vList = productGroups[selectedGroup] || [];
    const initPrices = {}, initStock = {}, initTierPrices = {};
    vList.forEach((b) => {
      initPrices[b.id] = '';
      initStock[b.id] = '';
      initTierPrices[b.id] = '';
    });
    setVariantPrices(initPrices);
    setStockMap(initStock);
    setTiers([{ id: 1, minQty: 1, maxQty: 20, prices: vList.length === 1 ? { __base__: '' } : { ...initTierPrices } }]);
    setCategory('');
  }, [selectedGroup]); // eslint-disable-line react-hooks/exhaustive-deps

  const priceWarnings = useMemo(() => {
    if (priceType !== 'fixed') return {};
    const w = {};
    Object.entries(variantPrices).forEach(([id, price]) => {
      const cost = bomCostMap[id] || 0;
      const p = parseFloat(price);
      if (price !== '' && !isNaN(p) && cost > 0)
        w[id] = p < cost ? `Below cost — lose ₱${(cost - p).toFixed(2)}/unit` : null;
    });
    return w;
  }, [variantPrices, bomCostMap, priceType]);

  const tierWarnings = useMemo(() => {
    if (priceType !== 'tiered') return {};
    const w = {};
    tiers.forEach((tier) => {
      Object.entries(tier.prices || {}).forEach(([key, price]) => {
        const cost = bomCostMap[key] || 0;
        const p = parseFloat(price);
        if (price !== '' && !isNaN(p) && cost > 0 && p < cost)
          w[`${tier.id}_${key}`] = true;
      });
    });
    return w;
  }, [tiers, bomCostMap, priceType]);

  const hasAnyTierWarning = Object.keys(tierWarnings).length > 0;

  const addTier = () => {
    const last = tiers[tiers.length - 1];
    const emptyPrices = isStandalone
      ? { __base__: '' }
      : variants.reduce((acc, b) => ({ ...acc, [b.id]: '' }), {});
    setTiers((prev) => [...prev, { id: Date.now(), minQty: last ? (parseInt(last.maxQty) || 0) + 1 : 1, maxQty: '', prices: emptyPrices }]);
  };
  const removeTier = (id) => setTiers(tiers.filter((t) => t.id !== id));
  const updateTierRange = (id, field, val) => setTiers(tiers.map((t) => t.id === id ? { ...t, [field]: val } : t));
  const updateTierPrice = (tierId, key, val) => setTiers(tiers.map((t) => t.id === tierId ? { ...t, prices: { ...t.prices, [key]: val } } : t));

  const createImageObj = (file) => ({ file, preview: URL.createObjectURL(file), id: Date.now() + Math.random() });
  const handleThumbnailUpload = (files) => { const f = files[0]; if (f) setThumbnail(createImageObj(f)); };
  const handleImageUpload = (files) => setImages((prev) => [...prev, ...Array.from(files).map(createImageObj)]);
  const removeImage = (id) => setImages(images.filter((img) => img.id !== id));

  const handleSave = async () => {
    if (!selectedGroup) { onPriceError('Please select a product.'); return; }
    if (priceType === 'fixed') {
      if (isStandalone) {
        const p = variantPrices[variants[0]?.id] || '';
        if (!p || parseFloat(p) <= 0) { onPriceError('Please enter a price.'); return; }
      } else {
        if (!variants.every((b) => variantPrices[b.id] && parseFloat(variantPrices[b.id]) > 0)) {
          onPriceError('Please enter prices for all variants.'); return;
        }
      }
    } else if (priceType === 'tiered') {
      if (!tiers.every((t) => Object.values(t.prices).every((p) => p !== '' && parseFloat(p) > 0))) {
        onPriceError('Please fill in all tier prices.'); return;
      }
    }

    setUploadingMedia(true);
    try {
      let thumbFinal = null;
      if (thumbnail?.file) {
        const up = await uploadImage(thumbnail.file, 'pmp-products', token);
        thumbFinal = up.url || up?.data?.url;
      }
      const galleryUrls = [];
      for (const img of images) {
        if (img.file) {
          const up = await uploadImage(img.file, 'pmp-products', token);
          galleryUrls.push(up.url || up?.data?.url);
        }
      }

      const syntheticVarGroups = hasVariants
        ? [{ id: 'bom-type', name: 'Type', options: variants.map((b) => ({ id: b.id, value: b.variantName })) }]
        : [];
      const syntheticCombos = hasVariants
        ? variants.map((b) => ({ id: b.id, combo: { 'bom-type': b.variantName }, label: b.variantName }))
        : [];

      const stockVal    = isStandalone ? (parseInt(stockMap[variants[0]?.id]) || 0) : null;
      const variantStock = hasVariants ? variants.reduce((acc, b) => ({ ...acc, [b.id]: parseInt(stockMap[b.id]) || 0 }), {}) : undefined;

      onSave({
        productName:      selectedGroup,
        subCategoryName:  selectedGroup,
        subCategoryCode:  selectedGroup.split(' ').filter((w) => w).map((w) => w[0]).join('').toUpperCase().slice(0, 8),
        category,
        description,
        priceType,
        ...(priceType === 'fixed'
          ? isStandalone
            ? { price: variantPrices[variants[0]?.id] }
            : { variantPrices }
          : priceType === 'tiered'
          ? { tiers }
          : {}),
        variantGroups:  syntheticVarGroups,
        combinations:   syntheticCombos,
        stock:          stockVal,
        variantStock,
        trackInventory: true,
        bomGroupName:   selectedGroup,
        thumbnail:      thumbFinal,
        images:         galleryUrls,
        isPublished:    false,
        isArchived:     false,
      });
    } catch (err) {
      onPriceError(err.message || 'Image upload failed.');
    } finally {
      setUploadingMedia(false);
    }
  };

  const filteredGroupNames = groupNames.filter((n) => !groupSearch || n.toLowerCase().includes(groupSearch.toLowerCase()));

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: 'var(--dark)', border: '1px solid var(--border)', borderRadius: '16px', width: '100%', maxWidth: '860px', maxHeight: '92vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', scrollbarWidth: 'thin', scrollbarColor: 'var(--gold) var(--dark2)' }}
      >
        {/* Header */}
        <div style={{ position: 'sticky', top: 0, zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1.25rem 1.5rem', background: 'var(--dark)', borderBottom: '1px solid var(--border)' }}>
          <div>
            <h2 className="modal-title">Add New Product</h2>
            <p style={{ color: 'var(--gray)', fontSize: '0.8rem', margin: '0.25rem 0 0' }}>Select a product from your catalog</p>
          </div>
          <button onClick={onClose} style={{ background: 'var(--dark2)', border: '1px solid var(--border)', borderRadius: '8px', width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--gray)', cursor: 'pointer' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>

        <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

          {/* ── SELECT PRODUCT ── */}
          <div className="form-section">
            <h2 className="form-section-title">Select Product</h2>

            <div style={{ position: 'relative' }} ref={groupRef}>
              <label className="form-label">Product <span className="required">*</span></label>
              <div className="combobox-field">
                <input
                  type="text"
                  className="form-input"
                  value={groupSearch || selectedGroup}
                  onChange={(e) => { setGroupSearch(e.target.value); setGroupOpen(true); }}
                  onFocus={() => setGroupOpen(true)}
                  placeholder="Search product…"
                />
                <button type="button" className="combobox-toggle" onClick={() => setGroupOpen((o) => !o)}>{groupOpen ? '▲' : '▼'}</button>
              </div>
              {groupOpen && filteredGroupNames.length > 0 && (
                <div className="combobox-menu">
                  {filteredGroupNames.map((name) => (
                    <button key={name} type="button"
                      className={`combobox-item${name === selectedGroup ? ' active' : ''}`}
                      onClick={() => { setSelectedGroup(name); setGroupSearch(''); setGroupOpen(false); }}
                    >
                      <span style={{ fontWeight: 600 }}>{name}</span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--gray)', marginLeft: '0.5rem' }}>
                        {productGroups[name].length === 1 ? 'No variants' : `${productGroups[name].length} variants`}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Components card */}
            {variants.length > 0 && (
              <div style={{ marginTop: '1rem', border: '1px solid var(--border)', borderRadius: '10px', overflow: 'hidden' }}>
                <div style={{ padding: '0.75rem 1rem', background: 'rgba(212,168,67,0.06)', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 700, color: 'var(--white)', fontSize: '0.95rem' }}>{selectedGroup}</span>
                  <span style={{ fontSize: '0.7rem', color: 'var(--gray)' }}>
                    {isStandalone ? 'No variants' : `${variants.length} variants`}
                  </span>
                </div>

                {/* Table header */}
                <div style={{ display: 'grid', gridTemplateColumns: hasVariants ? '1.2fr 2fr 90px 90px 1fr' : '2fr 90px 90px 1fr', borderBottom: '1px solid var(--border)', background: 'var(--dark3)' }}>
                  {hasVariants && <div style={{ padding: '0.45rem 0.75rem', fontSize: '0.62rem', color: 'var(--gray)', textTransform: 'uppercase', fontWeight: 700 }}>Variant</div>}
                  <div style={{ padding: '0.45rem 0.75rem', fontSize: '0.62rem', color: 'var(--gray)', textTransform: 'uppercase', fontWeight: 700 }}>Components</div>
                  <div style={{ padding: '0.45rem 0.75rem', fontSize: '0.62rem', color: 'var(--gray)', textTransform: 'uppercase', fontWeight: 700 }}>BOM Cost</div>
                  <div style={{ padding: '0.45rem 0.75rem', fontSize: '0.62rem', color: 'var(--gray)', textTransform: 'uppercase', fontWeight: 700 }}>Max Stock</div>
                  <div style={{ padding: '0.45rem 0.75rem', fontSize: '0.62rem', color: 'var(--gray)', textTransform: 'uppercase', fontWeight: 700 }}>Bottleneck</div>
                </div>

                {variants.map((bom, i) => (
                  <div key={bom.id} style={{ display: 'grid', gridTemplateColumns: hasVariants ? '1.2fr 2fr 90px 90px 1fr' : '2fr 90px 90px 1fr', borderBottom: i < variants.length - 1 ? '1px solid var(--border)' : 'none', alignItems: 'start' }}>
                    {hasVariants && (
                      <div style={{ padding: '0.7rem 0.75rem', fontWeight: 600, color: 'var(--white)', fontSize: '0.85rem' }}>{bom.variantName}</div>
                    )}
                    <div style={{ padding: '0.7rem 0.75rem' }}>
                      {(bom.components || []).map((comp, ci) => (
                        <div key={ci} style={{ fontSize: '0.73rem', color: 'var(--gray)', marginBottom: '0.1rem' }}>
                          {comp.materialName} × {comp.qty} {comp.unit}
                        </div>
                      ))}
                    </div>
                    <div style={{ padding: '0.7rem 0.75rem' }}>
                      <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#D4A843' }}>₱{(bom.totalCost || 0).toFixed(2)}</span>
                    </div>
                    <div style={{ padding: '0.7rem 0.75rem' }}>
                      <span style={{ fontSize: '0.85rem', fontWeight: 700, color: maxProducible[bom.id] === 0 ? '#ef4444' : 'var(--white)' }}>
                        {maxProducible[bom.id]} units
                      </span>
                    </div>
                    <div style={{ padding: '0.7rem 0.75rem' }}>
                      {bottleneckMap[bom.id] && maxProducible[bom.id] < (maxProducible[bom.id] + 1) && (
                        <span style={{ fontSize: '0.68rem', color: '#f59e0b' }}>⚡ {bottleneckMap[bom.id]}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Category + Description */}
            {variants.length > 0 && (
              <>
                <div style={{ marginTop: '1rem' }}>
                  <Combobox
                    label="Category"
                    value={category}
                    onChange={setCategory}
                    options={existingCategories}
                    placeholder="e.g. Mugs, T-Shirts…"
                  />
                </div>
                <div style={{ marginTop: '1rem' }}>
                  <label className="form-label">Description</label>
                  <textarea className="form-textarea" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Materials, printing details, sizes, notes…" />
                </div>
              </>
            )}
          </div>

          {/* ── PRICING ── */}
          {variants.length > 0 && (
            <div className="form-section">
              <h2 className="form-section-title">Pricing</h2>
              <div className="price-type-row">
                {[{ val: 'fixed', label: 'Fixed Price' }, { val: 'tiered', label: 'Tier Price' }, { val: 'inquiry', label: 'For Inquiry' }].map(({ val, label }) => (
                  <button key={val} type="button" className={`price-type-btn${priceType === val ? ' selected' : ''}`} onClick={() => setPriceType(val)}>{label}</button>
                ))}
              </div>

              {priceType === 'fixed' && (
                isStandalone ? (
                  <div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--gray)', marginBottom: '0.5rem' }}>
                      BOM Cost: <strong style={{ color: '#D4A843' }}>₱{(bomCostMap[variants[0]?.id] || 0).toFixed(2)}/unit</strong> — sell above this to be profitable
                    </div>
                    <div className="tier-price-cell">
                      <span className="peso">₱</span>
                      <NumberInput className="tier-input" value={variantPrices[variants[0]?.id] || ''} onChange={(e) => setVariantPrices((p) => ({ ...p, [variants[0].id]: sanitizeNumber(e.target.value) }))} placeholder="0" min={0} step="0.01" />
                    </div>
                    {priceWarnings[variants[0]?.id] && (
                      <div style={{ marginTop: '0.4rem', fontSize: '0.78rem', color: '#f87171' }}>⚠ {priceWarnings[variants[0].id]}</div>
                    )}
                  </div>
                ) : (
                  <div className="tier-table-wrap">
                    <table className="tier-table">
                      <thead>
                        <tr>
                          <th>Variant</th>
                          <th>BOM Cost</th>
                          <th>Your Price (₱)</th>
                          <th>Margin</th>
                        </tr>
                      </thead>
                      <tbody>
                        {variants.map((bom) => {
                          const cost  = bomCostMap[bom.id] || 0;
                          const price = parseFloat(variantPrices[bom.id]);
                          const hasP  = variantPrices[bom.id] !== '' && !isNaN(price);
                          const below = hasP && price < cost;
                          const margin = hasP ? price - cost : null;
                          return (
                            <tr key={bom.id}>
                              <td style={{ fontWeight: 600, color: 'var(--white)', fontSize: '0.85rem' }}>{bom.variantName}</td>
                              <td style={{ color: '#D4A843', fontWeight: 700 }}>₱{cost.toFixed(2)}</td>
                              <td>
                                <div className="tier-price-cell">
                                  <span className="peso">₱</span>
                                  <NumberInput className="tier-input" value={variantPrices[bom.id] || ''} onChange={(e) => setVariantPrices((p) => ({ ...p, [bom.id]: sanitizeNumber(e.target.value) }))} placeholder="0" min={0} step="0.01" />
                                </div>
                              </td>
                              <td>
                                {margin !== null && (
                                  <span style={{ fontSize: '0.78rem', fontWeight: 600, color: below ? '#f87171' : '#22c55e' }}>
                                    {below ? `⚠ -₱${Math.abs(margin).toFixed(2)}` : `✓ +₱${margin.toFixed(2)}`}
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )
              )}

              {priceType === 'tiered' && (
                <>
                  {hasAnyTierWarning && (
                    <div style={{ marginBottom: '0.75rem', padding: '0.5rem 0.75rem', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '6px', fontSize: '0.78rem', color: '#f87171' }}>
                      ⚠ Cells highlighted in red are below BOM cost — selling at a loss.
                    </div>
                  )}
                  <div className="tier-table-wrap">
                    <table className="tier-table smart-tier-table">
                      <thead>
                        <tr>
                          <th>Tier</th>
                          <th>Min Qty</th>
                          <th>Max Qty</th>
                          {isStandalone ? (
                            <th>
                              Price (₱)
                              <div style={{ fontSize: '0.6rem', color: '#D4A843', fontWeight: 600, marginTop: '0.1rem' }}>cost ₱{(bomCostMap[variants[0]?.id] || 0).toFixed(2)}</div>
                            </th>
                          ) : (
                            variants.map((bom) => (
                              <th key={bom.id} className="tier-variant-header">
                                {bom.variantName}
                                <div style={{ fontSize: '0.6rem', color: '#D4A843', fontWeight: 600, marginTop: '0.1rem' }}>cost ₱{(bomCostMap[bom.id] || 0).toFixed(2)}</div>
                              </th>
                            ))
                          )}
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {tiers.map((tier, idx) => (
                          <tr key={tier.id}>
                            <td><span className="tier-badge">Tier {idx + 1}</span></td>
                            <td><NumberInput className="tier-input" value={tier.minQty ?? ''} placeholder="1" min={0} onChange={(e) => { const v = e.target.value; if (v === '' || parseInt(v) >= 0) updateTierRange(tier.id, 'minQty', v); }} /></td>
                            <td><NumberInput className="tier-input" value={tier.maxQty ?? ''} placeholder="∞" min={0} onChange={(e) => { const v = e.target.value; if (v === '' || parseInt(v) >= 0) updateTierRange(tier.id, 'maxQty', v); }} /></td>
                            {isStandalone ? (
                              <td style={{ background: tierWarnings[`${tier.id}___base__`] ? 'rgba(239,68,68,0.07)' : undefined }}>
                                <div className="tier-price-cell">
                                  <span className="peso" style={{ color: tierWarnings[`${tier.id}___base__`] ? '#f87171' : undefined }}>₱</span>
                                  <NumberInput className="tier-input" value={tier.prices['__base__'] || ''} onChange={(e) => updateTierPrice(tier.id, '__base__', sanitizeNumber(e.target.value))} placeholder="0" min={0} step="0.01" />
                                </div>
                                {tierWarnings[`${tier.id}___base__`] && <div style={{ fontSize: '0.6rem', color: '#f87171', marginTop: '0.1rem' }}>⚠ below cost</div>}
                              </td>
                            ) : (
                              variants.map((bom) => {
                                const wkey = `${tier.id}_${bom.id}`;
                                const below = tierWarnings[wkey];
                                return (
                                  <td key={bom.id} style={{ background: below ? 'rgba(239,68,68,0.07)' : undefined }}>
                                    <div className="tier-price-cell">
                                      <span className="peso" style={{ color: below ? '#f87171' : undefined }}>₱</span>
                                      <NumberInput className="tier-input" value={tier.prices[bom.id] || ''} onChange={(e) => updateTierPrice(tier.id, bom.id, sanitizeNumber(e.target.value))} placeholder="0" min={0} step="0.01" />
                                    </div>
                                    {below && <div style={{ fontSize: '0.6rem', color: '#f87171', marginTop: '0.1rem' }}>⚠ below cost</div>}
                                  </td>
                                );
                              })
                            )}
                            <td>{tiers.length > 1 && <button type="button" className="btn-remove-tier" onClick={() => removeTier(tier.id)}>Remove</button>}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <button type="button" className="add-tier-btn" onClick={addTier}>Add Price Tier</button>
                </>
              )}

              {priceType === 'inquiry' && (
                <div style={{ padding: '1rem', background: 'rgba(212,168,67,0.08)', border: '1px solid rgba(212,168,67,0.3)', borderRadius: '8px', color: 'var(--gold)', fontSize: '0.9rem' }}>
                  This product will be listed as "For Inquiry" — customers will contact you for pricing.
                </div>
              )}
            </div>
          )}

          {/* ── AVAILABILITY ── */}
          {variants.length > 0 && priceType !== 'inquiry' && (
            <div className="form-section">
              <h2 className="form-section-title">Storefront Availability</h2>
              {isStandalone ? (
                <div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--gray)', marginBottom: '0.75rem' }}>
                    Max producible from current stock: <strong style={{ color: 'var(--white)' }}>{maxProducible[variants[0]?.id]} units</strong>
                  </div>
                  <label className="form-label">Storefront Stock <span className="required">*</span></label>
                  <NumberInput
                    className="form-input"
                    value={stockMap[variants[0]?.id] !== undefined && stockMap[variants[0]?.id] !== '' ? stockMap[variants[0].id] : String(maxProducible[variants[0]?.id] ?? 0)}
                    onChange={(e) => {
                      const val = e.target.value;
                      const max = maxProducible[variants[0]?.id];
                      if (parseInt(val) > max) return;
                      setStockMap((p) => ({ ...p, [variants[0].id]: val }));
                    }}
                    placeholder="0" min={0} max={maxProducible[variants[0]?.id]}
                  />
                </div>
              ) : (
                <div className="tier-table-wrap">
                  <table className="tier-table">
                    <thead>
                      <tr><th>Variant</th><th>Max Producible</th><th>Storefront Stock</th></tr>
                    </thead>
                    <tbody>
                      {variants.map((bom) => (
                        <tr key={bom.id}>
                          <td style={{ fontWeight: 600, color: 'var(--white)' }}>{bom.variantName}</td>
                          <td style={{ color: maxProducible[bom.id] === 0 ? '#ef4444' : 'var(--gray)' }}>{maxProducible[bom.id]} units</td>
                          <td>
                            <NumberInput
                              className="tier-input"
                              value={stockMap[bom.id] !== undefined && stockMap[bom.id] !== '' ? stockMap[bom.id] : String(maxProducible[bom.id] ?? 0)}
                              onChange={(e) => {
                                const val = e.target.value;
                                if (parseInt(val) > maxProducible[bom.id]) return;
                                setStockMap((p) => ({ ...p, [bom.id]: val }));
                              }}
                              placeholder="0" min={0} max={maxProducible[bom.id]}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ── IMAGES ── */}
          {variants.length > 0 && (
            <div className="form-section">
              <div className="images-row">
                <div className="images-col">
                  <h2 className="form-section-title">Thumbnail</h2>
                  {thumbnail ? (
                    <div className="thumbnail-preview-wrap">
                      <div className="thumbnail-preview">
                        <img src={thumbnail.preview} alt="Thumbnail" />
                        <button type="button" className="image-remove-btn" onClick={() => setThumbnail(null)}>×</button>
                      </div>
                    </div>
                  ) : (
                    <div className={`image-upload-area${dragOverThumb ? ' drag-over' : ''}`}
                      onDrop={(e) => { e.preventDefault(); setDragOverThumb(false); if (e.dataTransfer.files?.length) handleThumbnailUpload(e.dataTransfer.files); }}
                      onDragOver={(e) => { e.preventDefault(); setDragOverThumb(true); }}
                      onDragLeave={() => setDragOverThumb(false)}
                      onClick={() => document.getElementById('addThumbInput').click()}
                    >
                      <div className="image-upload-text"><strong>Click to upload thumbnail</strong> or drag and drop</div>
                      <div className="image-upload-hint">PNG, JPG — 200×200 to 800×800px</div>
                      <input id="addThumbInput" type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => { if (e.target.files?.length) handleThumbnailUpload(e.target.files); }} />
                    </div>
                  )}
                </div>
                <div className="images-col">
                  <h2 className="form-section-title">Product Gallery</h2>
                  <div className={`image-upload-area${dragOver ? ' drag-over' : ''}`}
                    onDrop={(e) => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files?.length) handleImageUpload(e.dataTransfer.files); }}
                    onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                    onDragLeave={() => setDragOver(false)}
                    onClick={() => document.getElementById('addGalleryInput').click()}
                  >
                    <div className="image-upload-text"><strong>Click to upload</strong> or drag and drop</div>
                    <div className="image-upload-hint">PNG, JPG, GIF</div>
                    <input id="addGalleryInput" type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={(e) => { if (e.target.files?.length) handleImageUpload(e.target.files); }} />
                  </div>
                  {images.length > 0 && (
                    <div className="image-preview-grid">
                      {images.map((img) => (
                        <div key={img.id} className="image-preview-item">
                          <img src={img.preview} alt="Preview" />
                          <button type="button" className="image-remove-btn" onClick={() => removeImage(img.id)}>×</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Actions */}
          {variants.length > 0 && (
            <div className="form-actions">
              <button type="button" className="btn-cancel" onClick={onClose} disabled={uploadingMedia}>Cancel</button>
              <button type="button" className="btn-submit" onClick={handleSave} disabled={uploadingMedia}>
                {uploadingMedia ? 'Uploading…' : 'Continue'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main ProductListPage ───────────────────────────────────────────────────────
export default function ProductListPage() {
  const { token } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [products, setProducts] = useState([]);
  const [inventoryList, setInventoryList] = useState([]);
  const [boms, setBoms] = useState([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [prodRowsPerPage, setProdRowsPerPage] = useState(20);
  const [prodPage, setProdPage] = useState(1);
  const [editingProduct, setEditingProduct] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showSaveSuccess, setShowSaveSuccess] = useState(false);
  const [showEditConfirmModal, setShowEditConfirmModal] = useState(false);
  const [pendingEditData, setPendingEditData] = useState(null);
  const [expandedRows, setExpandedRows] = useState(new Set());
  const [showPriceErrorModal, setShowPriceErrorModal] = useState(false);
  const [priceErrorMessage, setPriceErrorMessage] = useState("");
  const [priceErrorTitle, setPriceErrorTitle] = useState("Price Required");

  // ── Bulk select state ──
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [showBulkBar, setShowBulkBar] = useState(false);
  const [showBulkSelectDropdown, setShowBulkSelectDropdown] = useState(false);
  const bulkSelectRef = useRef(null);
  const [editModalKey, setEditModalKey] = useState(0); // Force edit modal refresh
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Show success toast when returning from /products/add
  useEffect(() => {
    if (searchParams.get("saved") === "1") {
      setShowSaveSuccess(true);
      setTimeout(() => setShowSaveSuccess(false), 3000);
      router.replace("/dashboard/business/products");
    }
  }, [searchParams, router]);

  // Reset bulk select when status filter changes
  useEffect(() => {
    setSelectedIds(new Set());
    setShowBulkBar(false);
    setShowBulkSelectDropdown(false);
  }, [statusFilter]);

  // Close bulk select dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (bulkSelectRef.current && !bulkSelectRef.current.contains(e.target)) {
        setShowBulkSelectDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // ── Modal states ──
  const [deleteModal, setDeleteModal] = useState(null); // product to delete
  const [blockModal, setBlockModal] = useState(null);   // { product, count } — has active orders
  const [bulkModal, setBulkModal] = useState(null); // { action: 'publish'|'unpublish'|'delete' }
  const [restoreModal, setRestoreModal] = useState(null); // product to restore

  // ── Fetch products and inventory from API ────────────────────────────────────
  useEffect(() => {
    const loadData = async () => {
      if (!token) {
        console.error("No auth token. Cannot load products.");
        setProducts([]);
        setInventoryList([]);
        setIsLoaded(true);
        return;
      }

      try {
        // Fetch products from MongoDB via API
        const productsResponse = await fetchProducts(token);
        const productsData = Array.isArray(productsResponse)
          ? productsResponse
          : [];

        // Transform MongoDB documents to match frontend format
        // MongoDB uses _id, frontend uses id
        const transformedProducts = productsData.map((p) => ({
          ...p,
          id: p.id ?? p._id ?? "",
        }));

        setProducts(transformedProducts);

        // Fetch inventory + BOMs independently
        const [invResult, bomResult] = await Promise.allSettled([
          fetchInventory(token),
          fetchBoms(token),
        ]);
        if (invResult.status === 'fulfilled') {
          setInventoryList(
            (Array.isArray(invResult.value) ? invResult.value : []).map((inv) => ({
              ...inv,
              id: inv.id ?? inv._id ?? "",
            })),
          );
        } else {
          setInventoryList([]);
        }
        if (bomResult.status === 'fulfilled') {
          setBoms(Array.isArray(bomResult.value) ? bomResult.value : []);
        }

        setIsLoaded(true);
      } catch (error) {
        setProducts([]);
        setInventoryList([]);
        setIsLoaded(true);
        setPriceErrorTitle("Load Failed");
        setPriceErrorMessage(error.message || "Failed to load products. Please refresh.");
        setShowPriceErrorModal(true);
      }
    };

    loadData();
  }, [token]);

  const getInventoryItem = (inventoryId) =>
    inventoryList.find((inv) => inv.id === inventoryId);

  const filteredProducts = products.filter((product) => {
    const matchesSearch =
      product.productName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      product.subCategoryName
        ?.toLowerCase()
        .includes(searchQuery.toLowerCase()) ||
      product.category?.toLowerCase().includes(searchQuery.toLowerCase());

    // Check if product's inventory is archived
    const inv = getInventoryItem(product.inventoryId);
    const isInventoryArchived = inv && inv.isActive === false;

    // Products with archived inventory ALWAYS go to archived filter
    if (isInventoryArchived) {
      return statusFilter === "archived";
    }

    let matchesStatus = true;
    if (statusFilter === "")
      matchesStatus = !product.isArchived; // Total Products - exclude archived
    else if (statusFilter === "published")
      matchesStatus = product.isPublished === true && !product.isArchived;
    else if (statusFilter === "unpublished")
      matchesStatus = product.isPublished !== true && !product.isArchived;
    else if (statusFilter === "archived")
      matchesStatus = product.isArchived === true;
    return matchesSearch && matchesStatus;
  });

  const getPriceRange = (product) => {
    if (!product.priceType) return "₱0";
    let minPrice = Infinity,
      maxPrice = 0;
    if (product.priceType === "fixed") {
      if (
        product.variantPrices &&
        Object.keys(product.variantPrices).length > 0
      ) {
        const prices = Object.values(product.variantPrices).filter(
          (p) => p && p > 0,
        );
        if (prices.length > 0) {
          minPrice = Math.min(...prices);
          maxPrice = Math.max(...prices);
        }
      } else if (product.price) {
        minPrice = parseFloat(product.price) || 0;
        maxPrice = minPrice;
      }
    } else if (product.priceType === "tiered") {
      (product.priceTiers || product.tiers || []).forEach((tier) => {
        Object.values(tier.prices || {}).forEach((price) => {
          const p = parseFloat(price);
          if (p > 0) {
            minPrice = Math.min(minPrice, p);
            maxPrice = Math.max(maxPrice, p);
          }
        });
      });
    } else if (product.priceType === "inquiry") {
      return "For Inquiry";
    }
    if (minPrice === Infinity) minPrice = 0;
    if (minPrice === maxPrice) return `₱${Math.floor(minPrice)}`;
    return `₱${Math.floor(minPrice)} – ₱${Math.floor(maxPrice)}`;
  };

  const getStockStatus = (product) => {
    const inv = getInventoryItem(product.inventoryId);
    if (!inv) return { text: "No Link", class: "stock-no-link" };
    if (inv.isOnDemand)
      return { text: "Upon Order", class: "stock-upon-order" };

    const available = parseInt(product.stock) || 0;
    const total = inv.stockQty || 0;

    // Availability is capped to inventory
    if (available === 0) return { text: `0 / ${total}`, class: "stock-out" };
    if (available <= 10)
      return { text: `${available} / ${total}`, class: "stock-low" };
    return { text: `${available} / ${total}`, class: "stock-ok" };
  };

  // Derive Shopify-style inventory text from the BOMs linked to a product.
  const getProductInventoryDisplay = (product) => {
    if (product.isMadeToOrder) return { text: "Made to Order", color: "#D4A843" };

    const hasBom = product.bomId || product.bomGroupName;
    // Prefer saved storefront stock over BOM max producible (skip for BOM products — variantStock is a cap, not actual availability)
    if (!hasBom && product.variantStock && Object.keys(product.variantStock).length) {
      const total = Object.values(product.variantStock).reduce((s, v) => s + (Number(v) || 0), 0);
      const variantCount = Object.keys(product.variantStock).length;
      const allZero = Object.values(product.variantStock).every((v) => Number(v) === 0);
      return {
        text: allZero ? "Out of stock" : `${total} in stock (${variantCount} variant${variantCount !== 1 ? "s" : ""})`,
        color: allZero ? "#ef4444" : total <= 10 ? "#f59e0b" : "#22c55e",
      };
    }
    if (!hasBom && product.stock != null && product.trackInventory) {
      const s = Number(product.stock) || 0;
      return {
        text: s === 0 ? "Out of stock" : `${s} in stock`,
        color: s === 0 ? "#ef4444" : s <= 10 ? "#f59e0b" : "#22c55e",
      };
    }

    const byGroupName = () => {
      const pn = (product.bomGroupName || product.name || product.productName || "").trim().toLowerCase();
      return boms.filter((b) => {
        const bn = (b.productGroupName || "").trim().toLowerCase();
        return bn && pn && bn === pn;
      });
    };
    let productBoms = product.bomId
      ? boms.filter((b) => String(b.id ?? b._id) === String(product.bomId))
      : [];
    if (productBoms.length === 0) productBoms = byGroupName();

    if (productBoms.length === 0) return { text: "No BOM linked", color: "var(--gray)" };

    // Build material usage map to detect shared vs exclusive components
    const matMap = new Map();
    productBoms.forEach((b) => {
      const seen = new Set();
      (b.components || []).forEach((c) => {
        const matId = String(c.materialId ?? c.inventoryId);
        if (seen.has(matId)) return;
        seen.add(matId);
        if (!matMap.has(matId)) {
          const inv = inventoryList.find((i) => String(i.id ?? i._id) === matId);
          matMap.set(matId, { name: inv?.name, stock: inv?.stockQty || 0, qty: c.qty || 1, bomCount: 0 });
        }
        matMap.get(matId).bomCount += 1;
      });
    });

    // Shared material pool cap (materials used by more than one variant BOM)
    let sharedCap = Infinity;
    const sharedNames = new Set();
    matMap.forEach((v) => {
      if (v.bomCount > 1) {
        if (v.name) sharedNames.add(v.name);
        const cap = Math.floor(v.stock / v.qty);
        if (cap < sharedCap) sharedCap = cap;
      }
    });

    // Per-variant cap from exclusive (non-shared) materials
    const perVariantUnits = productBoms.map((b) => {
      let min = Infinity;
      (b.components || []).forEach((c) => {
        const matId = String(c.materialId ?? c.inventoryId);
        const entry = matMap.get(matId);
        if (entry && entry.bomCount === 1) {
          const can = Math.floor(entry.stock / (c.qty || 1));
          if (can < min) min = can;
        }
      });
      return min === Infinity ? (sharedCap === Infinity ? 0 : sharedCap) : min;
    });

    const sumExclusive = perVariantUnits.reduce((s, u) => s + u, 0);
    // If shared materials exist, the cap IS the total (can't sum variants — they compete for the same pool)
    const totalUnits = sharedCap === Infinity ? sumExclusive : sharedCap;
    const variantCount = productBoms.length;

    const extraNames = sharedNames.size > 0 ? sharedNames : (() => {
      const s = new Set();
      productBoms.forEach((b) => {
        (b.components || []).slice(1).forEach((c) => {
          const entry = matMap.get(String(c.materialId ?? c.inventoryId));
          if (entry?.name) s.add(entry.name);
        });
      });
      return s;
    })();
    const extraText = extraNames.size > 0 ? ` w/ ${[...extraNames].join(", ")}` : "";
    const variantsWithStock = perVariantUnits.filter((u) => u > 0).length;
    const variantText = variantCount > 1
      ? variantsWithStock === variantCount
        ? ` for ${variantCount} variants${extraText}`
        : ` for ${variantsWithStock}/${variantCount} variants${extraText}`
      : extraText;

    return {
      text: `${totalUnits} in stock${variantText}`,
      color: totalUnits > 0 ? "#22c55e" : "#ef4444",
    };
  };

  const getVariantSummary = (product) => {
    const groups = product.variantGroups || [];
    if (groups.length === 0) return null;
    const totalOptions = groups.reduce(
      (sum, g) => sum + (g.options?.length || 0),
      0,
    );
    const combos = product.combinations?.length || 0;
    if (groups.length === 1)
      return `${totalOptions} variant${totalOptions !== 1 ? "s" : ""}`;
    return `${combos} combo${combos !== 1 ? "s" : ""}`;
  };

  // ── Save product to MongoDB ──────────────────────────────────────────────────
  const saveProducts = (updated) => {
    setProducts(updated);
  };

  const togglePublish = async (productId) => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      const result = await togglePublishProduct(productId, token);
      // Update local state
      setProducts((prev) =>
        prev.map((p) =>
          p.id === productId
            ? {
                ...p,
                isPublished: result.isPublished,
                updatedAt: new Date().toISOString(),
              }
            : p,
        ),
      );
    } catch (error) {
      console.error("Failed to toggle publish status:", error);
      // Fallback to local update
      setProducts((prev) =>
        prev.map((p) =>
          p.id === productId
            ? {
                ...p,
                isPublished: !p.isPublished,
                updatedAt: new Date().toISOString(),
              }
            : p,
        ),
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleExpand = (productId) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      next.has(productId) ? next.delete(productId) : next.add(productId);
      return next;
    });
  };

  // ── Bulk selection ──
  const toggleSelect = (productId) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(productId) ? next.delete(productId) : next.add(productId);
      setShowBulkBar(next.size > 0);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (statusFilter === "") {
      // Only show dropdown in Total Products filter
      setShowBulkSelectDropdown(!showBulkSelectDropdown);
    } else {
      // In Published/Unpublished/Archived, just select all visible
      if (selectedIds.size === filteredProducts.length) {
        setSelectedIds(new Set());
        setShowBulkBar(false);
      } else {
        const all = new Set(filteredProducts.map((p) => p.id));
        setSelectedIds(all);
        setShowBulkBar(all.size > 0);
      }
    }
  };

  const selectAllPublished = () => {
    const publishedIds = new Set(
      filteredProducts.filter((p) => p.isPublished === true).map((p) => p.id),
    );
    setSelectedIds(publishedIds);
    setShowBulkBar(publishedIds.size > 0);
    setShowBulkSelectDropdown(false);
  };

  const selectAllUnpublished = () => {
    const unpublishedIds = new Set(
      filteredProducts
        .filter((p) => p.isPublished !== true && !p.isArchived)
        .map((p) => p.id),
    );
    setSelectedIds(unpublishedIds);
    setShowBulkBar(unpublishedIds.size > 0);
    setShowBulkSelectDropdown(false);
  };

  const unselectAll = () => {
    setSelectedIds(new Set());
    setShowBulkBar(false);
    setShowBulkSelectDropdown(false);
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
    setShowBulkBar(false);
    setShowBulkSelectDropdown(false);
  };

  const handleEdit = (product) => {
    const id = product._id ?? product.id;
    if (id) {
      router.push(`/dashboard/business/products/add?edit=${id}`);
      return;
    }
    setEditingProduct(product);
    setEditModalKey((prev) => prev + 1);
    setShowEditModal(true);
  };

  const handleAddProduct = () => {
    router.push("/dashboard/business/products/add");
  };

  const handleSaveEdit = (updatedProduct) => {
    // Show confirmation modal before saving
    setPendingEditData(updatedProduct);
    setShowEditConfirmModal(true);
  };

  const handleConfirmEditSave = async () => {
    if (!pendingEditData || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const isNew = !pendingEditData._id && !pendingEditData.id;
      const productDataForApi = normalizeProductForApi(pendingEditData);

      const saved = isNew
        ? await createProduct(productDataForApi, token)
        : await updateProduct(
            pendingEditData._id || pendingEditData.id,
            productDataForApi,
            token,
          );

      const transformedProduct = {
        ...saved,
        id: saved.id ?? saved._id ?? "",
        tiers: saved.tiers ?? saved.priceTiers ?? [],
      };

      setProducts((prev) =>
        isNew
          ? [transformedProduct, ...prev]
          : prev.map((p) =>
              p.id === transformedProduct.id ? transformedProduct : p,
            ),
      );

      setShowEditModal(false);
      setEditingProduct(null);
      setShowEditConfirmModal(false);
      setPendingEditData(null);
      setShowSaveSuccess(true);
      setTimeout(() => setShowSaveSuccess(false), 3000);
    } catch (error) {
      console.error("Failed to save product:", error);
      setPriceErrorMessage(
        error.message || "Failed to save product. Please try again.",
      );
      setPriceErrorTitle("Unable to Save Product");
      setShowPriceErrorModal(true);
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Delete ─
  const TERMINAL_STATUSES = new Set(['delivered', 'cancelled', 'rejected', 'completed', 'failed']);

  const confirmDelete = async (product) => {
    const pid = product._id || product.id;
    try {
      const allOrders = await fetchAllOrders(token, {});
      const activeOrders = allOrders.filter(o => {
        const touches = o.productId === pid || o.productId === product.id ||
          o.items?.some(i => i.productId === pid || i.productId === product.id);
        return touches && !TERMINAL_STATUSES.has(o.status);
      });
      if (activeOrders.length > 0) {
        setBlockModal({ product, count: activeOrders.length });
        return;
      }
      setDeleteModal(product);
    } catch {
      setDeleteModal(product);
    }
  };

  const executeDelete = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      const productId = deleteModal._id || deleteModal.id;
      await deleteProduct(productId, token);
      setProducts((prev) => prev.filter((p) => p.id !== productId && p._id !== productId));
      setDeleteModal(null);
    } catch (error) {
      console.error("Failed to delete product:", error);
      setPriceErrorMessage(
        error.message || "Failed to delete product. Please try again.",
      );
      setPriceErrorTitle("Unable to Delete Product");
      setShowPriceErrorModal(true);
    } finally {
      setIsSubmitting(false);
    }
  };


  // ── Restore ──
  const handleRestore = async (product) => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      const productId = product._id || product.id;

      // Call API to restore product
      await updateProduct(
        productId,
        {
          isArchived: false,
          isPublished: false,
          updatedAt: new Date().toISOString(),
        },
        token,
      );

      // Update local state
      setProducts((prev) =>
        prev.map((p) =>
          p.id === productId
            ? {
                ...p,
                isArchived: false,
                isPublished: false,
                updatedAt: new Date().toISOString(),
              }
            : p,
        ),
      );
    } catch (error) {
      console.error("Failed to restore product:", error);
      setPriceErrorMessage(
        error.message || "Failed to restore product. Please try again.",
      );
      setPriceErrorTitle("Unable to Restore Product");
      setShowPriceErrorModal(true);
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Bulk actions ──
  const executeBulkAction = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    const action = bulkModal?.action;
    let updates = {};

    if (action === "publish")
      updates = { isPublished: true, updatedAt: new Date().toISOString() };
    else if (action === "unpublish")
      updates = { isPublished: false, updatedAt: new Date().toISOString() };
    else if (action === "restore")
      updates = {
        isArchived: false,
        isPublished: false,
        updatedAt: new Date().toISOString(),
      };
    else if (action === "remove")
      updates = {
        isArchived: true,
        isPublished: false,
        updatedAt: new Date().toISOString(),
      };

    try {
      // Update all selected products via API
      const productIds = Array.from(selectedIds);
      await Promise.all(
        productIds.map((id) => {
          const product = products.find((p) => p.id === id);
          const productId = product?.id || id;
          return updateProduct(productId, updates, token);
        }),
      );

      // Update local state
      setProducts((prev) =>
        prev.map((p) => (selectedIds.has(p.id) ? { ...p, ...updates } : p)),
      );

      setBulkModal(null);
      clearSelection();
    } catch (error) {
      console.error("Failed to perform bulk action:", error);
      setPriceErrorMessage(
        error.message || "Failed to perform this action. Please try again.",
      );
      setPriceErrorTitle("Action Failed");
      setShowPriceErrorModal(true);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Check selected items status for bulk action buttons
  const getSelectedItemsStatus = () => {
    const selectedProducts = products.filter((p) => selectedIds.has(p.id));
    const hasPublished = selectedProducts.some(
      (p) => p.isPublished === true && !p.isArchived,
    );
    const hasUnpublished = selectedProducts.some(
      (p) => p.isPublished !== true && !p.isArchived,
    );
    const hasArchived = selectedProducts.some((p) => p.isArchived === true);
    // Check if any selected product has archived inventory
    const hasArchivedInventory = selectedProducts.some((p) => {
      const inv = getInventoryItem(p.inventoryId);
      return inv && inv.isActive === false;
    });
    return { hasPublished, hasUnpublished, hasArchived, hasArchivedInventory };
  };

  if (!isLoaded) {
    return (
      <div className="page-content-wrapper">
        <div className="loading-state">
          <div className="spinner" style={{ width: '18px', height: '18px',
  margin: '0 auto' }} />
          <p>Loading products...</p>
        </div>
      </div>
    );
  }

  const prodTotalPages = Math.max(1, Math.ceil(filteredProducts.length / prodRowsPerPage));
  const pagedProducts = filteredProducts.slice((prodPage - 1) * prodRowsPerPage, prodPage * prodRowsPerPage);

  const allSelected =
    filteredProducts.length > 0 && selectedIds.size === filteredProducts.length;
  const someSelected = selectedIds.size > 0 && !allSelected;

  return (
    <ErrorBoundary>
      <div className="page-content-wrapper">
        {/* Save Success Toast */}
        {showSaveSuccess && (
          <div
            style={{
              position: "fixed",
              top: "1.5rem",
              right: "1.5rem",
              zIndex: 2000,
              background: "#facc15",
              color: "black",
              padding: "0.875rem 1.5rem",
              borderRadius: "10px",
              fontWeight: 600,
              fontSize: "0.9rem",
              boxShadow: "0 8px 32px rgba(198,177,23,0.3)",
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              animation: "fadeIn 0.2s ease",
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
              <path d="M20 6L9 17l-5-5" />
            </svg>
            Product updated successfully!
          </div>
        )}

        {/* Toolbar */}
        <div className="inventory-toolbar" style={{ marginBottom: "1.5rem" }}>
          <div className="search-wrapper">
            <span className="search-icon">
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <circle cx="11" cy="11" r="8" />
                <path d="M21 21l-4.35-4.35" />
              </svg>
            </span>
            <input
              type="text"
              className="search-input"
              placeholder="Search products or category..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button
                className="search-clear"
                onClick={() => setSearchQuery("")}
              >
                ×
              </button>
            )}
          </div>
          <button className="btn-primary" onClick={handleAddProduct}>
            <span className="btn-icon">+</span> Add New Product
          </button>
        </div>


        {/* Bulk Action Bar */}
        {showBulkBar && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.75rem",
              padding: "0.75rem 1rem",
              marginBottom: "0.75rem",
              background: "rgba(212,168,67,0.08)",
              border: "1px solid var(--primary)",
              borderRadius: "10px",
              flexWrap: "wrap",
            }}
          >
            <span
              style={{
                fontSize: "0.85rem",
                color: "var(--white)",
                fontWeight: 600,
              }}
            >
              {selectedIds.size} selected
            </span>
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              {(() => {
                const {
                  hasPublished,
                  hasUnpublished,
                  hasArchived,
                  hasArchivedInventory,
                } = getSelectedItemsStatus();
                const showPublish =
                  hasUnpublished &&
                  statusFilter !== "published" &&
                  statusFilter !== "archived" &&
                  !hasArchivedInventory;
                const showUnpublish =
                  hasPublished &&
                  statusFilter !== "unpublished" &&
                  statusFilter !== "archived" &&
                  !hasArchivedInventory;
                const showRestore = hasArchived && !hasArchivedInventory;
                return (
                  <>
                    {showPublish && (
                      <button
                        className="btn-sm btn-primary"
                        onClick={() => setBulkModal({ action: "publish" })}
                      >
                        Publish
                      </button>
                    )}
                    {showUnpublish && (
                      <button
                        className="btn-sm btn-secondary"
                        onClick={() => setBulkModal({ action: "unpublish" })}
                        style={{
                          background: "var(--dark2)",
                          borderColor: "var(--border)",
                          color: "var(--white)",
                        }}
                      >
                        Unpublish
                      </button>
                    )}
                    {hasArchivedInventory ? (
                      <button
                        className="btn-sm btn-secondary"
                        onClick={() => {
                          // Redirect to Inventory page to restore inventory first
                          router.push("/dashboard/business/inventory");
                        }}
                        style={{
                          background: "var(--dark2)",
                          borderColor: "var(--border)",
                          color: "var(--white)",
                          cursor: "pointer",
                        }}
                      >
                        Restore Inventory First
                      </button>
                    ) : showRestore ? (
                      <button
                        className="btn-sm btn-primary"
                        onClick={() => setBulkModal({ action: "restore" })}
                        style={{
                          background: "var(--dark2)",
                          borderColor: "var(--border)",
                          color: "var(--white)",
                          cursor: "pointer",
                        }}
                      >
                        Restore
                      </button>
                    ) : (
                      <button
                        className="btn-sm btn-danger"
                        onClick={() => setBulkModal({ action: "remove" })}
                      >
                        Remove
                      </button>
                    )}
                  </>
                );
              })()}
            </div>
            <button
              onClick={clearSelection}
              style={{
                marginLeft: "auto",
                background: "none",
                border: "none",
                color: "var(--gray)",
                cursor: "pointer",
                fontSize: "1.1rem",
                lineHeight: 1,
              }}
            >
              ×
            </button>
          </div>
        )}

        {/* Product list */}
        <div style={{ marginBottom: "1rem" }}>
          {filteredProducts.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">
                <svg
                  width="64"
                  height="64"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                >
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <path d="M3 9h18M9 21V9" />
                </svg>
              </div>
              <h3 className="empty-title">
                {searchQuery || statusFilter
                  ? "No products found"
                  : "No Products Yet"}
              </h3>
              <p className="empty-description">
                {searchQuery || statusFilter
                  ? "Try adjusting your search or filter."
                  : "Get started by adding your first product."}
              </p>
              {!searchQuery && !statusFilter && (
                <button className="btn-primary" onClick={handleAddProduct}>
                  Add First Product
                </button>
              )}
            </div>
          ) : (
            <div style={{ background: "var(--dark2)", border: "1px solid var(--border)", borderRadius: "12px", overflow: "hidden" }}>
              {/* Table header */}
              <div style={{ display: "grid", gridTemplateColumns: "40px 52px 1.4fr 90px 1.6fr 100px minmax(0,130px) 100px", alignItems: "center", padding: "0.5rem 1rem", background: "var(--dark3)", borderBottom: "1px solid var(--border)" }} ref={bulkSelectRef}>
                <div style={{ position: "relative" }}>
                  <input
                    type="checkbox"
                    checked={allSelected}
                    ref={(el) => { if (el) el.indeterminate = someSelected; }}
                    onChange={toggleSelectAll}
                    style={{ width: 15, height: 15, cursor: "pointer", accentColor: "var(--gold)" }}
                    title={statusFilter === "" ? "Select all" : `Select all ${statusFilter}`}
                  />
                  {showBulkSelectDropdown && statusFilter === "" && (
                    <div style={{ position: "absolute", top: "100%", left: 0, marginTop: "0.25rem", background: "var(--dark2)", border: "1px solid var(--border)", borderRadius: "8px", boxShadow: "0 4px 12px rgba(0,0,0,0.3)", zIndex: 100, minWidth: "160px", overflow: "hidden" }}>
                      <button type="button" onClick={selectAllPublished} style={{ width: "100%", padding: "0.5rem 0.75rem", background: "transparent", border: "none", color: "var(--white)", fontSize: "0.82rem", textAlign: "left", cursor: "pointer" }}>Select Published</button>
                      <button type="button" onClick={selectAllUnpublished} style={{ width: "100%", padding: "0.5rem 0.75rem", background: "transparent", border: "none", borderTop: "1px solid var(--border)", color: "var(--white)", fontSize: "0.82rem", textAlign: "left", cursor: "pointer" }}>Select Unpublished</button>
                      {selectedIds.size > 0 && (
                        <button type="button" onClick={unselectAll} style={{ width: "100%", padding: "0.5rem 0.75rem", background: "transparent", border: "none", borderTop: "1px solid var(--border)", color: "#ef4444", fontSize: "0.82rem", textAlign: "left", cursor: "pointer" }}>
                          Unselect All ({selectedIds.size})
                        </button>
                      )}
                    </div>
                  )}
                </div>
                <div />
                {["Product", "Status", "Inventory", "Price", "Category", ""].map((h) => (
                  <span key={h} style={{ fontSize: "0.6rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--gray)" }}>{h}</span>
                ))}
              </div>

              {/* Table rows */}
              {pagedProducts.map((product, pi) => {
                const inv = getInventoryItem(product.inventoryId);
                const stockStatus = getStockStatus(product);
                const invDisplay = getProductInventoryDisplay(product);
                const priceRange = getPriceRange(product);
                const variantSummary = getVariantSummary(product);
                const isExpanded = expandedRows.has(product.id);
                const isSelected = selectedIds.has(product.id);
                const isInventoryArchived = inv?.isActive === false;
                const stockColor = invDisplay.color;
                return (
                  <div key={(product._id?.toString?.() ?? product._id) || product.id}
                    style={{ borderTop: pi > 0 ? "1px solid var(--border)" : "none", opacity: product.isArchived ? 0.6 : 1, background: isSelected ? "rgba(212,168,67,0.03)" : "transparent" }}>
                    {/* Main row */}
                    <div style={{ display: "grid", gridTemplateColumns: "40px 52px 1.4fr 90px 1.6fr 100px minmax(0,130px) 100px", alignItems: "center", padding: "0.75rem 1rem", gap: 0 }}>
                      {/* Checkbox */}
                      <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(product.id)}
                        style={{ width: 15, height: 15, cursor: "pointer", accentColor: "var(--gold)" }} />

                      {/* Thumbnail */}
                      {product.thumbnail ? (
                        <img src={product.thumbnail} alt="" style={{ width: 40, height: 40, borderRadius: 6, objectFit: "cover" }} />
                      ) : (
                        <div style={{ width: 40, height: 40, borderRadius: 6, background: "var(--dark3)", border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--gray)" }}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                            <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="M21 15l-5-5L5 21" />
                          </svg>
                        </div>
                      )}

                      {/* Product name + badges */}
                      <div style={{ paddingLeft: "0.75rem", minWidth: 0 }}>
                        <div onClick={() => !isInventoryArchived && handleEdit(product)}
                          style={{ fontWeight: 600, color: "var(--white)", fontSize: "0.85rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", cursor: isInventoryArchived ? "default" : "pointer", textDecoration: "none" }}
                          onMouseEnter={(e) => { if (!isInventoryArchived) e.currentTarget.style.textDecoration = "underline"; }}
                          onMouseLeave={(e) => { e.currentTarget.style.textDecoration = "none"; }}>
                          {product.productName || product.subCategoryName || "Unnamed"}
                        </div>
                        <div style={{ display: "flex", gap: "0.3rem", marginTop: "0.2rem", flexWrap: "wrap" }}>
                          {product.isMadeToOrder && <span style={{ fontSize: "0.55rem", fontWeight: 700, background: "rgba(212,168,67,0.1)", border: "1px solid rgba(212,168,67,0.28)", borderRadius: "4px", padding: "0.05rem 0.35rem", color: "#D4A843" }}>MTO</span>}
                          {product.isInquiry && <span style={{ fontSize: "0.55rem", fontWeight: 700, background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.22)", borderRadius: "4px", padding: "0.05rem 0.35rem", color: "rgba(139,92,246,0.85)" }}>Quote</span>}
                          {isInventoryArchived && <span style={{ fontSize: "0.55rem", background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.28)", borderRadius: "4px", padding: "0.05rem 0.35rem", color: "var(--orange)" }}>Inv. Archived</span>}
                          {variantSummary && <span style={{ fontSize: "0.55rem", color: "var(--gray)" }}>{variantSummary}</span>}
                        </div>
                      </div>

                      {/* Status */}
                      <div>
                        {product.isArchived ? (
                          <span style={{ fontSize: "0.68rem", color: "var(--gray)", background: "var(--dark3)", border: "1px solid var(--border)", borderRadius: "20px", padding: "0.15rem 0.6rem" }}>Archived</span>
                        ) : (
                          <span style={{ fontSize: "0.68rem", fontWeight: 700, background: product.isPublished ? "rgba(34,197,94,0.1)" : "rgba(212,168,67,0.1)", border: `1px solid ${product.isPublished ? "rgba(34,197,94,0.3)" : "rgba(212,168,67,0.3)"}`, borderRadius: "20px", padding: "0.15rem 0.6rem", color: product.isPublished ? "#22c55e" : "#facc15" }}>
                            {product.isPublished ? "Active" : "Draft"}
                          </span>
                        )}
                      </div>

                      {/* Inventory */}
                      <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", minWidth: 0 }}>
                        <span style={{ width: 6, height: 6, borderRadius: "50%", background: stockColor, flexShrink: 0 }} />
                        <span style={{ fontSize: "0.78rem", color: "var(--gray)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={invDisplay.text}>{invDisplay.text}</span>
                      </div>

                      {/* Price */}
                      <div style={{ fontWeight: 700, color: "#D4A843", fontSize: "0.82rem" }}>{priceRange || "—"}</div>

                      {/* Category */}
                      <div style={{ fontSize: "0.78rem", color: "var(--gray)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }} title={product.category || ""}>{product.category || "—"}</div>

                      {/* Actions */}
                      <div style={{ display: "flex", gap: "0.35rem", alignItems: "center", justifyContent: "flex-end" }}>
                        {product.isArchived && !isInventoryArchived ? (
                          <button className="btn-sm btn-secondary" onClick={() => setRestoreModal(product)}
                            style={{ background: "var(--dark2)", borderColor: "var(--border)", color: "var(--white)", cursor: "pointer", fontSize: "0.72rem" }}>
                            Restore
                          </button>
                        ) : product.isArchived && isInventoryArchived ? (
                          <span style={{ fontSize: "0.68rem", color: "var(--gray)" }}>Restore inv. first</span>
                        ) : (
                          <button className="btn-sm btn-danger" onClick={() => confirmDelete(product)} style={{ fontSize: "0.72rem" }}>Remove</button>
                        )}
                        <button type="button" onClick={() => toggleExpand(product.id)}
                          style={{ background: "none", border: "1px solid var(--border)", borderRadius: "6px", padding: "0.2rem 0.4rem", cursor: "pointer", color: "var(--gray)", display: "flex", alignItems: "center" }}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                            style={{ transition: "transform 0.2s", transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)" }}>
                            <path d="M6 9l6 6 6-6" />
                          </svg>
                        </button>
                      </div>
                    </div>

                    {/* Expand panel */}
                    {isExpanded && <ProductExpandRow product={product} inv={inv} boms={boms} inventoryList={inventoryList} />}
                  </div>
                );
              })}
              {/* Rows per page + pagination */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0.625rem 1rem", borderTop: "1px solid var(--border)", flexWrap: "wrap", gap: "0.5rem", fontSize: "0.8rem", color: "var(--gray)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  Rows per page:
                  <select value={prodRowsPerPage} onChange={(e) => { setProdRowsPerPage(Number(e.target.value)); setProdPage(1); }} style={{ background: "var(--dark)", border: "1px solid var(--border)", borderRadius: "6px", color: "var(--white)", padding: "0.2rem 0.5rem", fontSize: "0.8rem", cursor: "pointer" }}>
                    {[10, 20, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                  <span style={{ color: "var(--gray)", fontSize: "0.75rem" }}>{filteredProducts.length} total</span>
                </div>
                {prodTotalPages > 1 && (
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <button onClick={() => setProdPage((p) => Math.max(1, p - 1))} disabled={prodPage === 1}
                      style={{ background: "none", border: "1px solid var(--border)", borderRadius: "6px", padding: "0.3rem 0.65rem", color: prodPage === 1 ? "rgba(229,226,225,0.2)" : "#E5E2E1", cursor: prodPage === 1 ? "not-allowed" : "pointer", fontSize: "0.78rem" }}>‹</button>
                    <span style={{ minWidth: "80px", textAlign: "center" }}>Page {prodPage} of {prodTotalPages}</span>
                    <button onClick={() => setProdPage((p) => Math.min(prodTotalPages, p + 1))} disabled={prodPage === prodTotalPages}
                      style={{ background: "none", border: "1px solid var(--border)", borderRadius: "6px", padding: "0.3rem 0.65rem", color: prodPage === prodTotalPages ? "rgba(229,226,225,0.2)" : "#E5E2E1", cursor: prodPage === prodTotalPages ? "not-allowed" : "pointer", fontSize: "0.78rem" }}>›</button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
        {deleteModal && (
          <ConfirmModal
            title="Delete Product"
            message={`Permanently delete "${deleteModal.productName || deleteModal.subCategoryName}"? This cannot be undone.`}
            confirmLabel={isSubmitting ? 'Deleting...' : 'Delete'}
            confirmClass="btn-danger"
            onConfirm={executeDelete}
            onCancel={() => setDeleteModal(null)}
          />
        )}

        {/* Edit Confirmation Modal */}
        {showEditConfirmModal && pendingEditData && (
          <ConfirmEditModal
            isOpen={showEditConfirmModal}
            onClose={() => {
              setShowEditConfirmModal(false);
              setPendingEditData(null);
              setShowEditModal(false);
              setEditingProduct(null);
            }}
            originalProduct={editingProduct}
            updatedProduct={pendingEditData}
            inventoryList={inventoryList}
            onConfirm={handleConfirmEditSave}
          />
        )}

        {/* Price Error Modal */}
        {showPriceErrorModal && (
          <PriceErrorModal
            isOpen={showPriceErrorModal}
            onClose={() => {
              setShowPriceErrorModal(false);
              setPriceErrorTitle("Price Required");
            }}
            title={priceErrorTitle}
            message={priceErrorMessage}
          />
        )}

        {/* Block Modal — product has active orders */}
        {blockModal && (
          <ConfirmModal
            title="Cannot Delete"
            message={`"${blockModal.product?.productName || blockModal.product?.subCategoryName}" has ${blockModal.count} active order${blockModal.count !== 1 ? 's' : ''} in progress. Complete or cancel them first before deleting this product.`}
            confirmLabel="Got it"
            confirmClass="btn-primary"
            onConfirm={() => setBlockModal(null)}
            onCancel={() => setBlockModal(null)}
          />
        )}

        {/* Bulk Action Modal */}
        {bulkModal && (
          <ConfirmModal
            title={
              bulkModal.action === "publish"
                ? "Publish Products"
                : bulkModal.action === "unpublish"
                  ? "Unpublish Products"
                  : bulkModal.action === "restore"
                    ? "Restore Products"
                    : "Remove Products"
            }
            message={`${
              bulkModal.action === "publish"
                ? "Publish"
                : bulkModal.action === "unpublish"
                  ? "Unpublish"
                  : bulkModal.action === "restore"
                    ? "Restore"
                    : "Remove"
            } ${selectedIds.size} selected product${selectedIds.size !== 1 ? "s" : ""}?`}
            confirmLabel={
              isSubmitting
                ? "Processing..."
                : bulkModal.action === "publish"
                  ? "Publish"
                  : bulkModal.action === "unpublish"
                    ? "Unpublish"
                    : bulkModal.action === "restore"
                      ? "Restore"
                      : "Remove"
            }
            confirmClass="btn-danger"
            onConfirm={executeBulkAction}
            onCancel={() => setBulkModal(null)}
          />
        )}

        {/* Restore Confirmation Modal */}
        {restoreModal && (
          <ConfirmModal
            title="Restore Product"
            message={`Restore "${restoreModal.productName || restoreModal.subCategoryName}" from archived? This will make the product visible in the Total Products list (unpublished).`}
            confirmLabel="Restore"
            confirmClass="btn-primary"
            onConfirm={() => {
              handleRestore(restoreModal);
              setRestoreModal(null);
            }}
            onCancel={() => setRestoreModal(null)}
          />
        )}

        {/* Full Edit Modal */}
        {showEditModal && editingProduct && (
          <EditProductModal
            key={editModalKey}
            product={editingProduct}
            inventoryList={inventoryList}
            products={products}
            token={token}
            isNew={!editingProduct._id && !editingProduct.id}
            onClose={() => {
              setShowEditModal(false);
              setEditingProduct(null);
            }}
            onSave={handleSaveEdit}
            onPriceError={(msg) => {
              setPriceErrorMessage(msg);
              setShowPriceErrorModal(true);
            }}
          />
        )}

      </div>
    </ErrorBoundary>
  );
}
