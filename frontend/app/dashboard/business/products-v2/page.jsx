'use client';
import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { S, ICONS, ConfirmModal, PaginationBar, SearchBar, SummaryCard, ToastContainer, useToast, usePagination, formatCurrency, CustomSelect } from '../inventory-v2/shared';
import { loadProductsAndCollections, createProduct, updateProduct, deleteProduct, toggleProductPublish, updateCollection } from './api';
import { loadBoms, loadInventory } from '../inventory-v2/api';
import ProductAddEditPage from './ProductAddEditPage';


export default function ProductsV2() {
  const { token } = useAuth();

  const [products,      setProducts]      = useState([]);
  const [boms,          setBoms]          = useState([]);
  const [batches,       setBatches]       = useState([]);
  const [materials,     setMaterials]     = useState([]);
  const [collections,   setCollections]   = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [saving,        setSaving]        = useState(false);
  const [view,          setView]          = useState('list');
  const [formTarget,    setFormTarget]    = useState(null);
  const [tab,           setTab]           = useState('all');
  const [search,        setSearch]        = useState('');
  const [colFilter,     setColFilter]     = useState('All');
  const [delTarget,     setDelTarget]     = useState(null);
  const [expandedStock, setExpandedStock] = useState(null);
  const { toasts, push: toast, dismiss } = useToast();

  const refresh = useCallback(async () => {
    if (!token) return;
    const [{ prods, cols }, bomsData, { mats, bats }] = await Promise.all([
      loadProductsAndCollections(token),
      loadBoms(token),
      loadInventory(token),
    ]);
    setProducts(prods);
    setCollections(cols);
    setBoms(bomsData);
    setBatches(bats);
    setMaterials(mats);
  }, [token]);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    refresh().catch(e => toast(e.message || 'Failed to load.', 'error')).finally(() => setLoading(false));
  }, [token]);

  const openAdd  = () => { setFormTarget(null); setView('form'); };
  const openEdit = (p) => { setFormTarget(p);   setView('form'); };

  const handleSave = async (data) => {
    try {
      setSaving(true);
      const { collectionIds, ...formData } = data;

      const httpImages = (formData.images || []).filter(u => typeof u === 'string' && /^https?:\/\//.test(u));

      const payload = {
        name:                formData.name,
        description:         formData.description || '',
        priceType:           formData.pricingMode,
        isCustom:            formData.isCustomizable,
        isMadeToOrder:       formData.isMadeToOrder,
        requiresDownpayment: Number(formData.downpaymentPct) > 0,
        downpaymentPercent:  Number(formData.downpaymentPct) || null,
        isPublished:         formData.isPublished,
        designFee:           Number(formData.designFee) || 0,
        designTemplates:     formData.designTemplates ?? [],
        minOrderQty:         Number(formData.minOrderQty) || 1,
        bomId:               formData.type === 'standalone' ? (formData.bomId || null) : null,
        variantGroups:       formData.type === 'multi-variant'
          ? [{ name: 'Variant', options: formData.variants.map(v => v.name) }]
          : [],
        combinations:        formData.type === 'multi-variant'
          ? formData.variants.map(v => ({
              id: v.id,
              name: v.name, bomId: v.bomId, price: Number(v.price || 0),
              ...((formData.variantImages || {})[v.id] ? { imageUrl: formData.variantImages[v.id] } : {}),
            }))
          : [],
        variantPrices:       formData.type === 'multi-variant' && formData.pricingMode === 'fixed'
          ? Object.fromEntries(formData.variants.map(v => [v.id, Number(v.price || 0)]))
          : {},
        variantImageUrls:    formData.type === 'multi-variant'
          ? Object.fromEntries(
              formData.variants
                .map(v => [v.id, (formData.variantImages || {})[v.id]])
                .filter(([, u]) => u)
            )
          : {},
        trackInventory:       true,
        allowCOD:             formData.allowCOD,
        hideWhenOutOfStock:   formData.hideWhenOutOfStock,
        isFeatured:           formData.isFeatured,
      };

      payload.images    = httpImages;
      payload.thumbnail = httpImages[0] || '';

      if (formData.pricingMode === 'tiered') {
        payload.priceTiers = (formData.tiers || []).map(t => ({
          id:     t.id,
          minQty: Number(t.minQty),
          maxQty: t.maxQty != null ? Number(t.maxQty) : null,
          prices: Object.fromEntries(Object.entries(t.prices || {}).map(([k, v]) => [k, Number(v)])),
        }));
        payload.price = null;
      } else if (formData.pricingMode === 'fixed') {
        payload.priceTiers = [];
        payload.price = Number(formData.price);
      } else {
        payload.priceTiers = [];
        payload.price = null;
      }

      let savedId;
      if (formTarget) {
        await updateProduct(token, formTarget.id, payload);
        savedId = formTarget.id;
        toast(`"${formData.name}" updated.`, 'success');
      } else {
        const created = await createProduct(token, {
          ...payload,
          category:        'Other',
          subCategoryName: formData.name,
        });
        savedId = String(created._id ?? created.id ?? '');
        toast(`"${formData.name}" added.`, 'success');
      }

      // Update collection memberships
      const prevIds = formTarget?.collectionIds ?? [];
      const newIds  = collectionIds ?? [];
      const toAdd    = newIds.filter(id => !prevIds.includes(id));
      const toRemove = prevIds.filter(id => !newIds.includes(id));

      await Promise.all([
        ...toAdd.map(colId => {
          const col = collections.find(c => c.id === colId);
          if (!col || col.productIds.includes(savedId)) return Promise.resolve();
          return updateCollection(token, colId, { productIds: [...col.productIds, savedId] });
        }),
        ...toRemove.map(colId => {
          const col = collections.find(c => c.id === colId);
          if (!col) return Promise.resolve();
          return updateCollection(token, colId, { productIds: col.productIds.filter(id => id !== savedId) });
        }),
      ]);

      await refresh();
      setView('list');
    } catch (e) {
      toast(e.message || 'Failed to save.', 'error');
    } finally {
      setSaving(false);
    }
  };

  // ── All hooks before early return ─────────────────────────────────────────

  const counts = {
    all:       products.length,
    published: products.filter(p =>  p.isPublished).length,
    draft:     products.filter(p => !p.isPublished).length,
  };

  const existingImages = useMemo(() => {
    const map = new Map();
    products.forEach(p => {
      const label = p.name || '';
      if (p.thumbnail) map.set(p.thumbnail, { id: p.thumbnail, url: p.thumbnail, label });
      (p.images || []).forEach(u => { if (u && typeof u === 'string') map.set(u, { id: u, url: u, label }); });
    });
    return [...map.values()];
  }, [products]);

  const filtered = useMemo(() => {
    let list = products;
    if (tab === 'published') list = list.filter(p =>  p.isPublished);
    if (tab === 'draft')     list = list.filter(p => !p.isPublished);
    if (colFilter !== 'All') list = list.filter(p => p.collectionIds?.includes(colFilter));
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(p => p.name.toLowerCase().includes(q));
    }
    return list;
  }, [products, tab, colFilter, search]);

  const { slice, page, perPage, total, setPage, setPerPage } = usePagination(filtered);

  const priceDisplay = (p) => {
    if (p.pricingMode === 'inquiry') return 'Inquiry';
    if (p.pricingMode === 'tiered') {
      const all = (p.tiers || []).flatMap(t => Object.values(t.prices || {})).filter(v => v > 0);
      if (!all.length) return '--';
      const mn = Math.min(...all), mx = Math.max(...all);
      return mn === mx ? formatCurrency(mn) : `${formatCurrency(mn)} - ${formatCurrency(mx)}`;
    }
    if (p.type === 'multi-variant' || p.combinations?.length) {
      const prices = (p.combinations || p.variants || []).map(v => v.price).filter(v => v > 0);
      if (!prices.length) return '--';
      const mn = Math.min(...prices), mx = Math.max(...prices);
      return mn === mx ? formatCurrency(mn) : `${formatCurrency(mn)} - ${formatCurrency(mx)}`;
    }
    return p.price ? formatCurrency(p.price) : '--';
  };

  const modeBadge = (mode) => {
    const map = {
      tiered:  { bg: '#fdf3e0', color: 'var(--gold)' },
      fixed:   { bg: '#f0fdf4', color: '#15803d' },
      inquiry: { bg: '#fef9c3', color: '#854d0e' },
    };
    const s = map[mode] || map.fixed;
    return (
      <span style={{ fontSize: '10px', fontWeight: 700, background: s.bg, color: s.color,
        borderRadius: '4px', padding: '1px 6px', textTransform: 'capitalize' }}>
        {mode}
      </span>
    );
  };

  const collectionPills = (p) => {
    const titles = (p.collectionIds || []).map(id => collections.find(c => c.id === id)?.title).filter(Boolean);
    if (!titles.length) return <span style={{ color: 'var(--gray)', fontSize: '12px' }}>--</span>;
    return (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
        {titles.slice(0, 2).map(t => (
          <span key={t} style={{ fontSize: '11px', background: 'var(--dark2)', borderRadius: '4px', padding: '2px 7px', color: 'var(--gray-light)' }}>{t}</span>
        ))}
        {titles.length > 2 && <span style={{ fontSize: '11px', color: 'var(--gray)' }}>+{titles.length - 2}</span>}
      </div>
    );
  };

  const matMap = useMemo(() => {
    const m = {};
    materials.forEach(mat => { m[mat.id] = mat; });
    return m;
  }, [materials]);

  const stockDisplay = (p) => {
    if (p.isMadeToOrder) {
      return <span style={{ fontSize: '11px', background: '#f5f3ff', color: '#7c3aed', borderRadius: '4px', padding: '2px 7px', fontWeight: 600 }}>MTO</span>;
    }
    let units = null;
    if (p.type === 'standalone' && p.bomId) {
      const bom = boms.find(b => b.id === p.bomId);
      units = bom ? calcProducible(bom, matMap) : null;
    } else if ((p.type === 'multi-variant' || p.combinations?.length) && (p.combinations || p.variants)?.length) {
      const vals = (p.combinations || p.variants).map(v => {
        const bom = boms.find(b => b.id === v.bomId);
        return bom ? calcProducible(bom, matMap) : null;
      }).filter(v => v !== null);
      units = vals.length ? Math.min(...vals) : null;
    }
    if (units === null) return <span style={{ color: 'var(--gray)', fontSize: '12px' }}>--</span>;
    return (
      <span style={{ fontSize: '12px', fontWeight: 700, color: units > 0 ? '#2e7d32' : '#dc2626' }}>
        {units > 0 ? `${units} units` : 'Out of stock'}
      </span>
    );
  };

  const togglePublish = async (id) => {
    const p = products.find(x => x.id === id);
    try {
      await toggleProductPublish(token, id);
      setProducts(prev => prev.map(x => x.id === id ? { ...x, isPublished: !x.isPublished } : x));
      toast(`"${p?.name}" ${p?.isPublished ? 'unpublished' : 'published'}.`, 'info');
    } catch (e) {
      toast(e.message || 'Failed to toggle.', 'error');
    }
  };

  const doDelete = async () => {
    try {
      await deleteProduct(token, delTarget.id);
      setProducts(prev => prev.filter(p => p.id !== delTarget.id));
      toast(`"${delTarget.name}" deleted.`, 'warn');
    } catch (e) {
      toast(e.message || 'Failed to delete.', 'error');
    } finally {
      setDelTarget(null);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  if (view === 'form') {
    return (
      <div style={{ minHeight: '100%' }}>
        <ProductAddEditPage
          product={formTarget}
          boms={boms}
          batches={batches}
          materials={materials}
          collections={collections}
          existingImages={existingImages}
          onSave={handleSave}
          onCancel={() => setView('list')}
        />
        <ToastContainer toasts={toasts} dismiss={dismiss} />
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ ...S.page, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '300px' }}>
        <span style={{ color: 'var(--gray)', fontSize: '14px' }}>Loading products...</span>
      </div>
    );
  }

  return (
    <div style={S.page}>

      <div style={{ ...S.rowBetween, marginBottom: '20px' }}>
        <button onClick={openAdd} style={S.btnPrimary}>{ICONS.plus} Add Product</button>
      </div>

      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '20px' }}>
        <SummaryCard label="Total"     value={counts.all}       accent />
        <SummaryCard label="Published" value={counts.published} color="#2e7d32" />
        <SummaryCard label="Draft"     value={counts.draft}     color="var(--gray)" />
      </div>

      <div style={{ ...S.card, marginBottom: '16px' }}>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', padding: '0 16px' }}>
          {[['all', 'All'], ['published', 'Published'], ['draft', 'Draft']].map(([k, label]) => (
            <button key={k} onClick={() => setTab(k)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '12px 16px', fontSize: '13px', fontWeight: 600,
                color: tab === k ? 'var(--gold)' : 'var(--gray)', borderBottom: tab === k ? '2px solid var(--gold)' : '2px solid transparent',
                marginBottom: '-1px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              {label}
              <span style={{ background: tab === k ? '#f5ede0' : '#f0f0f0', color: tab === k ? 'var(--gold)' : 'var(--gray)',
                borderRadius: '20px', padding: '1px 8px', fontSize: '11px', fontWeight: 700 }}>{counts[k]}</span>
            </button>
          ))}
        </div>

        {/* Toolbar */}
        <div style={{ ...S.rowBetween, padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <SearchBar value={search} onChange={setSearch} placeholder="Search products..." style={{ width: '220px' }} />
            <CustomSelect value={colFilter} onChange={setColFilter}
              options={[{ value:'All', label:'All Collections' }, ...collections.map(c => ({ value:c.id, label:c.title }))]}
              style={{ width:'160px' }} />
          </div>
        </div>

        {/* Table */}
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Product', 'Collections', 'Pricing', 'Flags', 'Status', ''].map(h => (
                  <th key={h} style={S.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {slice.length === 0 ? (
                <tr><td colSpan={6} style={{ textAlign: 'center', padding: '48px', color: 'var(--gray)', fontSize: '14px' }}>No products found</td></tr>
              ) : slice.map(p => (
                <React.Fragment key={p.id}>
                <tr style={S.tr}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--dark2)'}
                  onMouseLeave={e => e.currentTarget.style.background = ''}>

                  <td style={S.td}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      {p.thumbnail
                        ? <img src={p.thumbnail} alt={p.name} style={{ width: '40px', height: '40px', borderRadius: '7px', objectFit: 'cover', border: '1px solid var(--border)' }} />
                        : <div style={{ width: '40px', height: '40px', borderRadius: '7px', background: 'var(--dark2)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#bbb', fontSize: '16px' }}>+</div>
                      }
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '14px' }}>{p.name}</div>
                        <div style={{ fontSize: '11px', color: 'var(--gray)' }}>
                          {(p.type === 'multi-variant' || p.combinations?.length) ? `${(p.combinations || p.variants)?.length || 0} variants` : 'Standalone'}
                        </div>
                      </div>
                    </div>
                  </td>

                  <td style={S.td}>{collectionPills(p)}</td>

                  <td style={S.td}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      {modeBadge(p.pricingMode)}
                      <span style={{ fontWeight: 700, color: p.pricingMode === 'inquiry' ? 'var(--gray)' : 'var(--gold)', fontSize: '13px', whiteSpace: 'nowrap' }}>
                        {priceDisplay(p)}
                      </span>
                    </div>
                  </td>

                  <td style={S.td}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                      {p.isCustomizable && <span style={{ fontSize: '10px', background: '#fdf3e0', color: 'var(--gold)', borderRadius: '4px', padding: '2px 6px', fontWeight: 600 }}>Custom</span>}
                      {p.isMadeToOrder  && <span style={{ fontSize: '10px', background: 'var(--dark2)', color: 'var(--gray-light)', borderRadius: '4px', padding: '2px 6px', fontWeight: 600 }}>MTO</span>}
                      {p.allowCOD       && <span style={{ fontSize: '10px', background: '#f0fdf4', color: '#15803d', borderRadius: '4px', padding: '2px 6px', fontWeight: 600 }}>COD</span>}
                      {!p.allowCOD      && <span style={{ fontSize: '10px', background: '#fef2f2', color: '#dc2626', borderRadius: '4px', padding: '2px 6px', fontWeight: 600 }}>Online</span>}
                      {p.downpaymentPct > 0 && <span style={{ fontSize: '10px', background: '#fff8e1', color: '#b45309', borderRadius: '4px', padding: '2px 6px', fontWeight: 600 }}>{p.downpaymentPct}% DP</span>}
                    </div>
                  </td>

                  <td style={S.td}>
                    <button onClick={() => togglePublish(p.id)}
                      title={p.isPublished ? 'Click to unpublish' : 'Click to publish'}
                      style={{ background: p.isPublished ? '#e9f5ea' : 'var(--dark2)', color: p.isPublished ? '#2e7d32' : 'var(--gray)',
                        border: 'none', borderRadius: '20px', padding: '3px 12px', fontSize: '12px', fontWeight: 600,
                        cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                      <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: p.isPublished ? '#2e7d32' : 'var(--gray)', flexShrink: 0 }} />
                      {p.isPublished ? 'Published' : 'Draft'}
                    </button>
                  </td>

                  <td style={{ ...S.td, textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', alignItems: 'center' }}>
                      <button
                        onClick={() => setExpandedStock(expandedStock === p.id ? null : p.id)}
                        style={{ ...S.btnSmGhost, padding:'5px 8px' }}
                        title="View producible breakdown"
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                          style={{ transform: expandedStock === p.id ? 'rotate(180deg)' : 'none', transition:'transform .2s' }}>
                          <polyline points="6 9 12 15 18 9" />
                        </svg>
                      </button>
                      <button onClick={() => openEdit(p)} style={S.btnSmGhost}>{ICONS.edit}</button>
                      <button onClick={() => setDelTarget(p)} style={S.btnSmDanger}>{ICONS.trash}</button>
                    </div>
                  </td>

                </tr>
                {expandedStock === p.id && (
                  <tr>
                    <td colSpan={6} style={{ padding:0, background:'var(--dark2)', borderBottom:'1px solid var(--border)' }}>
                      <StockBreakdown product={p} boms={boms} materials={materials} />
                    </td>
                  </tr>
                )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)' }}>
          <PaginationBar total={total} page={page} perPage={perPage} onPage={setPage} onPerPage={setPerPage} />
        </div>
      </div>

      <ConfirmModal
        open={!!delTarget}
        onClose={() => setDelTarget(null)}
        onConfirm={doDelete}
        title="Delete Product"
        confirmLabel="Delete"
        confirmStyle="danger"
        message={`Delete "${delTarget?.name}"? This cannot be undone.`}
      />

      <ToastContainer toasts={toasts} dismiss={dismiss} />
    </div>
  );
}

function StockBreakdown({ product, boms, materials }) {
  const matMap = useMemo(() => {
    const m = {};
    (materials || []).forEach(mat => { m[mat.id] = mat; });
    return m;
  }, [materials]);

  const bomMap = useMemo(() => {
    const m = {};
    (boms || []).forEach(b => { m[b.id] = b; });
    return m;
  }, [boms]);

  const variants = useMemo(() => {
    if (product.type === 'multi-variant' || product.combinations?.length) {
      return (product.combinations || product.variants || []).map(v => {
        const bom  = bomMap[v.bomId];
        const prod = bom ? calcProducible(bom, matMap) : null;
        return { label: v.name, bom, producible: prod };
      });
    }
    const bom  = bomMap[product.bomId];
    const prod = bom ? calcProducible(bom, matMap) : null;
    return [{ label: null, bom, producible: prod }];
  }, [product, bomMap, matMap]);

  if (variants.every(v => v.bom == null)) {
    return <div style={{ padding:'12px 20px', fontSize:'12px', color:'var(--gray)' }}>No BOM linked to this product.</div>;
  }

  return (
    <div style={{ padding:'12px 20px 14px', display:'flex', flexDirection:'column', gap:'14px' }}>
      {variants.map((v, vi) => {
        const prod = v.producible ?? 0;
        const bom  = v.bom;
        if (!bom) return null;

        let bottleneckId = null, bottleneckMin = Infinity;
        for (const item of bom.items || []) {
          const mat = matMap[item.matId];
          if (!mat) continue;
          const can = item.qty > 0 ? Math.floor(freeStock(mat) / item.qty) : Infinity;
          if (can < bottleneckMin) { bottleneckMin = can; bottleneckId = item.matId; }
        }

        const prodColor = prod === 0 ? '#c62828' : prod <= 10 ? '#b45309' : '#1a7f3c';

        return (
          <div key={vi}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'8px' }}>
              {v.label
                ? <span style={{ fontSize:'12px', fontWeight:700, color:'var(--gray-light)' }}>{v.label}</span>
                : <span style={{ fontSize:'12px', color:'var(--gray)' }}>Standalone</span>
              }
              <span style={{ fontSize:'12px', fontWeight:700, color:prodColor }}>{prod} can build</span>
            </div>
            <table style={{ width:'100%', borderCollapse:'collapse' }}>
              <thead>
                <tr>
                  {['Material','Stock','Need / unit','Can make'].map(h => (
                    <th key={h} style={{ fontSize:'10px', fontWeight:700, color:'var(--gray)', textTransform:'uppercase', letterSpacing:'.4px', padding:'3px 8px', textAlign:'left' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(bom.items || []).map((item, ii) => {
                  const mat    = matMap[item.matId];
                  if (!mat) return null;
                  const can    = item.qty > 0 ? Math.floor(freeStock(mat) / item.qty) : Infinity;
                  const isLimit = item.matId === bottleneckId;
                  const c      = can === 0 ? '#c62828' : can <= 10 ? '#b45309' : '#1a7f3c';
                  return (
                    <tr key={ii}>
                      <td style={{ padding:'4px 8px', fontSize:'12px', color:'var(--gray-light)', fontWeight: isLimit ? 600 : 400 }}>
                        {isLimit && <span style={{ fontSize:'9px', fontWeight:700, background:'#fde8e8', color:'#c62828', border:'1px solid #fca5a5', borderRadius:'3px', padding:'1px 4px', marginRight:'5px', textTransform:'uppercase' }}>limit</span>}
                        {mat.name}
                      </td>
                      <td style={{ padding:'4px 8px', fontSize:'12px', color:'var(--gray-light)' }}>
                        {freeStock(mat)} {mat.unit}
                        {Number(mat.reservedQty ?? 0) > 0 && (
                          <span style={{ color:'#b45309', fontSize:'11px' }}> ({mat.reservedQty} held)</span>
                        )}
                      </td>
                      <td style={{ padding:'4px 8px', fontSize:'12px', color:'var(--gray)' }}>{item.qty} {mat.unit}</td>
                      <td style={{ padding:'4px 8px', fontSize:'12px', fontWeight:600, color:c }}>{can}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {vi < variants.filter(x => x.bom).length - 1 && (
              <div style={{ borderTop:'1px solid var(--border)', marginTop:'10px' }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// Availability is stock MINUS what open orders already hold. Counting raw stockQty made this screen
// say "100 can build" while the storefront said "Only 10 left" off the same materials, with nothing on
// either page to explain the gap - the reservations were invisible here.
export function freeStock(mat) {
  return Math.max(0, Number(mat?.stockQty ?? 0) - Number(mat?.reservedQty ?? 0));
}

function calcProducible(bom, matMap) {
  if (!bom?.items?.length) return 0;
  let min = Infinity;
  for (const item of bom.items) {
    const mat = matMap[item.matId];
    if (!mat) continue;
    const can = item.qty > 0 ? Math.floor(freeStock(mat) / item.qty) : Infinity;
    if (can < min) min = can;
  }
  return min === Infinity ? 0 : min;
}
