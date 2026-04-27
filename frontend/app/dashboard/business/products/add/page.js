"use client";

/* eslint-disable @next/next/no-img-element */

import { useAuth } from "@/contexts/AuthContext";
import { fetchInventory, fetchBoms } from "@/lib/inventoryApi";
import { fetchProducts, createProduct, updateProduct, uploadImage } from "@/lib/productApi";
import { useRouter, useSearchParams } from "next/navigation";
import React, { useEffect, useMemo, useRef, useState } from "react";

// ── Helpers ───────────────────────────────────────────────────────────────────

const sanitizeNumber = (val) => {
  if (val === "") return "";
  const num = parseFloat(val);
  return isNaN(num) || num < 0 ? "0" : val;
};

function normalizeProductForApi(p) {
  const name = p.name || p.productName || p.subCategoryName || "";
  const priceTiers = p.priceTiers || p.tiers || [];
  // eslint-disable-next-line no-unused-vars
  const { id, _id, tiers, productName, ...rest } = p;
  return { ...rest, name, priceTiers };
}

// ── NumberInput ───────────────────────────────────────────────────────────────

function NumberInput({ value, onChange, min = 0, max, placeholder, className, disabled, step }) {
  const handleChange = (e) => {
    const val = e.target.value;
    if (val === "" || /^\d*\.?\d*$/.test(val)) {
      if (max !== undefined && val !== "" && parseFloat(val) > max) return;
      onChange({ ...e, target: { ...e.target, value: val } });
    }
  };
  return (
    <input
      type="text"
      inputMode="decimal"
      className={className}
      value={value}
      onChange={handleChange}
      placeholder={placeholder}
      disabled={disabled}
    />
  );
}

// ── Toggle ────────────────────────────────────────────────────────────────────

function Toggle({ on, onChange, label, hint, disabled = false }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem", opacity: disabled ? 0.5 : 1 }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600, color: "#E5E2E1", fontSize: "0.875rem" }}>{label}</div>
        {hint && <div style={{ fontSize: "0.72rem", color: "var(--gray)", marginTop: "0.1rem" }}>{hint}</div>}
      </div>
      <button type="button" onClick={() => !disabled && onChange(!on)}
        style={{ position: "relative", display: "inline-flex", alignItems: "center", width: "44px", height: "24px", borderRadius: "12px", border: "none", background: on ? "#D4A843" : "rgba(255,255,255,0.12)", cursor: disabled ? "not-allowed" : "pointer", flexShrink: 0, padding: 0 }}>
        <span style={{ position: "absolute", left: on ? "22px" : "2px", width: "20px", height: "20px", borderRadius: "50%", background: "#fff", transition: "left 0.18s", boxShadow: "0 1px 4px rgba(0,0,0,0.35)" }} />
      </button>
    </div>
  );
}

// ── Card ──────────────────────────────────────────────────────────────────────

function Card({ children, style }) {
  return (
    <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid var(--border)", borderRadius: "12px", padding: "1.25rem", ...style }}>
      {children}
    </div>
  );
}

// ── Section title ─────────────────────────────────────────────────────────────

function SectionTitle({ children }) {
  return <div style={{ fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "rgba(229,226,225,0.45)", marginBottom: "1rem" }}>{children}</div>;
}

// ── ProductCardPreview ────────────────────────────────────────────────────────

