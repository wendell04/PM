'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

// ── TODO (MongoDB): palitan ng import ng API functions pag may DB na
// import { getCategories, saveCategory, saveSubCategory, saveProduct } from '@/lib/productStorage';

// ─── Combobox ──────────────────────────────────────────────────────────────────
function Combobox({ value, onChange, options, placeholder, label, required }) {
  const [open, setOpen] = useState(false);
  const [inputVal, setInputVal] = useState(value || '');
  const ref = useRef(null);

  useEffect(() => { setInputVal(value || ''); }, [value]);

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = options.filter(o =>
    o.toLowerCase().includes((inputVal || '').toLowerCase())
  );
  const showAdd = inputVal && !options.find(o => o.toLowerCase() === inputVal.toLowerCase());
  const select = (val) => { setInputVal(val); onChange(val); setOpen(false); };

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
          onChange={e => { setInputVal(e.target.value); onChange(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
        />
        <button type="button" className="combobox-toggle" onClick={() => setOpen(o => !o)}>
          {open ? '▲' : '▼'}
        </button>
      </div>
      {open && (filtered.length > 0 || showAdd) && (
        <div className="combobox-menu">
          {filtered.map((opt, i) => (
            <button
              key={i}
              type="button"
              className={`combobox-item${opt === value ? ' active' : ''}`}
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
              ➕ Add "{inputVal}"
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Helper ────────────────────────────────────────────────────────────────────
function comboLabel(combo) {
  return Object.values(combo).join(' / ');
}

// ─── Product Preview Modal ─────────────────────────────────────────────────────
function ProductPreviewModal({ product, onClose }) {
  const allPrices = product.tiers
    .flatMap(t => Object.values(t.prices).map(p => parseFloat(p)).filter(p => p > 0));
  const minP = allPrices.length ? Math.min(...allPrices) : null;
  const maxP = allPrices.length ? Math.max(...allPrices) : null;

  return (
    <div className="preview-overlay" onClick={onClose}>
      <div className="preview-modal" onClick={e => e.stopPropagation()}>
        <div className="preview-modal-header">
          <h3 className="preview-modal-title">Storefront Preview</h3>
          <p className="preview-modal-subtitle">Ganito makikita ng customer ang product</p>
          <button type="button" className="preview-close" onClick={onClose}>×</button>
        </div>

        <div className="preview-modal-body">

          <div className="preview-section">
            <p className="preview-section-label">Product Card</p>
            <div className="preview-card-wrap">
              <div className="preview-product-card">
                <div className="preview-card-image">
                  {product.thumbnail ? (
                    <img src={product.thumbnail} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <div className="preview-no-image">No Thumbnail</div>
                  )}
                  {product.priceType === 'inquiry' && (
                    <span className="preview-inquiry-badge">For Inquiry</span>
                  )}
                </div>
                <div className="preview-card-info">
                  <p className="preview-card-category">
                    {product.category}
                  </p>
                  <h4 className="preview-card-name">{product.subCategoryName || product.productName || product.category}</h4>
                  <p className="preview-card-desc">{product.description || '—'}</p>
                  <div className="preview-card-footer">
                    <div>
                      {product.priceType === 'inquiry' ? (
                        <span className="preview-price-inquiry">For Inquiry</span>
                      ) : minP ? (
                        <span className="preview-price">
                          ₱{minP}{maxP !== minP ? ` – ₱${maxP}` : ''} <span className="preview-price-unit">per item</span>
                        </span>
                      ) : (
                        <span className="preview-price-tbd">Price TBD</span>
                      )}
                    </div>
                    <button type="button" className="preview-add-btn">+ Add</button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {product.priceType === 'fixed' && product.tiers.length > 0 && (
            <div className="preview-section">
              <p className="preview-section-label">Pricing Tiers</p>
              <div className="preview-tiers">
                {product.tiers.map((tier, i) => (
                  <div key={tier.id} className="preview-tier-row">
                    <span className="preview-tier-badge">Tier {i + 1}</span>
                    <span className="preview-tier-range">
                      {tier.minQty || '?'} – {tier.maxQty || '∞'} pcs
                    </span>
                    {product.combinations.length > 0 ? (
                      <div className="preview-tier-variants">
                        {product.combinations.map(c => (
                          <span key={c.id} className="preview-tier-variant-price">
                            {c.label}: ₱{tier.prices[c.id] || '—'}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="preview-tier-price">₱{tier.prices['__base__'] || '—'}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {product.combinations.length > 0 && (
            <div className="preview-section">
              <p className="preview-section-label">Variants ({product.combinations.length} combinations)</p>
              <div className="preview-variants-wrap">
                {product.variantGroups.map(g => (
                  <div key={g.id} className="preview-variant-group">
                    <span className="preview-variant-group-name">{g.name || 'Unnamed'}:</span>
                    {g.options.map(o => (
                      <span key={o.id} className="preview-variant-chip">{o.value}</span>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="preview-section">
            <p className="preview-section-label">Availability</p>
            <div className="preview-stock-status">
              {!product.trackInventory ? (
                <span className="preview-stock-badge upon-order">⚡ Upon Order / Supplied</span>
              ) : product.stock === 0 ? (
                <span className="preview-stock-badge out-of-stock">Out of Stock</span>
              ) : product.stock <= 10 ? (
                <span className="preview-stock-badge low-stock">Low Stock — {product.stock} pcs left</span>
              ) : (
                <span className="preview-stock-badge in-stock">In Stock — {product.stock} pcs</span>
              )}
            </div>
          </div>

        </div>

        <div className="preview-modal-footer">
          <button type="button" className="btn-cancel" onClick={onClose}>Close Preview</button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function AddProductsPage() {
  const router = useRouter();

  const [formData, setFormData] = useState({
    category: '',
    subCategoryCode: '',    // auto-generated mula sa sub-category name initials e.g. VSW
    subCategoryName: '',    // ito na rin ang product display name sa storefront
    description: '',
    priceType: 'fixed',
    trackInventory: true,
    stock: '',
  });

  const [tiers, setTiers] = useState([
    { id: 1, minQty: 1, maxQty: 20, prices: { '__base__': '' } },
  ]);

  const [variantGroups, setVariantGroups] = useState([]);
  const [optionInputs, setOptionInputs] = useState({});
  const [combinations, setCombinations] = useState([]);

  const [thumbnail, setThumbnail] = useState(null);
  const [images, setImages] = useState([]);
  const [dragOver, setDragOver] = useState(false);
  const [dragOverThumb, setDragOverThumb] = useState(false);

  const [savedCategories, setSavedCategories] = useState([]);
  const [savedSubCategories, setSavedSubCategories] = useState({});
  const [showPreview, setShowPreview] = useState(false);



  // ── naka local storage lng — palitan ng GET /api/categories pag may MongoDB na ──
  useEffect(() => {
    setSavedCategories(JSON.parse(localStorage.getItem('customCategories') || '[]'));
    setSavedSubCategories(JSON.parse(localStorage.getItem('subCategories') || '{}'));
  }, []);

  const hasVariants = combinations.length > 0;
  const subCatOptions = savedSubCategories[formData.category] || [];

  const handleCategoryChange = (val) => {
    setFormData(prev => ({
      ...prev,
      category: val,
      subCategoryCode: '',
      subCategoryName: '',
    }));
    setVariantGroups([]);
    setCombinations([]);
    setOptionInputs({});
    setTiers([{ id: 1, minQty: 1, maxQty: 20, prices: { '__base__': '' } }]);
  };

  // Auto-generate SKU code from sub-category initials e.g. "Vinyl Sticker Waterproof" → "VSW"
  const handleSubCategoryChange = (val) => {
    const autoCode = val
      .split(' ')
      .filter(w => w.length > 0)
      .map(w => w[0])
      .join('')
      .toUpperCase()
      .slice(0, 8);

    setFormData(prev => ({
      ...prev,
      subCategoryName: val,
      subCategoryCode: autoCode,
    }));
  };

  const cartesian = (groups) => {
    const filled = groups.filter(g => g.options.length > 0);
    if (!filled.length) return [];
    return filled.reduce((acc, g) => {
      if (!acc.length) return g.options.map(o => ({ [g.id]: o.value }));
      return acc.flatMap(ex => g.options.map(o => ({ ...ex, [g.id]: o.value })));
    }, []);
  };

  const rebuildAll = (groups) => {
    const combos = cartesian(groups);
    if (combos.length === 0) {
      setCombinations([]);
      setTiers(prev => prev.map(t => ({
        ...t,
        prices: { '__base__': t.prices['__base__'] || '' },
      })));
      return;
    }
    const newCombos = combos.map(combo => ({
      id: JSON.stringify(combo),
      combo,
      label: comboLabel(combo),
    }));
    setCombinations(newCombos);
    setTiers(prev => prev.map(t => {
      const p = {};
      newCombos.forEach(c => { p[c.id] = t.prices[c.id] !== undefined ? t.prices[c.id] : ''; });
      return { ...t, prices: p };
    }));
  };

  const addGroup = () => {
    if (variantGroups.length >= 2) return;
    const g = { id: Date.now(), name: '', options: [] };
    setVariantGroups(prev => [...prev, g]);
    setOptionInputs(prev => ({ ...prev, [g.id]: '' }));
  };

  const removeGroup = (gid) => {
    const u = variantGroups.filter(g => g.id !== gid);
    setVariantGroups(u);
    rebuildAll(u);
  };

  const updateGroupName = (gid, name) =>
    setVariantGroups(variantGroups.map(g => g.id === gid ? { ...g, name } : g));

  const addOption = (gid) => {
    const val = (optionInputs[gid] || '').trim();
    if (!val) return;
    const u = variantGroups.map(g =>
      // image: null — pwedeng mag-upload ng preview photo per option (e.g. "With Box" → photo ng mug with box)
      g.id === gid ? { ...g, options: [...g.options, { id: Date.now(), value: val, image: null }] } : g
    );
    setVariantGroups(u);
    setOptionInputs(prev => ({ ...prev, [gid]: '' }));
    rebuildAll(u);
  };

  const removeOption = (gid, oid) => {
    const u = variantGroups.map(g =>
      g.id === gid ? { ...g, options: g.options.filter(o => o.id !== oid) } : g
    );
    setVariantGroups(u);
    rebuildAll(u);
  };

  // Upload image para sa isang specific variant option
  const handleOptionImageUpload = (gid, oid, file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      setVariantGroups(prev => prev.map(g =>
        g.id === gid
          ? { ...g, options: g.options.map(o => o.id === oid ? { ...o, image: e.target.result } : o) }
          : g
      ));
    };
    reader.readAsDataURL(file);
  };

  const removeOptionImage = (gid, oid) => {
    setVariantGroups(prev => prev.map(g =>
      g.id === gid
        ? { ...g, options: g.options.map(o => o.id === oid ? { ...o, image: null } : o) }
        : g
    ));
  };

  const addTier = () => {
    const last = tiers[tiers.length - 1];
    const emptyPrices = hasVariants
      ? combinations.reduce((acc, c) => ({ ...acc, [c.id]: '' }), {})
      : { '__base__': '' };
    setTiers(prev => [...prev, {
      id: Date.now(),
      minQty: last ? (parseInt(last.maxQty) || 0) + 1 : 1,
      maxQty: '',
      prices: emptyPrices,
    }]);
  };

  const removeTier = (id) => setTiers(tiers.filter(t => t.id !== id));

  const updateTierRange = (id, field, val) =>
    setTiers(tiers.map(t => t.id === id ? { ...t, [field]: val } : t));

  const updateTierPrice = (tierId, priceKey, val) =>
    setTiers(tiers.map(t =>
      t.id === tierId ? { ...t, prices: { ...t.prices, [priceKey]: val } } : t
    ));

  // ── Image upload handlers ──
  // ── naka local storage lng — blob: URL, palitan ng Cloudinary/S3 upload pag may MongoDB na ──
  const createImageObj = (file) => ({
    file,
    preview: URL.createObjectURL(file),
    id: Date.now() + Math.random(),
  });

  // Open cropper when thumbnail is uploaded
  const handleThumbnailUpload = (files) => {
    const file = files[0];
    if (!file) return;
    setThumbnail(createImageObj(file));
  };

  const handleThumbnailDrop = (e) => {
    e.preventDefault();
    setDragOverThumb(false);
    if (e.dataTransfer.files?.length) handleThumbnailUpload(e.dataTransfer.files);
  };

  const handleImageUpload = (files) =>
    setImages(prev => [...prev, ...Array.from(files).map(createImageObj)]);

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files?.length) handleImageUpload(e.dataTransfer.files);
  };

  const removeImage = (id) => setImages(images.filter(img => img.id !== id));

  const getStockStatus = (stock, trackInventory) => {
    if (!trackInventory) return { label: 'Upon Order', class: 'upon-order' };
    const s = parseInt(stock) || 0;
    if (s === 0) return { label: 'Out of Stock', class: 'out-of-stock' };
    if (s <= 10) return { label: `Low Stock (${s} pcs)`, class: 'low-stock' };
    return { label: `In Stock (${s} pcs)`, class: 'in-stock' };
  };

  const handleSubmit = (e) => {
    e.preventDefault();

    // ── naka local storage lng — palitan ng POST /api/categories pag may MongoDB na ──
    if (formData.category && !savedCategories.includes(formData.category)) {
      const updated = [...savedCategories, formData.category];
      setSavedCategories(updated);
      localStorage.setItem('customCategories', JSON.stringify(updated));
    }

    // ── naka local storage lng — palitan ng POST /api/subcategories pag may MongoDB na ──
    if (formData.category && formData.subCategoryName) {
      const existingSubs = savedSubCategories[formData.category] || [];
      if (!existingSubs.includes(formData.subCategoryName)) {
        const updatedSubs = {
          ...savedSubCategories,
          [formData.category]: [...existingSubs, formData.subCategoryName],
        };
        setSavedSubCategories(updatedSubs);
        localStorage.setItem('subCategories', JSON.stringify(updatedSubs));
      }
    }

    const stockVal = formData.trackInventory ? parseInt(formData.stock) || 0 : null;
    const stockStatus = getStockStatus(stockVal, formData.trackInventory);

    const newProduct = {
      id: Date.now(),
      category: formData.category,
      subCategoryCode: formData.subCategoryCode,
      subCategoryName: formData.subCategoryName,
      description: formData.description,
      priceType: formData.priceType,
      tiers,
      variantGroups,
      combinations,
      // ── naka local storage lng — blob: URLs, palitan ng permanent file URLs pag may MongoDB + Cloudinary/S3 na ──
      thumbnail: thumbnail?.preview || null,
      images: images.map(img => img.preview),
      trackInventory: formData.trackInventory,
      stock: stockVal,
      stockStatus: stockStatus.class,
      createdAt: new Date().toISOString(),
    };

    // ── naka local storage lng — palitan ng POST /api/products pag may MongoDB na ──
    const existing = JSON.parse(localStorage.getItem('products') || '[]');
    localStorage.setItem('products', JSON.stringify([...existing, newProduct]));

    alert('Product added successfully!');

    setFormData({
      category: '',
      subCategoryCode: '',
      subCategoryName: '',
      productName: '',
      description: '',
      priceType: 'fixed',
      trackInventory: true,
      stock: '',
    });
    setTiers([{ id: 1, minQty: 1, maxQty: 20, prices: { '__base__': '' } }]);
    setVariantGroups([]);
    setCombinations([]);
    setThumbnail(null);
    setImages([]);
  };

  const allPrices = tiers
    .flatMap(t => Object.values(t.prices).map(p => parseFloat(p)).filter(p => p > 0));
  const minP = allPrices.length ? Math.min(...allPrices) : null;
  const maxP = allPrices.length ? Math.max(...allPrices) : null;

  const previewProduct = {
    category: formData.category,
    subCategoryName: formData.subCategoryName,
    productName: formData.productName || formData.subCategoryName || formData.category,
    description: formData.description,
    priceType: formData.priceType,
    tiers,
    variantGroups,
    combinations,
    thumbnail: thumbnail?.preview || null,
    trackInventory: formData.trackInventory,
    stock: parseInt(formData.stock) || 0,
  };

  return (
    <div>
      {showPreview && (
        <ProductPreviewModal
          product={previewProduct}
          onClose={() => setShowPreview(false)}
        />
      )}

      <div className="page-header">
        <h1 className="page-title">Add New Product</h1>
        <p className="page-subtitle">I-setup ang category, sub-category, variants, at tiered pricing.</p>
      </div>

      <form className="product-form" onSubmit={handleSubmit}>

        {/* ── Product Category ── */}
        <div className="form-section">
          <h2 className="form-section-title">Product Category</h2>

          {/* Row 1: Category | Sub-category | Stock Qty (conditional) */}
          <div className="category-row">

            <div className="form-group">
              <Combobox
                label="Category"
                required
                value={formData.category}
                onChange={handleCategoryChange}
                options={savedCategories}
                placeholder="e.g. T-Shirt, Mugs…"
              />
            </div>

            <div className="form-group">
              <Combobox
                label="Sub-category"
                value={formData.subCategoryName}
                onChange={handleSubCategoryChange}
                options={subCatOptions}
                placeholder="e.g. DTF, Ceramic…"
              />
            </div>

            {/* Stock Qty — lalabas lang katabi ng Sub-category kung Track Stock ang pinili */}
            {formData.trackInventory && (
              <div className="form-group stock-qty-field">
                <label className="form-label">Stock Qty <span className="required">*</span></label>
                <input
                  type="number"
                  className="form-input"
                  value={formData.stock}
                  onChange={e => {
                    const val = e.target.value;
                    if (val === '' || parseInt(val) >= 0) {
                      setFormData(prev => ({ ...prev, stock: val }));
                    }
                  }}
                  placeholder="0"
                  min="0"
                  required
                />
              </div>
            )}

          </div>

          {/* Row 2: Description (full width) */}
          <div className="form-group" style={{ marginTop: '1rem' }}>
            <label className="form-label">Description</label>
            <textarea
              className="form-textarea"
              value={formData.description}
              onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))}
              placeholder="Materials, printing details, sizes, notes…"
            />
          </div>

          {/* Product ID — shown pag may category + subcategory na */}
          {(formData.category && formData.subCategoryName) && (
            <div className="sku-preview">
              <span className="sku-label">Product ID:</span>
              <span className="sku-value">[{formData.category}]-[{formData.subCategoryName}]</span>
            </div>
          )}
        </div>

        {/* ── Availability ── */}
        <div className="form-section">
          <h2 className="form-section-title">Availability</h2>
          <div className="availability-cards">
            {[
              { val: true, title: 'Track Stock', desc: 'Tracable Stock/quantity available.' },
              { val: false, title: 'Upon Order / Supplied', desc: 'Supplier-based. Stock not available, upon ordering.' },
            ].map(({ val, title, desc }) => (
              <button
                key={String(val)}
                type="button"
                className={`availability-card${formData.trackInventory === val ? ' selected' : ''}`}
                onClick={() => setFormData(prev => ({ ...prev, trackInventory: val, stock: val ? prev.stock : '' }))}
              >
                <div className="availability-title">{title}</div>
                <div className="availability-desc">{desc}</div>
                {formData.trackInventory === val && (
                  <div className="availability-badge">Selected</div>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* ── Variants ── */}
        <div className="form-section">
          <h2 className="form-section-title">Variants</h2>

          <div className="variant-groups">
            {variantGroups.map((group, gIdx) => (
              <div key={group.id} className="variant-group">
                <div className="variant-group-header">
                  <span className="variant-group-label">VARIANT {gIdx + 1}</span>
                  <input
                    type="text"
                    className="form-input"
                    value={group.name}
                    onChange={e => updateGroupName(group.id, e.target.value)}
                    placeholder={gIdx === 0 ? 'e.g. Finish, Size, Type…' : 'e.g. Color, Size…'}
                  />
                  <button type="button" className="btn-remove-group" onClick={() => removeGroup(group.id)}>🗑️</button>
                </div>
                <div className="variant-options">
                  {group.options.map(opt => (
                    <span key={opt.id} className="variant-chip-wrap">
                      {/* Image upload button per option — para makita ng customer kung ano itsura ng variant */}
                      <label className="variant-chip-img-btn" title={opt.image ? 'Change image' : 'Add variant image'}>
                        {opt.image
                          ? <img src={opt.image} alt={opt.value} className="variant-chip-img-preview" />
                          : <span className="variant-chip-img-placeholder">🖼️</span>
                        }
                        <input
                          type="file"
                          accept="image/*"
                          style={{ display: 'none' }}
                          onChange={e => { if (e.target.files?.[0]) handleOptionImageUpload(group.id, opt.id, e.target.files[0]); }}
                        />
                      </label>
                      <span className="variant-chip">
                        {opt.value}
                        {opt.image && (
                          <button type="button" className="variant-chip-img-remove" onClick={() => removeOptionImage(group.id, opt.id)} title="Remove image">✕img</button>
                        )}
                        <button type="button" className="variant-chip-remove" onClick={() => removeOption(group.id, opt.id)}>×</button>
                      </span>
                    </span>
                  ))}
                  <input
                    type="text"
                    className="variant-option-input"
                    value={optionInputs[group.id] || ''}
                    onChange={e => setOptionInputs(prev => ({ ...prev, [group.id]: e.target.value }))}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addOption(group.id); } }}
                    placeholder="Add option…"
                  />
                  <button type="button" className="btn-add-option" onClick={() => addOption(group.id)}>+ Add</button>
                </div>
                {group.options.length === 0 && (
                  <p className="form-hint">Type an option and press Enter or click + Add.</p>
                )}
              </div>
            ))}
          </div>

          {variantGroups.length < 2 && (
            <button type="button" className="add-variant-btn" onClick={addGroup}>
              ➕ Add Variant Type
              <span className="add-variant-max">(max 2)</span>
            </button>
          )}
        </div>

        {/* ── Pricing ── */}
        <div className="form-section">
          <h2 className="form-section-title">Pricing</h2>

          <div className="price-type-row">
            {[
              { val: 'fixed',   label: 'Fixed Price' },
              { val: 'inquiry', label: 'For Inquiry' },
            ].map(({ val, label }) => (
              <button
                key={val}
                type="button"
                className={`price-type-btn${formData.priceType === val ? ' selected' : ''}`}
                onClick={() => setFormData(prev => ({ ...prev, priceType: val }))}
              >
                {label}
              </button>
            ))}
          </div>

          {formData.priceType === 'fixed' && (
            <>
              {minP !== null && (
                <div className="price-preview">
                  <p className="price-preview-value">
                    ₱{minP}{maxP !== minP ? ` – ₱${maxP}` : ''}
                    <span className="price-preview-unit"> per item</span>
                  </p>
                  <p className="price-preview-note">
                    {hasVariants
                      ? 'Pinakamaba at pinakamataas na price sa lahat ng variants at tiers'
                      : 'Auto-calculated from tiers below'}
                  </p>
                </div>
              )}

              <div className="tier-table-wrap">
                <table className="tier-table">
                  <thead>
                    <tr>
                      <th>Tier</th>
                      <th>Min Qty</th>
                      <th>Max Qty</th>
                      {!hasVariants
                        ? <th>Price (₱)</th>
                        : combinations.map(c => (
                          <th key={c.id} className="tier-variant-header">{c.label}</th>
                        ))
                      }
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {tiers.map((tier, idx) => (
                      <tr key={tier.id}>
                        <td><span className="tier-badge">Tier {idx + 1}</span></td>
                        <td>
                          <input
                            type="number"
                            className="tier-input"
                            value={tier.minQty === '' || tier.minQty == null ? '' : String(tier.minQty)}
                            onChange={e => {
                              const val = e.target.value;
                              if (val === '' || parseInt(val) >= 0) {
                                updateTierRange(tier.id, 'minQty', val);
                              }
                            }}
                            placeholder="1"
                            min="0"
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            className="tier-input"
                            value={tier.maxQty === '' || tier.maxQty == null ? '' : String(tier.maxQty)}
                            onChange={e => {
                              const val = e.target.value;
                              if (val === '' || parseInt(val) >= 0) {
                                updateTierRange(tier.id, 'maxQty', val);
                              }
                            }}
                            placeholder="∞"
                            min="0"
                          />
                        </td>
                        {!hasVariants
                          ? (
                            <td>
                              <div className="tier-price-cell">
                                <span className="peso">₱</span>
                                <input
                                  type="number"
                                  className="tier-input"
                                  value={tier.prices['__base__'] || ''}
                                  onChange={e => updateTierPrice(tier.id, '__base__', e.target.value)}
                                  placeholder="0"
                                />
                              </div>
                            </td>
                          )
                          : combinations.map(c => (
                            <td key={c.id}>
                              <div className="tier-price-cell">
                                <span className="peso">₱</span>
                                <input
                                  type="number"
                                  className="tier-input"
                                  value={tier.prices[c.id] || ''}
                                  onChange={e => updateTierPrice(tier.id, c.id, e.target.value)}
                                  placeholder="0"
                                />
                              </div>
                            </td>
                          ))
                        }
                        <td>
                          {tiers.length > 1 && (
                            <button type="button" className="btn-remove-tier" onClick={() => removeTier(tier.id)}>🗑️</button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <button type="button" className="add-tier-btn" onClick={addTier}>
                ➕ Add Price Tier
              </button>
            </>
          )}
        </div>

        {/* ── Thumbnail + Gallery side by side ── */}
        <div className="form-section">
          <div className="images-row">

            {/* Left: Thumbnail — 1 image lang, main display sa product card */}
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
                <div
                  className={`image-upload-area${dragOverThumb ? ' drag-over' : ''}`}
                  onDrop={handleThumbnailDrop}
                  onDragOver={e => { e.preventDefault(); setDragOverThumb(true); }}
                  onDragLeave={() => setDragOverThumb(false)}
                  onClick={() => document.getElementById('thumbnailInput').click()}
                >
                  <div className="image-upload-text"><strong>Click to upload thumbnail</strong> or drag and drop</div>
                  <div className="image-upload-hint">Standard size: 200x200px — PNG, JPG</div>
                  <input
                    id="thumbnailInput"
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={e => { if (e.target.files?.length) handleThumbnailUpload(e.target.files); }}
                  />
                </div>
              )}
            </div>

            {/* Right: Gallery — multiple images para sa product detail page */}
            <div className="images-col">
              <h2 className="form-section-title">Product Gallery</h2>
              <div
                className={`image-upload-area${dragOver ? ' drag-over' : ''}`}
                onDrop={handleDrop}
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onClick={() => document.getElementById('imageInput').click()}
              >
                <div className="image-upload-text"><strong>Click to upload</strong> or drag and drop</div>
                <div className="image-upload-hint">PNG, JPG, GIF</div>
                <input
                  id="imageInput"
                  type="file"
                  accept="image/*"
                  multiple
                  style={{ display: 'none' }}
                  onChange={e => { if (e.target.files?.length) handleImageUpload(e.target.files); }}
                />
              </div>
              {images.length > 0 && (
                <div className="image-preview-grid">
                  {images.map(img => (
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

        {/* ── Actions ── */}
        <div className="form-actions">
          <button type="button" className="btn-cancel" onClick={() => router.back()}>Cancel</button>
          <button type="button" className="btn-preview" onClick={() => setShowPreview(true)}>
            Preview
          </button>
          <button type="submit" className="btn-submit">Save Product</button>
        </div>

      </form>
    </div>
  );
}