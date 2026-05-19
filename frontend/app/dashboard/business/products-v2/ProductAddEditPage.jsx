'use client';
import { useState, useEffect, useMemo, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { uploadImage } from '@/lib/productApi';
import { S, ICONS, Field, IntegerInput, DecimalInput, Note, formatCurrency, uid, CustomSelect } from '../inventory-v2/shared';

// ── Constants ─────────────────────────────────────────────────────────────────

const LIBRARY_IMAGES = [
  '/products/Tshit_printing.jpg',
  '/products/DTF.jpg',
  '/products/mugs.jpg',
  '/products/ButtonPins.jpg',
  '/products/ecobags.jpg',
  '/products/MousePad.jpg',
  '/products/RefMagnet.jpg',
  '/products/Souvenirs.jpg',
  '/products/Stickers.jpg',
  '/products/Bookmarks.jpg',
  '/products/Ballpens.jpg',
  '/products/Caps.jpg',
];

const EMPTY_VARIANT = () => ({ id: uid('v'), name: '', bomId: '', price: '' });

function emptyTier(keys) {
  return { id: uid('t'), minQty: '1', maxQty: '', prices: keys.reduce((a, k) => ({ ...a, [k]: '' }), {}) };
}

const EMPTY_FORM = {
  name: '', description: '', images: [],
  type: 'standalone', bomId: '',
  variants: [EMPTY_VARIANT()],
  pricingMode: 'fixed', price: '',
  tiers: [{ id: uid('t'), minQty: '1', maxQty: '', prices: { __base__: '' } }],
  collectionIds: [],
  isCustomizable: false, allowCOD: true, isMadeToOrder: false,
  downpaymentPct: '0', hideWhenOutOfStock: false, isPublished: false,
  isFeatured: false,
  designFee: '', minOrderQty: '1',
};

// ── Shared UI components ──────────────────────────────────────────────────────

function Toggle({ on, onChange }) {
  return (
    <button type="button" onClick={() => onChange(!on)}
      style={{ position: 'relative', width: '40px', height: '22px', borderRadius: '11px', border: 'none',
        cursor: 'pointer', background: on ? '#c9973f' : '#e1e3e5', flexShrink: 0, transition: 'background .15s' }}>
      <span style={{ position: 'absolute', top: '3px', left: on ? '21px' : '3px', width: '16px', height: '16px',
        borderRadius: '50%', background: '#fff', transition: 'left .15s', boxShadow: '0 1px 3px rgba(0,0,0,.2)' }} />
    </button>
  );
}

function Card({ children, style, onPaste }) {
  return (
    <div onPaste={onPaste}
      style={{ background: '#fff', border: '1px solid #e1e3e5', borderRadius: '10px', padding: '16px', ...style }}>
      {children}
    </div>
  );
}

function CardTitle({ children }) {
  return <div style={{ fontSize: '13px', fontWeight: 700, color: '#374151', marginBottom: '12px' }}>{children}</div>;
}

function ToggleRow({ label, hint, on, onChange, disabled }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', opacity: disabled ? 0.5 : 1 }}>
      <div>
        <div style={{ fontSize: '13px', fontWeight: 600, color: '#374151' }}>{label}</div>
        {hint && <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '2px' }}>{hint}</div>}
      </div>
      <Toggle on={on} onChange={disabled ? () => {} : onChange} />
    </div>
  );
}

// ── Media Library Modal ───────────────────────────────────────────────────────