function ProductCardPreview({ name, category, priceRange, variantCount = 0, thumbnail, isCustom }) {
  return (
    <div>
      <div style={{ fontSize: "0.58rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.15em", color: "rgba(229,226,225,0.3)", marginBottom: "0.75rem", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span>Storefront Preview</span>
        <span style={{ fontSize: "0.55rem", color: "rgba(229,226,225,0.22)", textTransform: "none", letterSpacing: "0.04em", fontStyle: "italic", fontWeight: 400 }}>How customers see it</span>
      </div>

      {/* Mirrors .shop-product-card exactly */}
      <div style={{ background: "var(--black, #0e0d0b)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "12px", overflow: "hidden", transition: "all 0.2s" }}>
        {/* Image area — mirrors .shop-product-image-area (180px) */}
        <div style={{ height: "180px", background: "linear-gradient(135deg, #191716 0%, #131210 100%)", display: "flex", alignItems: "center", justifyContent: "center", position: "relative", overflow: "hidden" }}>
          {thumbnail ? (
            <img src={thumbnail} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          ) : (
            <div style={{ textAlign: "center", color: "rgba(212,168,67,0.2)" }}>
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" style={{ display: "block", margin: "0 auto 8px" }}>
                <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" />
              </svg>
              <div style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.3)" }}>No image</div>
            </div>
          )}
          {/* Category badge */}
          {category && (
            <div style={{ position: "absolute", bottom: "0.625rem", left: "0.625rem", fontSize: "0.65rem", fontWeight: 600, color: "rgba(255,255,255,0.7)", background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)", padding: "0.2rem 0.5rem", borderRadius: "4px", textTransform: "uppercase", letterSpacing: "0.06em" }}>
              {category}
            </div>
          )}
          {isCustom && (
            <div style={{ position: "absolute", top: "10px", right: "10px", background: "#D4A843", color: "#000", fontSize: "0.6rem", fontWeight: 700, padding: "3px 8px", borderRadius: "6px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
              Customizable
            </div>
          )}
        </div>

        {/* Info — mirrors .shop-product-info */}
        <div style={{ padding: "1.25rem" }}>
          <div style={{ margin: "0 0 0.5rem", fontSize: "1rem", fontWeight: 600, color: "#E5E2E1", lineHeight: 1.4, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
            {name || <span style={{ color: "rgba(229,226,225,0.25)", fontStyle: "italic", fontWeight: 400 }}>Product name</span>}
          </div>

          {/* Footer — mirrors .shop-product-footer */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: "1.1rem", fontWeight: 700, color: "#D4A843" }}>
              {priceRange || <span style={{ fontSize: "0.78rem", color: "rgba(229,226,225,0.25)", fontWeight: 400, fontStyle: "italic" }}>Set price below</span>}
            </span>
            {variantCount > 1 && (
              <span style={{ fontSize: "0.75rem", color: "rgba(229,226,225,0.45)", fontWeight: 500 }}>
                {variantCount} variant{variantCount !== 1 ? "s" : ""}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── AddProductPage ────────────────────────────────────────────────────────────

export default function AddProductPage() {
  const { token } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const editProductId = searchParams?.get("edit") || null;
  const isEditMode = !!editProductId;
  const [editingProduct, setEditingProduct] = useState(null);

  // ── Data loading ──────────────────────────────────────────────────────────
  const [boms, setBoms] = useState([]);
  const [inventoryList, setInventoryList] = useState([]);
  const [existingCategories, setExistingCategories] = useState([]);

  useEffect(() => {
    const load = async () => {
      if (!token) return;
      const [invRes, bomRes, prodRes] = await Promise.allSettled([
        fetchInventory(token),
        fetchBoms(token),
        fetchProducts(token),
      ]);
      if (invRes.status === "fulfilled")
        setInventoryList((Array.isArray(invRes.value) ? invRes.value : []).map((i) => ({ ...i, id: i.id ?? i._id ?? "" })));
      if (bomRes.status === "fulfilled")
        setBoms(Array.isArray(bomRes.value) ? bomRes.value : []);
      if (prodRes.status === "fulfilled") {
        const prods = Array.isArray(prodRes.value) ? prodRes.value : [];
        const cats = [...new Set(prods.map((p) => p.category).filter(Boolean))].sort();
        setExistingCategories(cats);
        const imgMap = new Map();
        prods.forEach((p) => {
          const label = p.productName || p.name || "";
          if (p.thumbnail) imgMap.set(p.thumbnail, { id: p.thumbnail, url: p.thumbnail, label });
          (p.images || []).forEach((u) => { if (u) imgMap.set(u, { id: u, url: u, label }); });
        });
        setExistingImages([...imgMap.values()]);

        if (isEditMode && editProductId) {
          const found = prods.find((p) => String(p._id ?? p.id) === String(editProductId));
          if (found) setEditingProduct(found);
        }
      }
    };
    load();
  }, [token, isEditMode, editProductId]);

  const allBoms = useMemo(() => (boms || []).filter((b) => b.productName), [boms]);

  // Group BOMs by productGroupName for the product picker
  const productGroupMap = useMemo(() => {
    const map = {};
    allBoms.forEach((b) => {
      const grp = b.productGroupName || b.productName;
      if (!map[grp]) map[grp] = { category: b.category || "", boms: [] };
      map[grp].boms.push(b);
    });
    return map;
  }, [allBoms]);

  const productGroupNames = useMemo(() =>
    Object.keys(productGroupMap).sort(),
    [productGroupMap]
  );

  // ── Form state ────────────────────────────────────────────────────────────

  // Product / BOM selection
  const [selectedBoms, setSelectedBoms] = useState([]);

  const selectedGroupName = selectedBoms.length > 0
    ? (selectedBoms[0].bom.productGroupName || selectedBoms[0].bom.productName)
    : "";
  const [productGroupSearch, setProductGroupSearch] = useState("");
  const [productGroupOpen, setProductGroupOpen] = useState(false);
  const productGroupRef = useRef(null);

  // Details
  const [storefrontName, setStorefrontName] = useState("");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [catOpen, setCatOpen] = useState(false);
  const catRef = useRef(null);

  // Pricing
  const [priceType, setPriceType] = useState("fixed");
  const [isRequestQuote, setIsRequestQuote] = useState(false);
  const [variantPrices, setVariantPrices] = useState({});
  const [tiers, setTiers] = useState([{ id: 1, minQty: 1, maxQty: 20, prices: {} }]);

  // Availability + Media
  const [stockMap, setStockMap] = useState({});
  const [isMadeToOrder, setIsMadeToOrder] = useState(false);
  const [isCustomizable, setIsCustomizable] = useState(false);
  const [mediaItems, setMediaItems] = useState([]);
  const [showMediaModal, setShowMediaModal] = useState(false);
  const [showSelectModal, setShowSelectModal] = useState(false);
  const [existingImages, setExistingImages] = useState([]);
  const [selectSearch, setSelectSearch] = useState("");
  const [selectedInSelect, setSelectedInSelect] = useState(new Set());
  const [isPublished, setIsPublished] = useState(false);
  const [variantImages, setVariantImages] = useState({});
  const [variantImgModal, setVariantImgModal] = useState(null); // bomId | null
  const [variantImgSearch, setVariantImgSearch] = useState("");
  const [variantImgPicked, setVariantImgPicked] = useState(null); // url
  const [variantImgDropdown, setVariantImgDropdown] = useState(null); // bomId of open picker | null

  // Save state
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});
  const [saveError, setSaveError] = useState("");

  // ── Derived ───────────────────────────────────────────────────────────────

  const isStandalone = selectedBoms.length <= 1;
  const hasVariants = selectedBoms.length > 1;
  const primaryBom = selectedBoms[0]?.bom;

  const maxProducible = useMemo(() => {
    const result = {};
    selectedBoms.forEach(({ bom }) => {
      let min = Infinity;
      (bom.components || []).forEach((comp) => {
        const inv = inventoryList.find((i) => String(i.id) === String(comp.inventoryId ?? comp.materialId));
        const can = Math.floor((inv?.stockQty || 0) / (comp.qty || 1));
        if (can < min) min = can;
      });
      result[bom.id] = min === Infinity ? 0 : min;
    });
    return result;
  }, [selectedBoms, inventoryList]);

  const bomCostMap = useMemo(() => {
    const r = {};
    selectedBoms.forEach(({ bom }) => { r[bom.id] = bom.totalCost || 0; });
    return r;
  }, [selectedBoms]);

  const maxCostMap = useMemo(() => {
    const r = {};
    selectedBoms.forEach(({ bom }) => {
      const total = (bom.components || []).reduce((s, c) => {
        const inv = inventoryList.find((i) => String(i.id) === String(c.inventoryId ?? c.materialId));
        const batchCosts = (inv?.batches || []).filter((b) => (b.remainingQty || 0) > 0).map((b) => b.unitCost || 0).filter((v) => v > 0);
        const maxC = batchCosts.length > 0 ? Math.max(...batchCosts) : (inv?.baseCost || inv?.averageCost || 0);
        return s + maxC * (c.qty || 1);
      }, 0);
      r[bom.id] = total || bom.totalCost || 0;
    });
    return r;
  }, [selectedBoms, inventoryList]);

  const bottleneckMap = useMemo(() => {
    const r = {};
    selectedBoms.forEach(({ bom }) => {
      let minR = Infinity, minName = null;
      (bom.components || []).forEach((comp) => {
        const inv = inventoryList.find((i) => String(i.id) === String(comp.inventoryId ?? comp.materialId));
        const ratio = Math.floor((inv?.stockQty || 0) / (comp.qty || 1));
        if (ratio < minR) { minR = ratio; minName = comp.materialName ?? comp.materialId ?? null; }
      });
      r[bom.id] = minName;
    });
    return r;
  }, [selectedBoms, inventoryList]);

  const priceWarnings = useMemo(() => {
    if (priceType !== "fixed") return {};
    const w = {};
    selectedBoms.forEach(({ bom }) => {
      const floor = maxCostMap[bom.id] || 0;
      const p = parseFloat(variantPrices[bom.id]);
      if (variantPrices[bom.id] !== "" && !isNaN(p) && floor > 0)
        w[bom.id] = p < floor ? `Below cost — lose ₱${(floor - p).toFixed(2)}/unit` : null;
    });
    return w;
  }, [variantPrices, maxCostMap, priceType, selectedBoms]);

  const tierWarnings = useMemo(() => {
    if (priceType !== "tiered") return {};
    const w = {};
    tiers.forEach((tier) => {
      Object.entries(tier.prices || {}).forEach(([key, price]) => {
        const floor = maxCostMap[key] || 0;
        const p = parseFloat(price);
        if (price !== "" && !isNaN(p) && floor > 0 && p < floor) w[`${tier.id}_${key}`] = true;
      });
    });
    return w;
  }, [tiers, maxCostMap, priceType]);

  const overallMaxProducible = selectedBoms.length
    ? Math.min(...selectedBoms.map((s) => maxProducible[s.bom.id] ?? 0))
    : 0;

  const allZeroStock = selectedBoms.length > 0 && selectedBoms.every((s) => (maxProducible[s.bom.id] ?? 0) === 0);

  const priceRangeText = useMemo(() => {
    if (priceType === "fixed") {
      const prices = selectedBoms.map((s) => parseFloat(variantPrices[s.bom.id])).filter((p) => !isNaN(p) && p > 0);
      if (!prices.length) return "";
      const mn = Math.min(...prices), mx = Math.max(...prices);
      return mn === mx ? `₱${mn.toLocaleString("en-PH")}` : `₱${mn.toLocaleString("en-PH")} – ₱${mx.toLocaleString("en-PH")}`;
    }
    if (priceType === "tiered") {
      const all = tiers.flatMap((t) => Object.values(t.prices || {}).map((p) => parseFloat(p)).filter((p) => !isNaN(p) && p > 0));
      if (!all.length) return "";
      const mn = Math.min(...all), mx = Math.max(...all);
      return mn === mx ? `₱${mn.toLocaleString("en-PH")}` : `₱${mn.toLocaleString("en-PH")} – ₱${mx.toLocaleString("en-PH")}`;
    }
    return "";
  }, [priceType, variantPrices, tiers, selectedBoms]);

  // ── Sync effects ──────────────────────────────────────────────────────────

  // Edit-mode hydration: when editing, populate state from existing product
  const [editHydrated, setEditHydrated] = useState(false);
  useEffect(() => {
    if (!isEditMode || !editingProduct || !boms.length || editHydrated) return;
    const ep = editingProduct;

    // Match BOMs in the same group (so newly-added variants in master-data also appear)
    const groupName = ep.bomGroupName || ep.productGroupName;
    const matchedBoms = (boms || []).filter((b) => b.productGroupName && b.productGroupName === groupName);
    if (matchedBoms.length > 0) {
      setSelectedBoms(matchedBoms.map((bom) => ({ bom })));
    }

    setStorefrontName(ep.productName || ep.subCategoryName || ep.name || "");
    setCategory(ep.category || "");
    setDescription(ep.description || "");
    setIsPublished(!!ep.isPublished);
    setIsCustomizable(!!ep.isCustom);
    setIsMadeToOrder(!!ep.isMadeToOrder);
    setPriceType(ep.priceType || "fixed");

    // Pre-populate prices
    if (ep.priceType === "fixed") {
      if (ep.variantPrices && Object.keys(ep.variantPrices).length) {
        setVariantPrices(ep.variantPrices);
      } else if (ep.price != null) {
        setVariantPrices({ __base__: String(ep.price) });
      }
    } else if (ep.priceType === "tiered" && Array.isArray(ep.priceTiers ?? ep.tiers)) {
      const t = (ep.priceTiers ?? ep.tiers).map((row, i) => ({
        id: row.id ?? Date.now() + i,
        minQty: row.minQty ?? row.min ?? 1,
        maxQty: row.maxQty ?? row.max ?? "",
        prices: row.prices || {},
      }));
      if (t.length) setTiers(t);
    }

    // Pre-populate media
    const urls = [];
    if (ep.thumbnail) urls.push(ep.thumbnail);
    (ep.images || []).forEach((u) => { if (u && !urls.includes(u)) urls.push(u); });
    if (urls.length) {
      setMediaItems(urls.map((u, i) => ({ id: `existing-${i}-${u}`, preview: u, url: u, existing: true })));
    }

    if (ep.variantImageUrls && Object.keys(ep.variantImageUrls).length) {
      const mapped = {};
      Object.entries(ep.variantImageUrls).forEach(([bomId, url]) => {
        if (url) mapped[bomId] = { url, preview: url };
      });
      setVariantImages(mapped);
    }

    setEditHydrated(true);
  }, [isEditMode, editingProduct, boms, editHydrated]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (editHydrated) return; // skip resets while hydrating from existing product
    const initPrices = {}, initStock = {}, initTierPrices = {};
    selectedBoms.forEach(({ bom }) => { initPrices[bom.id] = ""; initStock[bom.id] = ""; initTierPrices[bom.id] = ""; });
    setVariantPrices(initPrices);
    setStockMap(initStock);
    const priceKey = isStandalone ? { __base__: "" } : initTierPrices;
    setTiers([{ id: 1, minQty: 1, maxQty: 20, prices: priceKey }]);
  }, [selectedBoms.length]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (primaryBom && !storefrontName) setStorefrontName(primaryBom.productName || "");
    if (primaryBom && !category) setCategory(primaryBom.category || "");
  }, [primaryBom]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const h = (e) => { if (catRef.current && !catRef.current.contains(e.target)) setCatOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  useEffect(() => {
    const h = (e) => { if (productGroupRef.current && !productGroupRef.current.contains(e.target)) setProductGroupOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  useEffect(() => {
    if (allZeroStock) setIsMadeToOrder(true);
  }, [allZeroStock]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const h = () => setVariantImgDropdown(null);
    if (variantImgDropdown) document.addEventListener("click", h, true);
    return () => document.removeEventListener("click", h, true);
  }, [variantImgDropdown]);

  // ── Tier helpers ──────────────────────────────────────────────────────────

  const addTier = () => {
    const last = tiers[tiers.length - 1];
    const emptyPrices = isStandalone ? { __base__: "" } : selectedBoms.reduce((acc, { bom }) => ({ ...acc, [bom.id]: "" }), {});
    setTiers((p) => [...p, { id: Date.now(), minQty: last ? (parseInt(last.maxQty) || 0) + 1 : 1, maxQty: "", prices: emptyPrices }]);
  };
  const removeTier = (id) => setTiers(tiers.filter((t) => t.id !== id));
  const updateTierRange = (id, field, val) => setTiers(tiers.map((t) => t.id === id ? { ...t, [field]: val } : t));
  const updateTierPrice = (tierId, key, val) => setTiers(tiers.map((t) => t.id === tierId ? { ...t, prices: { ...t.prices, [key]: val } } : t));

  // ── Image helpers ─────────────────────────────────────────────────────────

  const mkImgFromFile = (file) => ({ file, preview: URL.createObjectURL(file), id: `${Date.now()}-${Math.random()}` });
  const handleNewFiles = (files) => {
    setMediaItems((p) => [...p, ...Array.from(files).map(mkImgFromFile)]);
    setShowMediaModal(false);
  };
  const handleSelectExisting = () => {
    const toAdd = [...selectedInSelect]
      .filter((url) => !mediaItems.some((m) => m.id === url))
      .map((url) => ({ id: url, url, preview: url }));
    setMediaItems((p) => [...p, ...toAdd]);
    setShowSelectModal(false);
    setShowMediaModal(false);
    setSelectedInSelect(new Set());
  };

  // ── Validate + Save ───────────────────────────────────────────────────────

  const validate = () => {
    const errs = {};
    if (!selectedBoms.length) errs.bom = "Select at least one product.";
    if (!storefrontName.trim()) errs.name = "Storefront name is required.";
    if (!category.trim()) errs.category = "Category is required.";
    if (!isRequestQuote && priceType === "fixed") {
      const allSet = selectedBoms.every(({ bom }) => variantPrices[bom.id] !== "" && parseFloat(variantPrices[bom.id]) > 0);
      if (!allSet) errs.price = "Enter a price for every variant.";
    }
    if (!isRequestQuote && priceType === "tiered") {
      const allSet = tiers.every((t) => Object.values(t.prices).every((p) => p !== "" && parseFloat(p) > 0));
      if (!allSet) errs.price = "Fill in all tier prices.";
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    if (!token) { setSaveError("Sign in required."); return; }
    setSaving(true);
    setSaveError("");
    try {
      const uploadedUrls = [];
      for (const item of mediaItems) {
        if (item.file) {
          const up = await uploadImage(item.file, "pmp-products", token);
          uploadedUrls.push(up.url || up?.data?.url);
        } else if (item.url) {
          uploadedUrls.push(item.url);
        }
      }
      const thumbFinal = uploadedUrls[0] || null;
      const galleryUrls = uploadedUrls.slice(1);
      const variantImageUrls = {};
      for (const [bomId, img] of Object.entries(variantImages)) {
        let url = null;
        if (img.file) {
          const up = await uploadImage(img.file, "pmp-products", token);
          url = up.url || up?.data?.url;
        } else if (img.url) {
          url = img.url;
        }
        if (url) {
          variantImageUrls[bomId] = url;
          if (!galleryUrls.includes(url) && url !== thumbFinal) galleryUrls.push(url);
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
          ? isStandalone ? { price: variantPrices[primaryId] } : { variantPrices }
          : priceType === "tiered" ? { tiers } : {}),
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
        isCustom: isCustomizable,
        variantImageUrls,
      };

      if (isEditMode && editingProduct) {
        const id = editingProduct._id ?? editingProduct.id;
        await updateProduct(id, normalizeProductForApi({ ...productData, bomGroupName: editingProduct.bomGroupName || storefrontName }), token);
        router.push("/dashboard/business/products?updated=1");
      } else {
        await createProduct(normalizeProductForApi(productData), token);
        router.push("/dashboard/business/products?saved=1");
      }
    } catch (err) {
      setSaveError(err.message || "Save failed.");
    } finally {
      setSaving(false);
    }
  };

  // ── Styles ────────────────────────────────────────────────────────────────

  const inputSt = { width: "100%", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px", padding: "0.75rem 1rem", color: "#E5E2E1", fontSize: "0.875rem", outline: "none", boxSizing: "border-box" };
  const errorSt = { fontSize: "0.75rem", color: "#f87171", marginTop: "0.35rem" };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ minHeight: "100vh", background: "var(--dark)", color: "#E5E2E1" }}>
      {/* ── Top bar ── */}
      <div style={{ position: "sticky", top: 0, zIndex: 50, background: "var(--dark2,#111)", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0.75rem 1.5rem", backdropFilter: "blur(8px)" }}>
        {/* Breadcrumb */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.875rem" }}>
          <button type="button" onClick={() => router.push("/dashboard/business/products")}
            style={{ background: "none", border: "none", color: "var(--gray)", cursor: "pointer", padding: "0.25rem 0.5rem", borderRadius: "6px", display: "flex", alignItems: "center", gap: "0.35rem", fontSize: "0.875rem" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6" /></svg>
            Products
          </button>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="2"><path d="M9 18l6-6-6-6" /></svg>
          <span style={{ color: "#E5E2E1", fontWeight: 600 }}>{isEditMode ? "Edit product" : "Add product"}</span>
        </div>
        {/* Actions */}
        <div style={{ display: "flex", gap: "0.625rem", alignItems: "center" }}>
          {saveError && <span style={{ fontSize: "0.78rem", color: "#f87171" }}>{saveError}</span>}
          <button type="button" onClick={() => router.push("/dashboard/business/products")}
            style={{ background: "none", border: "1px solid var(--border)", borderRadius: "8px", padding: "0.5rem 1rem", color: "var(--gray)", fontSize: "0.875rem", cursor: "pointer" }}>
            {isEditMode ? "Cancel" : "Discard"}
          </button>
          <button type="button" onClick={handleSave} disabled={saving}
            style={{ background: "#D4A843", border: "none", borderRadius: "8px", padding: "0.5rem 1.25rem", color: "#1a1814", fontSize: "0.875rem", fontWeight: 700, cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.7 : 1 }}>
            {saving ? "Saving…" : isEditMode ? "Update" : "Save"}
          </button>
        </div>
      </div>

      {/* ── Page title ── */}
      <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "1.5rem 1.5rem 0" }}>
        <h1 style={{ fontSize: "1.25rem", fontWeight: 700, color: "#E5E2E1", margin: 0 }}>{isEditMode ? "Edit product" : "Add product"}</h1>
      </div>

      {/* ── Two-column layout ── */}
      <div style={{ maxWidth: "1200px", margin: "1rem auto", padding: "0 1.5rem 2rem", display: "grid", gridTemplateColumns: "1fr 300px", gap: "1.25rem", alignItems: "start" }}>

        {/* ═══ LEFT COLUMN ═══════════════════════════════════════════════════ */}
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>

          {/* Product combobox + Storefront Name + Description */}
          <Card>
            {isEditMode ? (
              <div style={{ marginBottom: "1rem" }}>
                <label style={{ fontSize: "0.78rem", fontWeight: 600, color: "rgba(229,226,225,0.7)", display: "block", marginBottom: "0.4rem" }}>Product (locked)</label>
                <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "10px", padding: "0.7rem 0.9rem" }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(229,226,225,0.4)" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
                  <div style={{ flex: 1 }}>
                    <div style={{ color: "#E5E2E1", fontWeight: 700, fontSize: "0.875rem" }}>{editingProduct?.bomGroupName || editingProduct?.productName || "—"}</div>
                    <div style={{ fontSize: "0.65rem", color: "rgba(229,226,225,0.4)", marginTop: "0.15rem" }}>
                      {selectedBoms.length > 1 ? `${selectedBoms.length} variants from BOM` : "Standalone"} · {selectedBoms.length} linked
                    </div>
                  </div>
                </div>
                <div style={{ fontSize: "0.6rem", color: "rgba(229,226,225,0.3)", marginTop: "0.35rem" }}>
                  Product link is locked. Newly added variants in <strong style={{ color: "rgba(229,226,225,0.5)" }}>Master Data → Product Creation</strong> auto-appear in this product&apos;s variants.
                </div>
              </div>
            ) : (
            <div style={{ marginBottom: "1rem" }}>
              <label style={{ fontSize: "0.78rem", fontWeight: 600, color: "rgba(229,226,225,0.7)", display: "block", marginBottom: "0.4rem" }}>Product</label>
              {errors.bom && <div style={{ ...errorSt, marginBottom: "0.5rem" }}>{errors.bom}</div>}
              <div style={{ position: "relative" }} ref={productGroupRef}>
                <input type="text"
                  style={{ ...inputSt, borderColor: errors.bom ? "rgba(239,68,68,0.6)" : "rgba(255,255,255,0.1)" }}
                  placeholder={allBoms.length === 0 ? "No products yet — create in Master Data" : "Select a product…"}
                  value={selectedGroupName || productGroupSearch}
                  readOnly={!!selectedGroupName}
                  onChange={(e) => { setProductGroupSearch(e.target.value); setProductGroupOpen(true); }}
                  onFocus={() => { if (!selectedGroupName) setProductGroupOpen(true); }}
                />
                {selectedGroupName ? (
                  <button type="button" onClick={() => { setSelectedBoms([]); setProductGroupSearch(""); setStorefrontName(""); }}
                    style={{ position: "absolute", right: "0.75rem", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "var(--gray)", cursor: "pointer", fontSize: "1rem", lineHeight: 1 }}>×</button>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--gray)" strokeWidth="2" style={{ position: "absolute", right: "0.75rem", top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}>
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                )}
                {productGroupOpen && !selectedGroupName && (
                  <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, background: "var(--dark2,#1a1a1a)", border: "1px solid var(--border)", borderRadius: "10px", zIndex: 200, maxHeight: "220px", overflowY: "auto", boxShadow: "0 8px 24px rgba(0,0,0,0.5)" }}>
                    {productGroupNames.length === 0 ? (
                      <div style={{ padding: "1rem", color: "var(--gray)", fontSize: "0.82rem", textAlign: "center" }}>No products found. Go to Master Data → Product Creation.</div>
                    ) : (
                      productGroupNames
                        .filter((g) => !productGroupSearch || g.toLowerCase().includes(productGroupSearch.toLowerCase()))
                        .map((g) => {
                          const grpData = productGroupMap[g];
                          const isMulti = grpData.boms.length > 1;
                          return (
                            <button key={g} type="button"
                              onClick={() => {
                                const bomsInGroup = productGroupMap[g].boms.map((b) => ({ bom: b, label: b.productName !== g ? b.productName : "" }));
                                setSelectedBoms(bomsInGroup);
                                setStorefrontName(g);
                                setCategory(productGroupMap[g].category || "");
                                setProductGroupOpen(false);
                                setProductGroupSearch("");
                                setErrors((p) => ({ ...p, bom: undefined }));
                              }}
                              style={{ width: "100%", textAlign: "left", background: "none", border: "none", padding: "0.7rem 1rem", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between" }}
                              onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.04)"}
                              onMouseLeave={(e) => e.currentTarget.style.background = "none"}>
                              <div>
                                <div style={{ fontSize: "0.875rem", fontWeight: 600, color: "#E5E2E1" }}>{g}</div>
                                <div style={{ fontSize: "0.68rem", color: "var(--gray)", marginTop: "0.1rem" }}>{grpData.category || "No category"} · {grpData.boms.length > 1 ? `${grpData.boms.length} variants` : "Standalone"}</div>
                              </div>
                              <span style={{ fontSize: "0.68rem", color: isMulti ? "#D4A843" : "var(--gray)", fontWeight: isMulti ? 700 : 400, flexShrink: 0, marginLeft: "0.5rem" }}>
                                {isMulti ? `${grpData.boms.length} variants` : "Standalone"}
                              </span>
                            </button>
                          );
                        })
                    )}
                  </div>
                )}
              </div>
              <div style={{ fontSize: "0.6rem", color: "rgba(229,226,225,0.3)", marginTop: "0.35rem" }}>
                Products are defined in <strong style={{ color: "rgba(229,226,225,0.5)" }}>Master Data → Product Creation</strong>
              </div>
            </div>
            )}

            {selectedBoms.length > 0 && (
              <div style={{ marginBottom: "1rem" }}>
                <label style={{ fontSize: "0.78rem", fontWeight: 600, color: "rgba(229,226,225,0.7)", display: "block", marginBottom: "0.4rem" }}>Storefront Name</label>
                <input type="text" style={{ ...inputSt, borderColor: errors.name ? "rgba(239,68,68,0.6)" : "rgba(255,255,255,0.1)" }}
                  value={storefrontName} onChange={(e) => { setStorefrontName(e.target.value); setErrors((p) => ({ ...p, name: undefined })); }}
                  placeholder="e.g. Custom Mugs" maxLength={100} />
                {errors.name && <div style={errorSt}>{errors.name}</div>}
              </div>
            )}

            <div>
              <label style={{ fontSize: "0.78rem", fontWeight: 600, color: "rgba(229,226,225,0.7)", display: "block", marginBottom: "0.4rem" }}>Description</label>
              <textarea style={{ ...inputSt, minHeight: "120px", resize: "vertical" }}
                value={description} onChange={(e) => setDescription(e.target.value)}
                placeholder="Materials, printing method, available sizes, customization options…" maxLength={1000} />
            </div>
          </Card>

          {/* Media */}
          <Card>
            <SectionTitle>Media</SectionTitle>

            {/* Image grid — Shopify-style */}
            <div
              onDrop={(e) => { e.preventDefault(); if (e.dataTransfer.files?.length) handleNewFiles(e.dataTransfer.files); }}
              onDragOver={(e) => e.preventDefault()}
              style={{ display: "flex", flexWrap: "wrap", gap: "0.625rem", minHeight: mediaItems.length ? undefined : "140px", alignItems: mediaItems.length ? "flex-start" : "center", justifyContent: mediaItems.length ? "flex-start" : "center", border: mediaItems.length ? "none" : "2px dashed rgba(255,255,255,0.1)", borderRadius: "10px", padding: mediaItems.length ? 0 : "1.5rem", background: mediaItems.length ? "transparent" : "rgba(255,255,255,0.02)" }}
            >
              {mediaItems.length === 0 ? (
                <div style={{ textAlign: "center", width: "100%" }}>
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="rgba(212,168,67,0.35)" strokeWidth="1.5" style={{ margin: "0 auto 0.625rem", display: "block" }}>
                    <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="M21 15l-5-5L5 21" />
                  </svg>
                  <div style={{ display: "flex", gap: "0.75rem", justifyContent: "center", marginBottom: "0.5rem" }}>
                    <button type="button" onClick={() => document.getElementById("ap-media").click()}
                      style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: "8px", padding: "0.45rem 1rem", color: "#E5E2E1", fontSize: "0.8rem", cursor: "pointer", fontWeight: 600 }}>
                      Upload new
                    </button>
                    {existingImages.length > 0 && (
                      <button type="button" onClick={() => setShowSelectModal(true)}
                        style={{ background: "none", border: "none", color: "var(--gray)", fontSize: "0.8rem", cursor: "pointer" }}>
                        Select existing
                      </button>
                    )}
                  </div>
                  <div style={{ fontSize: "0.68rem", color: "rgba(229,226,225,0.25)" }}>Accepts images · First image is the thumbnail</div>
                </div>
              ) : (
                <>
                  {mediaItems.map((item, idx) => (
                    <div key={item.id} style={{ position: "relative", width: 108, height: 108, borderRadius: "8px", overflow: "visible", flexShrink: 0 }}>
                      <img src={item.preview} alt="" style={{ width: 108, height: 108, objectFit: "cover", borderRadius: "8px", display: "block", border: idx === 0 ? "2px solid #D4A843" : "1px solid rgba(255,255,255,0.1)" }} />
                      {idx === 0 && (
                        <div style={{ position: "absolute", bottom: -8, left: "50%", transform: "translateX(-50%)", fontSize: "0.52rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", background: "#D4A843", color: "#1a1814", borderRadius: "4px", padding: "0.1rem 0.4rem", whiteSpace: "nowrap" }}>Thumbnail</div>
                      )}
                      <button type="button" onClick={() => setMediaItems((p) => p.filter((_, i) => i !== idx))}
                        style={{ position: "absolute", top: -6, right: -6, width: 20, height: 20, borderRadius: "50%", background: "rgba(15,14,12,0.9)", border: "1px solid rgba(255,255,255,0.2)", color: "#E5E2E1", cursor: "pointer", fontSize: "0.75rem", display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1 }}>×</button>
                    </div>
                  ))}

                  {/* Add more button */}
                  <div style={{ position: "relative" }}>
                    <button type="button" onClick={() => setShowMediaModal((p) => !p)}
                      style={{ width: 108, height: 108, borderRadius: "8px", border: "2px dashed rgba(255,255,255,0.14)", background: "rgba(255,255,255,0.02)", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "0.3rem", color: "var(--gray)" }}>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14" /></svg>
                      <span style={{ fontSize: "0.62rem" }}>Add media</span>
                    </button>
                    {showMediaModal && (
                      <div style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, zIndex: 200, background: "#1c1b18", border: "1px solid var(--border)", borderRadius: "10px", minWidth: "160px", boxShadow: "0 8px 24px rgba(0,0,0,0.6)", overflow: "hidden" }}>
                        <button type="button" onClick={() => { document.getElementById("ap-media").click(); setShowMediaModal(false); }}
                          style={{ width: "100%", textAlign: "left", background: "none", border: "none", padding: "0.75rem 1rem", color: "#E5E2E1", fontSize: "0.85rem", cursor: "pointer", fontWeight: 600 }}
                          onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.04)"}
                          onMouseLeave={(e) => e.currentTarget.style.background = "none"}>
                          Upload new
                        </button>
                        {existingImages.length > 0 && (
                          <button type="button" onClick={() => { setShowSelectModal(true); setShowMediaModal(false); }}
                            style={{ width: "100%", textAlign: "left", background: "none", border: "none", borderTop: "1px solid rgba(255,255,255,0.06)", padding: "0.75rem 1rem", color: "#E5E2E1", fontSize: "0.85rem", cursor: "pointer" }}
                            onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.04)"}
                            onMouseLeave={(e) => e.currentTarget.style.background = "none"}>
                            Select existing
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
            <input id="ap-media" type="file" accept="image/*" multiple style={{ display: "none" }} onChange={(e) => { if (e.target.files?.length) handleNewFiles(e.target.files); }} />
          </Card>

          {/* Variants — Shopify style, per-variant image */}
          {selectedBoms.length > 0 && (
            <Card>
              <SectionTitle>Variants</SectionTitle>
              <div style={{ display: "flex", flexDirection: "column" }}>
                {selectedBoms.map(({ bom }, i) => {
                  const mp = maxProducible[bom.id] ?? 0;
                  const vImg = variantImages[bom.id];
                  const floor = maxCostMap[bom.id] || 0;
                  return (
                    <div key={bom.id} style={{ display: "flex", alignItems: "center", gap: "1rem", padding: "0.75rem 0", borderTop: i > 0 ? "1px solid rgba(255,255,255,0.06)" : "none" }}>
                      {/* Per-variant image slot */}
                      <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", gap: "4px", alignItems: "center", position: "relative" }}>
                        <label title="Click to upload variant image"
                          style={{ width: 64, height: 64, borderRadius: "8px", overflow: "hidden", border: vImg ? "2px solid #D4A843" : "1px dashed rgba(255,255,255,0.2)", background: "rgba(255,255,255,0.03)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
                          {vImg ? (
                            <img src={vImg.preview || vImg.url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                          ) : (
                            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="rgba(212,168,67,0.3)" strokeWidth="1.5">
                              <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="M21 15l-5-5L5 21" />
                            </svg>
                          )}
                          <input type="file" accept="image/*" style={{ display: "none" }}
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) setVariantImages((p) => ({ ...p, [bom.id]: { file, preview: URL.createObjectURL(file) } }));
                              e.target.value = "";
                            }} />
                        </label>
                        {existingImages.length > 0 && (
                          <button type="button"
                            onClick={() => setVariantImgDropdown(variantImgDropdown === bom.id ? null : bom.id)}
                            style={{ fontSize: "0.58rem", color: "var(--gray)", background: "none", border: "none", cursor: "pointer", padding: "0", textDecoration: "underline", lineHeight: 1 }}>
                            select
                          </button>
                        )}
                        {variantImgDropdown === bom.id && (
                          <div onClick={(e) => e.stopPropagation()} style={{ position: "absolute", top: "100%", left: 0, zIndex: 300, background: "#1c1b18", border: "1px solid var(--border)", borderRadius: "10px", padding: "0.5rem", width: "200px", maxHeight: "180px", overflowY: "auto", boxShadow: "0 8px 24px rgba(0,0,0,0.6)" }}>
                            <div style={{ fontSize: "0.65rem", color: "var(--gray)", marginBottom: "0.4rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Existing images</div>
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "4px" }}>
                              {existingImages.map((img) => (
                                <button key={img.id} type="button"
                                  onClick={() => { setVariantImages((p) => ({ ...p, [bom.id]: { url: img.url, preview: img.url } })); setVariantImgDropdown(null); }}
                                  style={{ width: "100%", aspectRatio: "1/1", padding: 0, border: "1px solid rgba(255,255,255,0.1)", borderRadius: "4px", overflow: "hidden", cursor: "pointer", background: "none" }}>
                                  <img src={img.url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                      {/* Variant info */}
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, color: "#E5E2E1", fontSize: "0.875rem" }}>{bom.productName}</div>
                        <div style={{ fontSize: "0.7rem", color: "var(--gray)", marginTop: "0.2rem" }}>
                          Floor ₱{floor.toFixed(2)} &nbsp;·&nbsp;
                          <span style={{ color: mp > 0 ? "#22c55e" : "#ef4444", fontWeight: 600 }}>{mp} units</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}

          {/* Pricing */}
          {selectedBoms.length > 0 && <Card>
            <SectionTitle>Pricing</SectionTitle>
            {errors.price && <div style={{ ...errorSt, marginBottom: "0.75rem", padding: "0.5rem 0.75rem", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: "6px" }}>{errors.price}</div>}

            <div className="price-type-row" style={{ marginBottom: "1.25rem" }}>
              {[{ val: "fixed", label: "Fixed Price" }, { val: "tiered", label: "Tier Price" }].map(({ val, label }) => (
                <button key={val} type="button" className={`price-type-btn${priceType === val ? " selected" : ""}`} onClick={() => setPriceType(val)}>{label}</button>
              ))}
            </div>

            {priceType === "fixed" && (
              isStandalone ? (
                <div>
                  <div style={{ fontSize: "0.75rem", color: "var(--gray)", marginBottom: "0.5rem" }}>
                    BOM unit cost: <strong style={{ color: "#D4A843" }}>₱{(maxCostMap[primaryBom?.id] || 0).toFixed(2)}/unit</strong>
                  </div>
                  <div className="tier-price-cell">
                    <span className="peso">₱</span>
                    <NumberInput className="tier-input" value={variantPrices[primaryBom?.id] || ""} onChange={(e) => setVariantPrices((p) => ({ ...p, [primaryBom.id]: sanitizeNumber(e.target.value) }))} placeholder="0" min={0} max={999999} step="0.01" />
                  </div>
                  {priceWarnings[primaryBom?.id] && <div style={{ marginTop: "0.4rem", fontSize: "0.78rem", color: "#f87171" }}>⚠ {priceWarnings[primaryBom.id]}</div>}
                </div>
              ) : (
                <div className="tier-table-wrap">
                  <table className="tier-table">
                    <thead><tr><th>Variant</th><th>BOM Cost</th><th>Your Price (₱)</th><th>Margin</th></tr></thead>
                    <tbody>
                      {selectedBoms.map(({ bom, label }) => {
                        const cost = maxCostMap[bom.id] || 0;
                        const price = parseFloat(variantPrices[bom.id]);
                        const hasP = variantPrices[bom.id] !== "" && !isNaN(price);
                        const margin = hasP ? price - cost : null;
                        return (
                          <tr key={bom.id}>
                            <td style={{ fontWeight: 600, color: "#E5E2E1" }}>{label || bom.productName}</td>
                            <td style={{ color: "#D4A843", fontWeight: 700 }}>₱{cost.toFixed(2)}</td>
                            <td><div className="tier-price-cell"><span className="peso">₱</span><NumberInput className="tier-input" value={variantPrices[bom.id] || ""} onChange={(e) => setVariantPrices((p) => ({ ...p, [bom.id]: sanitizeNumber(e.target.value) }))} placeholder="0" min={0} max={999999} step="0.01" /></div></td>
                            <td>{margin !== null && <span style={{ fontSize: "0.78rem", fontWeight: 600, color: margin < 0 ? "#f87171" : "#22c55e" }}>{margin < 0 ? `-₱${Math.abs(margin).toFixed(2)}` : `+₱${margin.toFixed(2)}`}</span>}</td>
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
                    Cells in red are priced below BOM cost.
                  </div>
                )}
                <div className="tier-table-wrap">
                  <table className="tier-table smart-tier-table">
                    <thead>
                      <tr>
                        <th>Tier</th><th>Min Qty</th><th>Max Qty</th>
                        {isStandalone ? (
                          <th>Price (₱)<div style={{ fontSize: "0.6rem", color: "#D4A843", fontWeight: 600 }}>BOM unit cost ₱{(maxCostMap[primaryBom?.id] || 0).toFixed(2)}</div></th>
                        ) : (
                          selectedBoms.map(({ bom, label }) => (
                            <th key={bom.id} className="tier-variant-header">{label || bom.productName}<div style={{ fontSize: "0.6rem", color: "#D4A843", fontWeight: 600 }}>BOM unit cost ₱{(maxCostMap[bom.id] || 0).toFixed(2)}</div></th>
                          ))
                        )}
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {tiers.map((tier, idx) => (
                        <tr key={tier.id}>
                          <td><span className="tier-badge">Tier {idx + 1}</span></td>
                          <td><NumberInput className="tier-input" value={tier.minQty ?? ""} placeholder="1" min={0} max={99999} onChange={(e) => updateTierRange(tier.id, "minQty", e.target.value)} /></td>
                          <td><NumberInput className="tier-input" value={tier.maxQty ?? ""} placeholder="∞" min={0} max={99999} onChange={(e) => updateTierRange(tier.id, "maxQty", e.target.value)} /></td>
                          {isStandalone ? (
                            <td style={{ background: tierWarnings[`${tier.id}___base__`] ? "rgba(239,68,68,0.07)" : undefined }}>
                              <div className="tier-price-cell">
                                <span className="peso" style={{ color: tierWarnings[`${tier.id}___base__`] ? "#f87171" : undefined }}>₱</span>
                                <NumberInput className="tier-input" value={tier.prices["__base__"] || ""} onChange={(e) => updateTierPrice(tier.id, "__base__", sanitizeNumber(e.target.value))} placeholder="0" min={0} max={999999} step="0.01" />
                              </div>
                            </td>
                          ) : (
                            selectedBoms.map(({ bom }) => {
                              const wkey = `${tier.id}_${bom.id}`;
                              return (
                                <td key={bom.id} style={{ background: tierWarnings[wkey] ? "rgba(239,68,68,0.07)" : undefined }}>
                                  <div className="tier-price-cell">
                                    <span className="peso" style={{ color: tierWarnings[wkey] ? "#f87171" : undefined }}>₱</span>
                                    <NumberInput className="tier-input" value={tier.prices[bom.id] || ""} onChange={(e) => updateTierPrice(tier.id, bom.id, sanitizeNumber(e.target.value))} placeholder="0" min={0} max={999999} step="0.01" />
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
          </Card>}

          {/* Inventory / Stock */}
          {selectedBoms.length > 0 && !isMadeToOrder && (
            <Card>
              <SectionTitle>Inventory</SectionTitle>
              {isStandalone ? (
                <div>
                  <div style={{ fontSize: "0.8rem", color: "var(--gray)", marginBottom: "0.75rem" }}>
                    Max producible from current stock: <strong style={{ color: "#E5E2E1" }}>{maxProducible[primaryBom?.id] ?? 0} units</strong>
                  </div>
                  <label style={{ fontSize: "0.78rem", fontWeight: 600, color: "rgba(229,226,225,0.7)", display: "block", marginBottom: "0.4rem" }}>Storefront Stock</label>
                  <NumberInput className="form-input"
                    value={stockMap[primaryBom?.id] ?? String(maxProducible[primaryBom?.id] ?? 0)}
                    onChange={(e) => { const val = e.target.value; if (parseInt(val) > (maxProducible[primaryBom?.id] ?? 0)) return; setStockMap((p) => ({ ...p, [primaryBom.id]: val })); }}
                    placeholder="0" min={0} max={maxProducible[primaryBom?.id] ?? 0} />
                </div>
              ) : (
                <div className="tier-table-wrap">
                  <table className="tier-table">
                    <thead><tr><th>Variant</th><th>Max Producible</th><th>Storefront Stock</th></tr></thead>
                    <tbody>
                      {selectedBoms.map(({ bom, label }) => (
                        <tr key={bom.id}>
                          <td style={{ fontWeight: 600, color: "#E5E2E1" }}>{label || bom.productName}</td>
                          <td style={{ color: maxProducible[bom.id] === 0 ? "#ef4444" : "#E5E2E1", fontWeight: 600 }}>{maxProducible[bom.id]} units</td>
                          <td>
                            <NumberInput className="tier-input"
                              value={stockMap[bom.id] ?? ""}
                              onChange={(e) => { const val = e.target.value; if (parseInt(val) > (maxProducible[bom.id] ?? 0)) return; setStockMap((p) => ({ ...p, [bom.id]: val })); }}
                              placeholder="0" min={0} max={maxProducible[bom.id] ?? 0} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          )}
        </div>

        {/* ═══ RIGHT SIDEBAR ═════════════════════════════════════════════════ */}
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem", position: "sticky", top: "70px" }}>

          {/* Storefront Preview */}
          <Card>
            <ProductCardPreview
              name={storefrontName}
              category={category}
              priceRange={priceRangeText}
              variantCount={selectedBoms.length}
              thumbnail={mediaItems[0]?.preview}
              isCustom={isCustomizable}
            />
          </Card>

          {/* Status */}
          {selectedBoms.length > 0 && <Card>
            <div style={{ fontSize: "0.78rem", fontWeight: 600, color: "rgba(229,226,225,0.7)", marginBottom: "0.625rem" }}>Status</div>
            <div style={{ position: "relative" }}>
              <select value={isPublished ? "active" : "draft"} onChange={(e) => setIsPublished(e.target.value === "active")}
                style={{ ...inputSt, appearance: "none", paddingRight: "2.5rem", cursor: "pointer" }}>
                <option value="active">Active (Published)</option>
                <option value="draft">Draft (Hidden)</option>
              </select>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ position: "absolute", right: "0.75rem", top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: "var(--gray)" }}>
                <path d="M6 9l6 6 6-6" />
              </svg>
            </div>
          </Card>}

          {/* Category */}
          {selectedBoms.length > 0 && <Card>
            <div style={{ fontSize: "0.78rem", fontWeight: 600, color: "rgba(229,226,225,0.7)", marginBottom: "0.625rem" }}>Category</div>
            <div style={{ position: "relative" }} ref={catRef}>
              <input type="text" style={{ ...inputSt, borderColor: errors.category ? "rgba(239,68,68,0.6)" : "rgba(255,255,255,0.1)" }}
                value={category} onChange={(e) => { setCategory(e.target.value); setCatOpen(true); setErrors((p) => ({ ...p, category: undefined })); }}
                onFocus={() => setCatOpen(true)}
                placeholder="e.g. Mugs, Stickers…" maxLength={50} />
              {catOpen && (existingCategories.some((c) => c.toLowerCase().includes(category.toLowerCase())) || category) && (
                <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, background: "var(--dark2,#1a1a1a)", border: "1px solid var(--border)", borderRadius: "10px", zIndex: 100, maxHeight: "160px", overflowY: "auto" }}>
                  {existingCategories.filter((c) => c.toLowerCase().includes(category.toLowerCase())).map((c) => (
                    <button key={c} type="button" onClick={() => { setCategory(c); setCatOpen(false); }}
                      style={{ width: "100%", textAlign: "left", background: "none", border: "none", padding: "0.6rem 1rem", color: "#E5E2E1", fontSize: "0.85rem", cursor: "pointer" }}
                      onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.04)"}
                      onMouseLeave={(e) => e.currentTarget.style.background = "none"}>{c}</button>
                  ))}
                  {category && !existingCategories.find((c) => c.toLowerCase() === category.toLowerCase()) && (
                    <button type="button" onClick={() => setCatOpen(false)}
                      style={{ width: "100%", textAlign: "left", background: "none", border: "none", borderTop: existingCategories.length ? "1px solid rgba(255,255,255,0.06)" : "none", padding: "0.6rem 1rem", color: "#D4A843", fontSize: "0.78rem", cursor: "pointer", fontWeight: 700 }}
                      onMouseEnter={(e) => e.currentTarget.style.background = "rgba(212,168,67,0.06)"}
                      onMouseLeave={(e) => e.currentTarget.style.background = "none"}>
                      + Use &ldquo;{category}&rdquo;
                    </button>
                  )}
                </div>
              )}
            </div>
            {errors.category && <div style={errorSt}>{errors.category}</div>}
          </Card>}

          {/* Product Options */}
          {selectedBoms.length > 0 && <Card>
            <SectionTitle>Options</SectionTitle>
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <Toggle
                on={isMadeToOrder}
                onChange={setIsMadeToOrder}
                disabled={allZeroStock}
                label="Made to Order"
                hint={allZeroStock
                  ? "No stock available — automatically set to made to order."
                  : isMadeToOrder
                    ? "Publish with 0 stock — fulfill on demand."
                    : "Stock capped to what you can currently produce."}
              />
              <div style={{ height: "1px", background: "rgba(255,255,255,0.06)" }} />
              <Toggle
                on={isCustomizable}
                onChange={setIsCustomizable}
                label="Customizable"
                hint={isCustomizable
                  ? "Customer must upload a design file to order."
                  : "Finished product — no customer design required."}
              />
            </div>
          </Card>}
        </div>
      </div>

      {showSelectModal && (
        <div style={{ position: "fixed", inset: 0, zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.72)", backdropFilter: "blur(4px)" }}
          onClick={(e) => { if (e.target === e.currentTarget) { setShowSelectModal(false); setSelectedInSelect(new Set()); } }}>
          <div style={{ background: "#1c1b18", border: "1px solid var(--border)", borderRadius: "16px", width: "min(820px, 92vw)", maxHeight: "82vh", display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 24px 64px rgba(0,0,0,0.7)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "1rem 1.25rem", borderBottom: "1px solid var(--border)" }}>
              <div style={{ fontWeight: 700, color: "#E5E2E1", fontSize: "0.95rem" }}>Select file</div>
              <button type="button" onClick={() => { setShowSelectModal(false); setSelectedInSelect(new Set()); }}
                style={{ background: "none", border: "none", color: "var(--gray)", cursor: "pointer", fontSize: "1.25rem", lineHeight: 1, padding: "0.25rem" }}>×</button>
            </div>

            <div style={{ padding: "0.875rem 1.25rem", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              <div style={{ position: "relative" }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--gray)" strokeWidth="2" style={{ position: "absolute", left: "0.75rem", top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}>
                  <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
                </svg>
                <input type="text" placeholder="Search files…" value={selectSearch} onChange={(e) => setSelectSearch(e.target.value)}
                  style={{ width: "100%", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px", padding: "0.55rem 0.75rem 0.55rem 2.25rem", color: "#E5E2E1", fontSize: "0.85rem", outline: "none", boxSizing: "border-box" }} />
              </div>
            </div>

            <div style={{ margin: "0.875rem 1.25rem 0", border: "2px dashed rgba(255,255,255,0.12)", borderRadius: "10px", padding: "1rem", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.75rem", background: "rgba(255,255,255,0.02)" }}>
              <button type="button" onClick={() => { document.getElementById("ap-media").click(); setShowSelectModal(false); setSelectedInSelect(new Set()); }}
                style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: "8px", padding: "0.45rem 1rem", color: "#E5E2E1", fontSize: "0.82rem", cursor: "pointer", fontWeight: 600 }}>
                Add media
              </button>
              <span style={{ fontSize: "0.75rem", color: "var(--gray)" }}>Drag and drop images and files</span>
            </div>

            <div style={{ flex: 1, overflowY: "auto", padding: "0.875rem 1.25rem 1rem" }}>
              {existingImages.length === 0 ? (
                <div style={{ textAlign: "center", padding: "3rem", color: "var(--gray)", fontSize: "0.85rem" }}>No existing images found.</div>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: "0.75rem" }}>
                  {existingImages
                    .filter((img) => !selectSearch || img.label.toLowerCase().includes(selectSearch.toLowerCase()) || img.url.toLowerCase().includes(selectSearch.toLowerCase()))
                    .map((img) => {
                      const isSel = selectedInSelect.has(img.url);
                      return (
                        <button key={img.id} type="button"
                          onClick={() => setSelectedInSelect((p) => { const n = new Set(p); isSel ? n.delete(img.url) : n.add(img.url); return n; })}
                          style={{ position: "relative", background: "none", border: `2px solid ${isSel ? "#D4A843" : "rgba(255,255,255,0.08)"}`, borderRadius: "8px", padding: 0, cursor: "pointer", overflow: "hidden", transition: "border-color 0.15s", aspectRatio: "1" }}>
                          <img src={img.url} alt={img.label} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                          {isSel && (
                            <div style={{ position: "absolute", top: "0.35rem", right: "0.35rem", width: 20, height: 20, borderRadius: "50%", background: "#D4A843", display: "flex", alignItems: "center", justifyContent: "center" }}>
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#1a1814" strokeWidth="3.5"><path d="M20 6L9 17l-5-5" /></svg>
                            </div>
                          )}
                          {img.label && (
                            <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "linear-gradient(transparent, rgba(0,0,0,0.8))", padding: "1rem 0.35rem 0.35rem", fontSize: "0.58rem", color: "rgba(255,255,255,0.8)", textAlign: "left", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{img.label}</div>
                          )}
                        </button>
                      );
                    })}
                </div>
              )}
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.625rem", padding: "0.875rem 1.25rem", borderTop: "1px solid var(--border)" }}>
              <span style={{ flex: 1, fontSize: "0.78rem", color: "var(--gray)", alignSelf: "center" }}>
                {selectedInSelect.size > 0 ? `${selectedInSelect.size} file${selectedInSelect.size > 1 ? "s" : ""} selected` : ""}
              </span>
              <button type="button" onClick={() => { setShowSelectModal(false); setSelectedInSelect(new Set()); }}
                style={{ background: "none", border: "1px solid var(--border)", borderRadius: "8px", padding: "0.5rem 1rem", color: "var(--gray)", fontSize: "0.85rem", cursor: "pointer" }}>
                Cancel
              </button>
              <button type="button" onClick={handleSelectExisting} disabled={selectedInSelect.size === 0}
                style={{ background: selectedInSelect.size > 0 ? "#D4A843" : "rgba(255,255,255,0.1)", border: "none", borderRadius: "8px", padding: "0.5rem 1.25rem", color: selectedInSelect.size > 0 ? "#1a1814" : "var(--gray)", fontSize: "0.85rem", fontWeight: 700, cursor: selectedInSelect.size > 0 ? "pointer" : "default" }}>
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