function MediaLibraryModal({ multi = false, onSelect, onClose, existingImages = [], onFileUpload }) {
  const [sel, setSel] = useState(new Set());
  const [search, setSearch] = useState('');

  const filtered = search
    ? existingImages.filter(img =>
        img.label.toLowerCase().includes(search.toLowerCase()) ||
        img.url.toLowerCase().includes(search.toLowerCase()))
    : existingImages;

  const toggle = (url) => {
    if (!multi) { onSelect([url]); return; }
    setSel(p => { const n = new Set(p); n.has(url) ? n.delete(url) : n.add(url); return n; });
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: '#fff', borderRadius: '12px', width: '620px', maxWidth: '95vw',
        maxHeight: '82vh', display: 'flex', flexDirection: 'column', overflow: 'hidden',
        boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>

        {/* Header */}
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #e1e3e5',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontWeight: 700, fontSize: '15px', color: '#1a1a2e' }}>Select file</div>
          <button onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '20px',
              color: '#6b7280', lineHeight: 1, padding: '4px' }}>×</button>
        </div>

        {/* Search */}
        <div style={{ padding: '10px 16px', borderBottom: '1px solid #f3f4f6' }}>
          <div style={{ position: 'relative' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2"
              style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
              <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
            </svg>
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search files…"
              style={{ ...S.input, paddingLeft: '32px', width: '100%', boxSizing: 'border-box' }} />
          </div>
        </div>

        {/* Upload zone */}
        <div style={{ margin: '10px 16px 0', border: '2px dashed #d1d5db', borderRadius: '8px',
          padding: '10px 16px', display: 'flex', alignItems: 'center', gap: '10px', background: '#fafbfc' }}>
          <label style={{ ...S.btnSm, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            Add media
            <input type="file" accept="image/*" multiple style={{ display: 'none' }}
              onChange={e => { if (e.target.files?.length) { onFileUpload(e.target.files); onClose(); } e.target.value = ''; }} />
          </label>
          <span style={{ fontSize: '12px', color: '#9ca3af' }}>Drag and drop images and files</span>
        </div>

        {/* Grid */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
          {filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: '#9ca3af', fontSize: '13px' }}>
              {existingImages.length === 0
                ? 'No uploaded images yet. Use "Add media" to upload one.'
                : 'No images match your search.'}
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '8px' }}>
              {filtered.map(img => {
                const isSel = sel.has(img.url);
                return (
                  <button key={img.id} type="button" onClick={() => toggle(img.url)}
                    style={{ position: 'relative', background: 'none',
                      border: `2px solid ${isSel ? '#c9973f' : '#e1e3e5'}`,
                      borderRadius: '8px', padding: 0, cursor: 'pointer',
                      overflow: 'hidden', aspectRatio: '1/1', transition: 'border-color .15s' }}>
                    <img src={img.url} alt={img.label}
                      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                    {isSel && (
                      <div style={{ position: 'absolute', top: '4px', right: '4px', width: '20px', height: '20px',
                        borderRadius: '50%', background: '#c9973f', display: 'flex',
                        alignItems: 'center', justifyContent: 'center' }}>
                        {ICONS.check}
                      </div>
                    )}
                    {img.label && (
                      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0,
                        background: 'linear-gradient(transparent, rgba(0,0,0,0.65))',
                        padding: '16px 4px 4px', fontSize: '9px', color: '#fff',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {img.label}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {multi && (
          <div style={{ padding: '12px 20px', borderTop: '1px solid #e1e3e5',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '12px', color: '#9ca3af' }}>
              {sel.size > 0 ? `${sel.size} file${sel.size > 1 ? 's' : ''} selected` : ''}
            </span>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={onClose} style={S.btnGhost}>Cancel</button>
              <button onClick={() => onSelect([...sel])} style={S.btnPrimary} disabled={!sel.size}>Done</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Storefront preview (mirrors actual shop card, dark theme) ─────────────────

function StorefrontPreview({ name, description, thumbnail, priceRange, variantCount, isCustomizable }) {
  return (
    <div>
      <div style={{ fontSize: '10px', fontWeight: 700, color: '#9ca3af', marginBottom: '8px',
        textTransform: 'uppercase', letterSpacing: '0.06em',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>Storefront Preview</span>
        <span style={{ fontSize: '9px', fontStyle: 'italic', textTransform: 'none',
          fontWeight: 400, letterSpacing: '0.03em' }}>How customers see it</span>
      </div>

      <div style={{ background: '#fff', border: '1px solid #e1e3e5',
        borderRadius: '12px', overflow: 'hidden' }}>

        {/* Image area — 1:1 aspect */}
        <div style={{ aspectRatio: '1/1', width: '100%',
          background: '#f4f6f8',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          position: 'relative', overflow: 'hidden' }}>
          {thumbnail ? (
            <img src={thumbnail} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <div style={{ textAlign: 'center', color: '#d1d5db' }}>
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"
                style={{ display: 'block', margin: '0 auto 8px' }}>
                <rect x="3" y="3" width="18" height="18" rx="2"/>
                <circle cx="8.5" cy="8.5" r="1.5"/>
                <polyline points="21 15 16 10 5 21"/>
              </svg>
              <div style={{ fontSize: '0.75rem', color: '#9ca3af' }}>No image</div>
            </div>
          )}
          {isCustomizable && (
            <div style={{ position: 'absolute', top: '10px', right: '10px', background: '#c9973f',
              color: '#fff', fontSize: '0.6rem', fontWeight: 700, padding: '3px 8px',
              borderRadius: '6px', textTransform: 'uppercase', letterSpacing: '0.5px', zIndex: 2 }}>
              Customizable
            </div>
          )}
        </div>

        {/* Info */}
        <div style={{ padding: '1rem' }}>
          <div style={{ margin: '0 0 0.4rem', fontSize: '0.95rem', fontWeight: 600, color: '#1a1a2e',
            lineHeight: 1.4, overflow: 'hidden', display: '-webkit-box',
            WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
            {name || <span style={{ color: '#d1d5db', fontStyle: 'italic', fontWeight: 400 }}>Product name</span>}
          </div>

          <p style={{ margin: '0 0 0.75rem', fontSize: '0.82rem', lineHeight: 1.5,
            color: description ? '#6b7280' : '#d1d5db',
            fontStyle: description ? 'normal' : 'italic',
            overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
            {description || 'No description'}
          </p>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '1rem', fontWeight: 700, color: '#c9973f' }}>
              {priceRange || (
                <span style={{ fontSize: '0.78rem', color: '#d1d5db', fontWeight: 400, fontStyle: 'italic' }}>
                  Set price below
                </span>
              )}
            </span>
            {variantCount > 1 && (
              <span style={{ fontSize: '0.75rem', color: '#9ca3af', fontWeight: 500 }}>
                {variantCount} variant{variantCount !== 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Validation ────────────────────────────────────────────────────────────────

function validate(form) {
  const e = {};
  if (!form.name.trim()) e.name = 'Product name is required.';
  if (form.type === 'standalone' && !form.bomId) e.bomId = 'Select a BOM.';
  if (form.type === 'multi-variant') {
    if (!form.variants.length) e.variants = 'Add at least one variant.';
    form.variants.forEach((v, i) => {
      if (!v.name.trim()) e[`vname_${i}`] = 'Variant name required.';
      if (!v.bomId)       e[`vbom_${i}`]  = 'Select a BOM.';
    });
  }
  if (form.pricingMode === 'fixed') {
    if (form.type === 'standalone') {
      if (!form.price || Number(form.price) <= 0) e.price = 'Price must be > 0.';
    } else {
      form.variants.forEach((v, i) => {
        if (!v.price || Number(v.price) <= 0) e[`vprice_${i}`] = 'Price > 0 required.';
      });
    }
  }
  if (form.pricingMode === 'tiered') {
    const incomplete = form.tiers.some(t =>
      !t.minQty || Number(t.minQty) <= 0 ||
      Object.values(t.prices).some(p => !p || Number(p) <= 0)
    );
    if (incomplete) e.tiers = 'Fill in all tier quantities and prices.';
  }
  if (form.downpaymentPct === '' || isNaN(Number(form.downpaymentPct)) ||
      Number(form.downpaymentPct) < 0 || Number(form.downpaymentPct) > 100)
    e.downpaymentPct = 'Enter 0-100.';
  return e;
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ProductAddEditPage({ product, boms, batches = [], materials = [], collections, existingImages = [], onSave, onCancel }) {
  const { token } = useAuth();

  // ── Form state ──────────────────────────────────────────────────────────────
  const [form,           setForm]          = useState(EMPTY_FORM);
  const [errors,         setErrors]        = useState({});
  const [variantImages,  setVariantImages] = useState({});
  const [uploadingCount, setUploadingCount] = useState(0);

  // ── Media picker state ──────────────────────────────────────────────────────
  const [mediaMenuOpen,  setMediaMenuOpen] = useState(false);
  const [mediaUrlMode,   setMediaUrlMode]  = useState(false);
  const [mediaUrlInput,  setMediaUrlInput] = useState('');
  const [libOpen,        setLibOpen]       = useState(false);
  const [libTarget,      setLibTarget]     = useState('product'); // 'product' | variantId

  // ── Variant image state ─────────────────────────────────────────────────────
  const [vImgMenuId,  setVImgMenuId]  = useState(null);
  const [vImgUrlId,   setVImgUrlId]   = useState(null);
  const [vImgInput,   setVImgInput]   = useState('');

  const mediaMenuRef   = useRef(null);
  const vImgMenuRef    = useRef(null);

  // Close media menu on outside click
  useEffect(() => {
    if (!mediaMenuOpen) return;
    const h = e => { if (mediaMenuRef.current && !mediaMenuRef.current.contains(e.target)) setMediaMenuOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [mediaMenuOpen]);

  // Close variant img menu on outside click
  useEffect(() => {
    if (!vImgMenuId) return;
    const h = e => { if (vImgMenuRef.current && !vImgMenuRef.current.contains(e.target)) setVImgMenuId(null); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [vImgMenuId]);

  // ── Hydrate form from product prop ─────────────────────────────────────────
  useEffect(() => {
    if (!product) {
      setForm({ ...EMPTY_FORM, variants: [EMPTY_VARIANT()], tiers: [emptyTier(['__base__'])] });
      setErrors({});
      setVariantImages({});
      return;
    }
    const rawTiers = product.priceTiers || product.tiers;
    const tiers = rawTiers?.length
      ? rawTiers.map(t => ({
          ...t,
          minQty: String(t.minQty),
          maxQty: t.maxQty != null ? String(t.maxQty) : '',
          prices: Object.fromEntries(Object.entries(t.prices || {}).map(([k, v]) => [k, String(v)])),
        }))
      : [emptyTier(['__base__'])];
    const baseImages = product.images?.length ? product.images : (product.thumbnail ? [product.thumbnail] : []);
    const variantUrls = Object.values(product.variantImageUrls ?? {}).filter(Boolean);
    const imageSet = new Set(baseImages);
    const mergedImages = [...baseImages, ...variantUrls.filter(u => !imageSet.has(u))].slice(0, 8);

    setForm({
      name:               product.name || '',
      description:        product.description || '',
      images:             mergedImages,
      type:               product.type || 'standalone',
      bomId:              product.bomId || '',
      variants:           product.variants?.length
                            ? product.variants.map(v => ({ id: v.id || uid('v'), name: v.name, bomId: v.bomId || '', price: v.price != null ? String(v.price) : '' }))
                            : [EMPTY_VARIANT()],
      pricingMode:        product.pricingMode || product.priceType || 'fixed',
      price:              product.price != null ? String(product.price) : '',
      tiers,
      collectionIds:      product.collectionIds || [],
      isCustomizable:     product.isCustomizable ?? false,
      allowCOD:           product.allowCOD ?? true,
      isMadeToOrder:      product.isMadeToOrder ?? false,
      downpaymentPct:     product.downpaymentPct != null ? String(product.downpaymentPct) : '0',
      hideWhenOutOfStock: product.hideWhenOutOfStock ?? false,
      isPublished:        product.isPublished ?? false,
      isFeatured:         product.isFeatured ?? false,
      designFee:          product.designFee != null ? String(product.designFee) : '',
      minOrderQty:        product.minOrderQty != null ? String(product.minOrderQty) : '1',
    });
    setErrors({});
    // Restore variant images from saved variantImageUrls
    const urlMap = product.variantImageUrls ?? {};
    const restored = {};
    (product.variants ?? []).forEach(v => {
      const url = urlMap[v.id || uid('v')];
      if (url) restored[v.id] = url;
    });
    setVariantImages(restored);
  }, [product]);

  const setF = (k, v) => { setForm(p => ({ ...p, [k]: v })); setErrors(p => ({ ...p, [k]: '' })); };

  // ── Image helpers ───────────────────────────────────────────────────────────

  const addImages = (urls) => {
    const next = [...form.images, ...urls.filter(u => u && !form.images.includes(u))].slice(0, 8);
    setF('images', next);
  };

  const removeImage = (i) => setF('images', form.images.filter((_, j) => j !== i));

  const handleFileUpload = async (files, target = 'product') => {
    const fileList = Array.from(files);
    setUploadingCount(c => c + fileList.length);
    await Promise.all(fileList.map(async (f) => {
      try {
        const result = await uploadImage(f, 'pmp-products', token);
        if (target === 'product') {
          addImages([result.url]);
        } else {
          setVariantImages(p => ({ ...p, [target]: result.url }));
          addImages([result.url]);
        }
      } finally {
        setUploadingCount(c => c - 1);
      }
    }));
  };

  const handleMediaPaste = async (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) {
          setUploadingCount(c => c + 1);
          try {
            const result = await uploadImage(file, 'pmp-products', token);
            addImages([result.url]);
          } finally {
            setUploadingCount(c => c - 1);
          }
        }
        return;
      }
    }
  };

  const commitMediaUrl = () => {
    const url = mediaUrlInput.trim();
    if (url) { addImages([url]); setMediaUrlInput(''); setMediaUrlMode(false); }
  };

  const openLib = (target) => {
    setLibTarget(target);
    setLibOpen(true);
    setMediaMenuOpen(false);
    setVImgMenuId(null);
  };

  const handleLibSelect = (urls) => {
    if (libTarget === 'product') {
      addImages(urls);
    } else {
      if (urls[0]) {
        setVariantImages(p => ({ ...p, [libTarget]: urls[0] }));
        addImages([urls[0]]);
      }
    }
    setLibOpen(false);
  };

  // ── Variant helpers ─────────────────────────────────────────────────────────

  const setVariant = (i, k, v) => {
    setForm(p => { const vs = [...p.variants]; vs[i] = { ...vs[i], [k]: v }; return { ...p, variants: vs }; });
    setErrors(p => ({ ...p, [`v${k}_${i}`]: '' }));
  };

  const addVariant = () => {
    const nv = EMPTY_VARIANT();
    setForm(p => ({
      ...p,
      variants: [...p.variants, nv],
      tiers: p.pricingMode === 'tiered'
        ? p.tiers.map(t => ({ ...t, prices: { ...t.prices, [nv.id]: '' } }))
        : p.tiers,
    }));
  };

  const removeVariant = (i) => {
    const vId = form.variants[i].id;
    setVariantImages(p => { const n = { ...p }; delete n[vId]; return n; });
    setForm(p => {
      const variants = p.variants.filter((_, j) => j !== i);
      const tiers    = p.tiers.map(t => { const prices = { ...t.prices }; delete prices[vId]; return { ...t, prices }; });
      return { ...p, variants, tiers };
    });
  };

  // ── Tier helpers ────────────────────────────────────────────────────────────

  const addTier = () => {
    setForm(p => {
      const last    = p.tiers[p.tiers.length - 1];
      const nextMin = last?.maxQty ? String(Number(last.maxQty) + 1) : '';
      const keys    = p.type === 'standalone' ? ['__base__'] : p.variants.map(v => v.id);
      return { ...p, tiers: [...p.tiers, { id: uid('t'), minQty: nextMin, maxQty: '', prices: keys.reduce((a, k) => ({ ...a, [k]: '' }), {}) }] };
    });
  };
  const removeTier   = (i)          => setForm(p => ({ ...p, tiers: p.tiers.filter((_, j) => j !== i) }));
  const setTierField = (i, k, v)    => setForm(p => { const tiers = [...p.tiers]; tiers[i] = { ...tiers[i], [k]: v }; return { ...p, tiers }; });
  const setTierPrice = (ti, key, v) => {
    setForm(p => { const tiers = [...p.tiers]; tiers[ti] = { ...tiers[ti], prices: { ...tiers[ti].prices, [key]: v } }; return { ...p, tiers }; });
    setErrors(p => ({ ...p, tiers: '' }));
  };

  // ── Type / pricingMode change ───────────────────────────────────────────────

  const handleTypeChange = (newType) => {
    setForm(p => {
      let tiers = p.tiers;
      if (p.pricingMode === 'tiered') {
        tiers = newType === 'standalone'
          ? p.tiers.map(t => ({ ...t, prices: { __base__: '' } }))
          : p.tiers.map(t => ({ ...t, prices: p.variants.reduce((a, v) => ({ ...a, [v.id]: '' }), {}) }));
      }
      return { ...p, type: newType, tiers };
    });
  };

  const handlePricingModeChange = (newMode) => {
    setForm(p => {
      let tiers = p.tiers;
      if (newMode === 'tiered') {
        const keys = p.type === 'standalone' ? ['__base__'] : p.variants.map(v => v.id);
        tiers = p.tiers.length
          ? p.tiers.map(t => ({ ...t, prices: keys.reduce((a, k) => ({ ...a, [k]: '' }), {}) }))
          : [emptyTier(keys)];
      }
      return { ...p, pricingMode: newMode, tiers };
    });
    setErrors(p => ({ ...p, price: '', tiers: '' }));
  };

  const toggleCollection = (id) =>
    setF('collectionIds', form.collectionIds.includes(id)
      ? form.collectionIds.filter(c => c !== id)
      : [...form.collectionIds, id]);

  // ── BOM cost + max producible ───────────────────────────────────────────────

  const floorCostMap = useMemo(() => {
    const map = {};
    boms.forEach(bom => {
      map[bom.id] = (bom.items || []).reduce((total, item) => {
        const active = batches.filter(bt => bt.matId === item.matId && bt.remainingQty > 0);
        const maxUC  = active.length ? Math.max(...active.map(bt => bt.unitCost)) : 0;
        return total + maxUC * (item.qty || 1);
      }, 0);
    });
    return map;
  }, [boms, batches]);

  const maxProducibleMap = useMemo(() => {
    const map = {};
    boms.forEach(bom => {
      let min = Infinity;
      for (const item of bom.items || []) {
        const mat   = materials.find(m => m.id === item.matId);
        const total = mat?.stockQty ?? 0;
        const can   = Math.floor(total / (item.qty || 1));
        if (can < min) min = can;
      }
      map[bom.id] = min === Infinity ? 0 : min;
    });
    return map;
  }, [boms, materials]);

  const previewPrice = useMemo(() => {
    if (form.pricingMode === 'inquiry') return 'Price on request';
    if (form.pricingMode === 'fixed') {
      if (form.type === 'standalone') {
        const p = Number(form.price);
        return p > 0 ? formatCurrency(p) : '';
      }
      const prices = form.variants.map(v => Number(v.price)).filter(p => p > 0);
      if (!prices.length) return '';
      const mn = Math.min(...prices), mx = Math.max(...prices);
      return mn === mx ? formatCurrency(mn) : `${formatCurrency(mn)} - ${formatCurrency(mx)}`;
    }
    const all = form.tiers.flatMap(t => Object.values(t.prices || {})).map(v => Number(v)).filter(v => v > 0);
    if (!all.length) return '';
    const mn = Math.min(...all), mx = Math.max(...all);
    return mn === mx ? formatCurrency(mn) : `${formatCurrency(mn)} - ${formatCurrency(mx)}`;
  }, [form]);

  // ── Save ────────────────────────────────────────────────────────────────────

  const handleSave = (publish) => {
    const f = publish ? { ...form, isPublished: true } : form;
    const e = validate(f);
    if (Object.keys(e).length) { setErrors(e); return; }
    const base = {
      name: f.name.trim(), description: f.description.trim(),
      images: f.images, thumbnail: f.images[0] || '',
      variantImages,
      type: f.type, pricingMode: f.pricingMode,
      collectionIds: f.collectionIds,
      isCustomizable: f.isCustomizable, allowCOD: f.allowCOD, isMadeToOrder: f.isMadeToOrder,
      downpaymentPct: Number(f.downpaymentPct),
      hideWhenOutOfStock: f.hideWhenOutOfStock, isPublished: f.isPublished,
      isFeatured: f.isFeatured,
      designFee: f.isCustomizable && f.designFee ? Number(f.designFee) : 0,
      minOrderQty: Number(f.minOrderQty) || 1,
    };
    let data;
    if (f.pricingMode === 'tiered') {
      const tiers = f.tiers.map(t => ({ id: t.id, minQty: Number(t.minQty), maxQty: t.maxQty ? Number(t.maxQty) : null, prices: Object.fromEntries(Object.entries(t.prices).map(([k, v]) => [k, Number(v)])) }));
      data = f.type === 'standalone'
        ? { ...base, bomId: f.bomId, tiers }
        : { ...base, variants: f.variants.map(v => ({ id: v.id, name: v.name, bomId: v.bomId })), tiers };
    } else if (f.pricingMode === 'fixed') {
      data = f.type === 'standalone'
        ? { ...base, bomId: f.bomId, price: Number(f.price) }
        : { ...base, variants: f.variants.map(v => ({ id: v.id, name: v.name, bomId: v.bomId, price: Number(v.price) })) };
    } else {
      data = f.type === 'standalone'
        ? { ...base, bomId: f.bomId }
        : { ...base, variants: f.variants.map(v => ({ id: v.id, name: v.name, bomId: v.bomId })) };
    }
    onSave(data);
  };

  const isEdit    = !!product;
  const thumbnail = form.images[0] || '';
  const standaloneBelowCost =
    form.pricingMode === 'fixed' && form.type === 'standalone' && form.bomId &&
    floorCostMap[form.bomId] > 0 && Number(form.price) > 0 && Number(form.price) < floorCostMap[form.bomId];

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div style={{ minHeight: '100%', paddingBottom: '60px' }}>

      {/* Sticky top bar */}
      <div style={{ position: 'sticky', top: 0, zIndex: 10, background: '#fff', borderBottom: '1px solid #e1e3e5' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '10px 24px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button onClick={onCancel}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', fontSize: '13px', fontWeight: 600, padding: '4px 0' }}>
              Products
            </button>
            <span style={{ color: '#d1d5db', fontSize: '14px' }}>/</span>
            <span style={{ fontSize: '13px', fontWeight: 700, color: '#1a1a2e' }}>
              {isEdit ? product.name : 'Add Product'}
            </span>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={onCancel} style={S.btnGhost}>Cancel</button>
            <button onClick={() => handleSave(false)} style={S.btnGhost}>Save as Draft</button>
            <button onClick={() => handleSave(true)} style={S.btnPrimary}>
              {ICONS.check} {isEdit ? 'Save Changes' : 'Add Product'}
            </button>
          </div>
        </div>
      </div>

      {/* Page content */}
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '24px 24px 0' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '20px', alignItems: 'start' }}>

          {/* ───────── LEFT ───────── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

            {/* Basic Info */}
            <Card>
              <CardTitle>Basic Info</CardTitle>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <Field label="Product Name" required error={errors.name}>
                  <input value={form.name} onChange={e => setF('name', e.target.value)}
                    placeholder="e.g. Custom White T-Shirt" maxLength={120}
                    style={errors.name ? S.inputErr : S.input} />
                </Field>
                <Field label="Description" error={errors.description}>
                  <textarea value={form.description} onChange={e => setF('description', e.target.value)}
                    maxLength={500} placeholder="Materials, printing method, available sizes..." style={S.textarea} />
                  <span style={{ fontSize: '11px', color: '#9ca3af', textAlign: 'right' }}>{form.description.length}/500</span>
                </Field>
              </div>
            </Card>

            {/* ── MEDIA ── */}
            <Card onPaste={handleMediaPaste}>
              <CardTitle>Media</CardTitle>

              {/* Image grid */}
              {form.images.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '10px' }}>
                  {form.images.map((url, i) => (
                    <div key={i} style={{ position: 'relative', flexShrink: 0 }}>
                      <div style={{ position: 'relative', width: '108px', height: '108px', borderRadius: '8px', overflow: 'hidden',
                        border: i === 0 ? '2px solid #c9973f' : '1px solid #e1e3e5' }}>
                        <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        {i === 0 && (
                          <span style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: '#c9973f',
                            color: '#fff', fontSize: '9px', fontWeight: 700, textAlign: 'center', padding: '2px 0', letterSpacing: '0.5px' }}>
                            THUMBNAIL
                          </span>
                        )}
                      </div>
                      <button onClick={() => removeImage(i)}
                        style={{ position: 'absolute', top: '-8px', right: '-8px', width: '20px', height: '20px',
                          borderRadius: '50%', background: '#1a1a2e', border: '1.5px solid #fff', cursor: 'pointer',
                          color: '#fff', fontSize: '11px', display: 'flex', alignItems: 'center',
                          justifyContent: 'center', lineHeight: 1, zIndex: 2 }}>
                        ×
                      </button>
                    </div>
                  ))}

                  {/* Add more slot */}
                  {form.images.length < 8 && (
                    <div ref={mediaMenuRef} style={{ position: 'relative', flexShrink: 0 }}>
                      <div onClick={() => setMediaMenuOpen(p => !p)}
                        style={{ width: '108px', height: '108px', borderRadius: '8px',
                          border: '2px dashed #d1d5db', display: 'flex', flexDirection: 'column',
                          alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                          color: '#9ca3af', gap: '4px' }}>
                        <span style={{ fontSize: '24px', lineHeight: 1, fontWeight: 300 }}>+</span>
                        <span style={{ fontSize: '10px' }}>Add media</span>
                      </div>
                      {mediaMenuOpen && (
                        <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 200,
                          background: '#fff', border: '1px solid #e1e3e5', borderRadius: '8px',
                          minWidth: '160px', boxShadow: '0 8px 24px rgba(0,0,0,0.12)', overflow: 'hidden' }}>
                          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px',
                            cursor: 'pointer', fontSize: '13px', color: '#374151', fontWeight: 500 }}
                            onMouseEnter={e => e.currentTarget.style.background = '#f9fafb'}
                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                            Upload image
                            <input type="file" accept="image/*" multiple style={{ display: 'none' }}
                              onChange={e => { if (e.target.files?.length) { handleFileUpload(e.target.files, 'product'); setMediaMenuOpen(false); } e.target.value = ''; }} />
                          </label>
                          <button onClick={() => { setMediaMenuOpen(false); setMediaUrlMode(true); }}
                            style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none',
                              borderTop: '1px solid #f3f4f6', padding: '10px 14px', cursor: 'pointer',
                              fontSize: '13px', color: '#374151', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '8px' }}
                            onMouseEnter={e => e.currentTarget.style.background = '#f9fafb'}
                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>
                            Add URL
                          </button>
                          <button onClick={() => openLib('product')}
                            style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none',
                              borderTop: '1px solid #f3f4f6', padding: '10px 14px', cursor: 'pointer',
                              fontSize: '13px', color: '#374151', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '8px' }}
                            onMouseEnter={e => e.currentTarget.style.background = '#f9fafb'}
                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                            Media library
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Empty state drop zone */}
              {form.images.length === 0 && (
                <div
                  onDrop={e => { e.preventDefault(); if (e.dataTransfer.files?.length) handleFileUpload(e.dataTransfer.files, 'product'); }}
                  onDragOver={e => e.preventDefault()}
                  style={{ border: '2px dashed #d1d5db', borderRadius: '10px', padding: '32px 20px',
                    textAlign: 'center', marginBottom: '10px', background: '#fafbfc' }}>
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="rgba(201,151,63,0.4)"
                    strokeWidth="1.5" style={{ margin: '0 auto 10px', display: 'block' }}>
                    <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
                  </svg>
                  <div style={{ fontSize: '13px', color: '#6b7280', marginBottom: '12px' }}>
                    Drag &amp; drop images here, or
                  </div>
                  <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', flexWrap: 'wrap' }}>
                    <label style={{ ...S.btnSm, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      Upload image
                      <input type="file" accept="image/*" multiple style={{ display: 'none' }}
                        onChange={e => { if (e.target.files?.length) handleFileUpload(e.target.files, 'product'); e.target.value = ''; }} />
                    </label>
                    <button onClick={() => setMediaUrlMode(true)} style={S.btnGhost}>Add URL</button>
                    <button onClick={() => openLib('product')} style={S.btnGhost}>Media library</button>
                  </div>
                </div>
              )}

              {/* URL input mode */}
              {mediaUrlMode && (
                <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                  <input value={mediaUrlInput} onChange={e => setMediaUrlInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), commitMediaUrl())}
                    placeholder="Paste image URL here..." autoFocus
                    style={{ ...S.input, flex: 1 }} />
                  <button onClick={commitMediaUrl} style={S.btnSm}>Add</button>
                  <button onClick={() => { setMediaUrlMode(false); setMediaUrlInput(''); }} style={S.btnGhost}>Cancel</button>
                </div>
              )}

              {uploadingCount > 0 && (
                <span style={{ fontSize: '11px', color: '#c9973f', display: 'block', marginBottom: '4px' }}>
                  Uploading {uploadingCount} image{uploadingCount > 1 ? 's' : ''}…
                </span>
              )}
              <span style={{ fontSize: '11px', color: '#9ca3af', display: 'block' }}>
                {form.images.length}/8 images. First image is the thumbnail in the shop. You can also paste (Ctrl+V) a copied image.
              </span>
            </Card>

            {/* Product & Variants */}
            <Card>
              <CardTitle>Product & Variants</CardTitle>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>

                <div style={{ display: 'flex', gap: '8px' }}>
                  {[
                    { val: 'standalone',    label: 'Standalone',    desc: 'One product, one BOM' },
                    { val: 'multi-variant', label: 'Multi-Variant', desc: 'Multiple options (sizes, types...)' },
                  ].map(o => (
                    <label key={o.val} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px',
                      padding: '12px', border: `1px solid ${form.type === o.val ? '#c9973f' : '#e1e3e5'}`,
                      borderRadius: '8px', cursor: 'pointer', background: form.type === o.val ? '#fffbe8' : '#fff' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <input type="radio" name="ptype" value={o.val} checked={form.type === o.val}
                          onChange={() => handleTypeChange(o.val)} style={{ accentColor: '#c9973f' }} />
                        <span style={{ fontWeight: 600, fontSize: '13px' }}>{o.label}</span>
                      </div>
                      <span style={{ fontSize: '11px', color: '#9ca3af', paddingLeft: '20px' }}>{o.desc}</span>
                    </label>
                  ))}
                </div>

                {/* Standalone */}
                {form.type === 'standalone' && (
                  <>
                    <Field label="Bill of Materials (BOM)" required error={errors.bomId}>
                      <CustomSelect value={form.bomId} onChange={v => setF('bomId', v)}
                        options={boms.map(b => ({ value:b.id, label:b.productName }))}
                        placeholder="Select BOM"
                        error={errors.bomId} />
                    </Field>
                    {form.bomId && (
                      <div style={{ display: 'flex', gap: '20px', padding: '8px 12px', background: '#f4f6f8', borderRadius: '7px', fontSize: '12px', color: '#6b7280' }}>
                        <span>Floor cost: <b style={{ color: '#374151' }}>{floorCostMap[form.bomId] > 0 ? formatCurrency(floorCostMap[form.bomId]) : '--'}</b></span>
                        <span>Can produce: <b style={{ color: (maxProducibleMap[form.bomId] || 0) > 0 ? '#2e7d32' : '#dc2626' }}>
                          {(maxProducibleMap[form.bomId] || 0) > 0 ? `${maxProducibleMap[form.bomId]} units` : 'Out of stock'}
                        </b></span>
                      </div>
                    )}
                  </>
                )}

                {/* Multi-variant */}
                {form.type === 'multi-variant' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '12px', fontWeight: 600, color: '#6b7280' }}>Variants</span>
                      <button onClick={addVariant} style={S.btnSm}>{ICONS.plus} Add Variant</button>
                    </div>
                    {errors.variants && <span style={S.errText}>{errors.variants}</span>}

                    {form.variants.map((v, i) => {
                      const cost    = v.bomId ? (floorCostMap[v.bomId]     || 0)   : 0;
                      const units   = v.bomId ? (maxProducibleMap[v.bomId] ?? null) : null;
                      const imgUrl  = variantImages[v.id] || '';
                      const menuOpen = vImgMenuId === v.id;
                      const urlOpen  = vImgUrlId  === v.id;

                      return (
                        <div key={v.id} style={{ border: '1px solid #e1e3e5', borderRadius: '8px', padding: '12px', background: '#fafbfc' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                            <span style={{ fontSize: '12px', fontWeight: 600, color: '#6b7280' }}>Variant {i + 1}</span>
                            {form.variants.length > 1 && (
                              <button onClick={() => removeVariant(i)}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#e05252', display: 'flex' }}>
                                {ICONS.trash}
                              </button>
                            )}
                          </div>

                          <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                            {/* Variant image slot */}
                            <div style={{ flexShrink: 0 }}>
                              <div style={{ position: 'relative' }} ref={menuOpen ? vImgMenuRef : null}>
                                <div onClick={() => { setVImgMenuId(menuOpen ? null : v.id); setVImgUrlId(null); }}
                                  style={{ width: '64px', height: '64px', borderRadius: '8px', overflow: 'hidden',
                                    cursor: 'pointer', display: 'flex', alignItems: 'center',
                                    justifyContent: 'center', background: '#f4f6f8',
                                    border: imgUrl ? '1px solid #e1e3e5' : '2px dashed #d1d5db' }}>
                                  {imgUrl ? (
                                    <img src={imgUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                  ) : (
                                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="rgba(201,151,63,0.4)" strokeWidth="1.5">
                                      <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
                                    </svg>
                                  )}
                                </div>
                                {imgUrl && (
                                  <button onClick={e => { e.stopPropagation(); setVariantImages(p => { const n = {...p}; delete n[v.id]; return n; }); }}
                                    style={{ position: 'absolute', top: '-6px', right: '-6px', width: '16px', height: '16px',
                                      borderRadius: '50%', background: '#1a1a2e', border: '1.5px solid #fff', cursor: 'pointer',
                                      color: '#fff', fontSize: '9px', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2 }}>
                                    ×
                                  </button>
                                )}

                                {/* Variant image menu */}
                                {menuOpen && (
                                  <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 200,
                                    background: '#fff', border: '1px solid #e1e3e5', borderRadius: '8px',
                                    minWidth: '150px', boxShadow: '0 8px 24px rgba(0,0,0,0.12)', overflow: 'hidden' }}>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '9px 12px',
                                      cursor: 'pointer', fontSize: '12px', color: '#374151', fontWeight: 500 }}
                                      onMouseEnter={e => e.currentTarget.style.background = '#f9fafb'}
                                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                      Upload
                                      <input type="file" accept="image/*" style={{ display: 'none' }}
                                        onChange={e => { if (e.target.files?.[0]) { handleFileUpload(e.target.files, v.id); setVImgMenuId(null); } e.target.value = ''; }} />
                                    </label>
                                    <button onClick={() => { setVImgUrlId(v.id); setVImgInput(''); setVImgMenuId(null); }}
                                      style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none',
                                        borderTop: '1px solid #f3f4f6', padding: '9px 12px', cursor: 'pointer',
                                        fontSize: '12px', color: '#374151', fontWeight: 500 }}
                                      onMouseEnter={e => e.currentTarget.style.background = '#f9fafb'}
                                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                      Add URL
                                    </button>
                                    <button onClick={() => openLib(v.id)}
                                      style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none',
                                        borderTop: '1px solid #f3f4f6', padding: '9px 12px', cursor: 'pointer',
                                        fontSize: '12px', color: '#374151', fontWeight: 500 }}
                                      onMouseEnter={e => e.currentTarget.style.background = '#f9fafb'}
                                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                      Library
                                    </button>
                                  </div>
                                )}
                              </div>

                              {/* Variant URL input */}
                              {urlOpen && (
                                <div style={{ marginTop: '4px', display: 'flex', gap: '4px', width: '190px' }}>
                                  <input value={vImgInput} onChange={e => setVImgInput(e.target.value)} autoFocus
                                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (vImgInput.trim()) { const u = vImgInput.trim(); setVariantImages(p => ({...p, [v.id]: u})); addImages([u]); setVImgInput(''); setVImgUrlId(null); } } }}
                                    placeholder="Image URL" style={{ ...S.input, flex: 1, fontSize: '11px', padding: '4px 6px' }} />
                                  <button onClick={() => { if (vImgInput.trim()) { const u = vImgInput.trim(); setVariantImages(p => ({...p, [v.id]: u})); addImages([u]); setVImgInput(''); setVImgUrlId(null); } }}
                                    style={{ ...S.btnSm, padding: '4px 8px', fontSize: '11px' }}>Set</button>
                                </div>
                              )}
                            </div>

                            {/* Name + BOM */}
                            <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                              <Field label="Variant Name" required error={errors[`vname_${i}`]}>
                                <input value={v.name} onChange={e => setVariant(i, 'name', e.target.value)}
                                  placeholder="e.g. Inner Color 11oz" maxLength={80}
                                  style={errors[`vname_${i}`] ? S.inputErr : S.input} />
                              </Field>
                              <Field label="BOM" required error={errors[`vbom_${i}`]}>
                                <CustomSelect value={v.bomId}
                                  onChange={val => setVariant(i, 'bomId', val)}
                                  options={boms.map(b => ({ value:b.id, label:b.productName }))}
                                  placeholder="Select BOM"
                                  error={errors[`vbom_${i}`]} />
                              </Field>
                            </div>
                          </div>

                          {v.bomId && (
                            <div style={{ display: 'flex', gap: '20px', marginTop: '8px', paddingTop: '8px',
                              borderTop: '1px solid #f0f1f2', fontSize: '11px', color: '#6b7280' }}>
                              <span>Floor cost: <b style={{ color: '#374151' }}>{cost > 0 ? formatCurrency(cost) : '--'}</b></span>
                              {units !== null && (
                                <span>Can produce: <b style={{ color: units > 0 ? '#2e7d32' : '#dc2626' }}>
                                  {units > 0 ? `${units} units` : 'Out of stock'}
                                </b></span>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </Card>

            {/* Pricing */}
            <Card>
              <CardTitle>Pricing</CardTitle>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>

                <div style={{ display: 'flex', gap: '6px' }}>
                  {[
                    { val: 'fixed',   label: 'Fixed',   hint: 'One price' },
                    { val: 'tiered',  label: 'Tiered',  hint: 'Qty-based' },
                    { val: 'inquiry', label: 'Inquiry', hint: 'No price' },
                  ].map(o => (
                    <button key={o.val} type="button" onClick={() => handlePricingModeChange(o.val)}
                      style={{ flex: 1, padding: '8px 10px',
                        border: `1px solid ${form.pricingMode === o.val ? '#c9973f' : '#e1e3e5'}`,
                        borderRadius: '7px', background: form.pricingMode === o.val ? '#fffbe8' : '#fff',
                        cursor: 'pointer', textAlign: 'center' }}>
                      <div style={{ fontSize: '12px', fontWeight: 700, color: form.pricingMode === o.val ? '#c9973f' : '#374151' }}>{o.label}</div>
                      <div style={{ fontSize: '10px', color: '#9ca3af', marginTop: '2px' }}>{o.hint}</div>
                    </button>
                  ))}
                </div>

                {form.pricingMode === 'fixed' && form.type === 'standalone' && (
                  <Field label="Selling Price (P)" required error={errors.price}>
                    <DecimalInput value={form.price} onChange={v => setF('price', v)}
                      placeholder="0.00" style={errors.price ? S.inputErr : undefined} />
                    {standaloneBelowCost && (
                      <Note type="warn">Below BOM cost — you would lose P{(floorCostMap[form.bomId] - Number(form.price)).toFixed(2)} per unit.</Note>
                    )}
                  </Field>
                )}

                {form.pricingMode === 'fixed' && form.type === 'multi-variant' && (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                      <thead>
                        <tr>
                          <th style={{ ...S.th, textAlign: 'left' }}>Variant</th>
                          <th style={{ ...S.th, textAlign: 'right' }}>BOM Cost</th>
                          <th style={{ ...S.th, textAlign: 'right', minWidth: '120px' }}>Your Price (P)</th>
                          <th style={{ ...S.th, textAlign: 'right' }}>Margin</th>
                        </tr>
                      </thead>
                      <tbody>
                        {form.variants.map((v, i) => {
                          const cost   = v.bomId ? (floorCostMap[v.bomId] || 0) : 0;
                          const price  = Number(v.price) || 0;
                          const margin = price > 0 ? price - cost : null;
                          return (
                            <tr key={v.id} style={{ background: i % 2 === 1 ? '#fafbfc' : '#fff' }}>
                              <td style={{ ...S.td, fontWeight: 500 }}>{v.name || `Variant ${i + 1}`}</td>
                              <td style={{ ...S.td, textAlign: 'right', color: '#6b7280' }}>{cost > 0 ? formatCurrency(cost) : '--'}</td>
                              <td style={S.td}>
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}>
                                  <DecimalInput value={v.price} onChange={val => setVariant(i, 'price', val)}
                                    placeholder="0.00" style={{ ...(errors[`vprice_${i}`] ? S.inputErr : S.input), width: '90px', textAlign: 'right' }} />
                                  {errors[`vprice_${i}`] && <span style={{ ...S.errText, fontSize: '10px' }}>{errors[`vprice_${i}`]}</span>}
                                </div>
                              </td>
                              <td style={{ ...S.td, textAlign: 'right', fontWeight: 700 }}>
                                {margin !== null
                                  ? <span style={{ color: margin >= 0 ? '#2e7d32' : '#dc2626' }}>{margin >= 0 ? '+' : ''}{formatCurrency(margin)}</span>
                                  : '--'}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                {form.pricingMode === 'tiered' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {errors.tiers && <span style={S.errText}>{errors.tiers}</span>}
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                        <thead>
                          <tr>
                            <th style={{ ...S.th, textAlign: 'left', minWidth: '80px' }}>Min Qty</th>
                            <th style={{ ...S.th, textAlign: 'left', minWidth: '80px' }}>Max Qty</th>
                            {form.type === 'standalone' ? (
                              <th style={{ ...S.th, minWidth: '110px' }}>
                                <div>Price (P)</div>
                                {form.bomId && floorCostMap[form.bomId] > 0 && (
                                  <div style={{ fontSize: '10px', color: '#9ca3af', fontWeight: 400, marginTop: '2px' }}>BOM: {formatCurrency(floorCostMap[form.bomId])}</div>
                                )}
                              </th>
                            ) : (
                              form.variants.map((v, vi) => (
                                <th key={v.id} style={{ ...S.th, minWidth: '110px', whiteSpace: 'nowrap' }}>
                                  <div>{v.name || `Variant ${vi + 1}`} (P)</div>
                                  {v.bomId && floorCostMap[v.bomId] > 0 && (
                                    <div style={{ fontSize: '10px', color: '#9ca3af', fontWeight: 400, marginTop: '2px' }}>BOM: {formatCurrency(floorCostMap[v.bomId])}</div>
                                  )}
                                </th>
                              ))
                            )}
                            <th style={{ ...S.th, width: '32px' }}></th>
                          </tr>
                        </thead>
                        <tbody>
                          {form.tiers.map((tier, ti) => (
                            <tr key={tier.id} style={{ background: ti % 2 === 1 ? '#fafbfc' : '#fff' }}>
                              <td style={S.td}><IntegerInput value={tier.minQty} onChange={v => setTierField(ti, 'minQty', v)} min={1} placeholder="1" style={{ ...S.input, width: '70px' }} /></td>
                              <td style={S.td}><IntegerInput value={tier.maxQty} onChange={v => setTierField(ti, 'maxQty', v)} min={1} placeholder="above" style={{ ...S.input, width: '70px' }} /></td>
                              {form.type === 'standalone' ? (
                                <td style={S.td}><DecimalInput value={tier.prices.__base__ ?? ''} onChange={v => setTierPrice(ti, '__base__', v)} placeholder="0.00" style={{ ...S.input, width: '90px' }} /></td>
                              ) : (
                                form.variants.map(v => (
                                  <td key={v.id} style={S.td}><DecimalInput value={tier.prices[v.id] ?? ''} onChange={val => setTierPrice(ti, v.id, val)} placeholder="0.00" style={{ ...S.input, width: '90px' }} /></td>
                                ))
                              )}
                              <td style={{ ...S.td, textAlign: 'center' }}>
                                {form.tiers.length > 1 && (
                                  <button onClick={() => removeTier(ti)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#e05252', display: 'flex' }}>{ICONS.trash}</button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <button onClick={addTier} style={S.btnSm}>{ICONS.plus} Add Tier</button>
                      <span style={{ fontSize: '11px', color: '#9ca3af' }}>Leave Max Qty blank for "and above".</span>
                    </div>
                  </div>
                )}

                {form.pricingMode === 'inquiry' && (
                  <Note type="info">No price shown on the storefront. Customers will contact you for a quote.</Note>
                )}
              </div>
            </Card>
          </div>

          {/* ───────── RIGHT SIDEBAR ───────── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

            <Card>
              <StorefrontPreview
                name={form.name}
                description={form.description}
                thumbnail={thumbnail}
                priceRange={previewPrice}
                variantCount={form.type === 'multi-variant' ? form.variants.length : 0}
                isCustomizable={form.isCustomizable}
              />
            </Card>

            <Card>
              <CardTitle>Status</CardTitle>
              <ToggleRow
                label={form.isPublished ? 'Published' : 'Draft'}
                hint={form.isPublished ? 'Visible in the storefront' : 'Hidden from customers'}
                on={form.isPublished} onChange={v => setF('isPublished', v)}
              />
            </Card>

            <Card>
              <CardTitle>Collections</CardTitle>
              {collections.length === 0 ? (
                <span style={{ fontSize: '12px', color: '#9ca3af' }}>No collections yet.</span>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '9px' }}>
                  {collections.map(c => (
                    <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                      <input type="checkbox" checked={form.collectionIds.includes(c.id)} onChange={() => toggleCollection(c.id)}
                        style={{ accentColor: '#c9973f', width: '14px', height: '14px', cursor: 'pointer' }} />
                      <span style={{ fontSize: '13px', color: '#374151', flex: 1 }}>{c.title}</span>
                      {!c.isPublished && (
                        <span style={{ fontSize: '10px', color: '#9ca3af', background: '#f3f4f6', borderRadius: '4px', padding: '1px 6px' }}>Hidden</span>
                      )}
                    </label>
                  ))}
                </div>
              )}
              <div style={{ marginTop: '10px', fontSize: '11px', color: '#c9973f', cursor: 'pointer', fontWeight: 600 }}>
                Manage Collections
              </div>
            </Card>

            <Card>
              <CardTitle>Order Settings</CardTitle>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <ToggleRow label="Made to Order" hint="No stock held; supplies ordered on demand" on={form.isMadeToOrder} onChange={v => setF('isMadeToOrder', v)} />
                <ToggleRow label="Customizable" hint="Customers upload a design file" on={form.isCustomizable} onChange={v => setF('isCustomizable', v)} />
                {form.isCustomizable && (
                  <Field label="Design Fee (P)" error={errors.designFee}>
                    <DecimalInput value={form.designFee} onChange={v => setF('designFee', v)} placeholder="0.00" />
                    <span style={{ fontSize: '11px', color: '#9ca3af', marginTop: '3px', display: 'block' }}>Optional — charged for artwork/design service</span>
                  </Field>
                )}
                <ToggleRow label="COD Available" hint="Cash on delivery allowed" on={form.allowCOD} onChange={v => setF('allowCOD', v)} />
                {form.isCustomizable && form.allowCOD && Number(form.downpaymentPct) <= 0 && (
                  <div style={{ background: '#fef9c3', border: '1px solid #fcd34d', borderRadius: '6px', padding: '8px 12px', fontSize: '12px', color: '#92400e', lineHeight: 1.5 }}>
                    ⚠ COD without a downpayment is high-risk for custom orders. Consider setting a downpayment % below.
                  </div>
                )}
                <ToggleRow label="Feature on Homepage" hint="Shows in Best Sellers on the landing page" on={form.isFeatured} onChange={v => setF('isFeatured', v)} />
                <Field label="Downpayment Required (%)" error={errors.downpaymentPct}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <IntegerInput value={form.downpaymentPct} onChange={v => setF('downpaymentPct', v)}
                      max={100} placeholder="0"
                      style={{ ...(errors.downpaymentPct ? S.inputErr : S.input), width: '70px' }} />
                    <span style={{ fontSize: '11px', color: '#6b7280' }}>
                      {Number(form.downpaymentPct) === 0 ? 'No DP required' : `${form.downpaymentPct}% on approval`}
                    </span>
                  </div>
                </Field>
                <Field label="Minimum Order Qty (MOQ)">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <IntegerInput value={form.minOrderQty} onChange={v => setF('minOrderQty', v)}
                      min={1} placeholder="1"
                      style={{ ...S.input, width: '70px' }} />
                    <span style={{ fontSize: '11px', color: '#6b7280' }}>units minimum per order</span>
                  </div>
                  {form.isCustomizable && Number(form.minOrderQty) <= 1 && (
                    <div style={{ marginTop: '6px', fontSize: '11px', color: '#b45309', background: '#fef9c3', border: '1px solid #fcd34d', borderRadius: '4px', padding: '5px 8px' }}>
                      ⚠ Customizable products typically require a minimum order. Set an MOQ to protect against unprofitable single-unit orders.
                    </div>
                  )}
                </Field>
              </div>
            </Card>

            <Card>
              <CardTitle>Visibility</CardTitle>
              <ToggleRow
                label="Hide when out of stock"
                hint="Won't appear in shop when stock is 0"
                on={form.hideWhenOutOfStock} onChange={v => setF('hideWhenOutOfStock', v)}
                disabled={form.isMadeToOrder}
              />
              {form.isMadeToOrder && (
                <span style={{ fontSize: '11px', color: '#9ca3af', marginTop: '8px', display: 'block' }}>
                  Not applicable for made-to-order products.
                </span>
              )}
            </Card>

          </div>
        </div>
      </div>

      {/* Media Library Modal */}
      {libOpen && (
        <MediaLibraryModal
          multi={libTarget === 'product'}
          onSelect={handleLibSelect}
          onClose={() => setLibOpen(false)}
          existingImages={existingImages}
          onFileUpload={(files) => handleFileUpload(files, libTarget)}
        />
      )}
    </div>
  );
}
