'use client';
import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { S, ICONS, ConfirmModal, PaginationBar, SearchBar, SummaryCard, ToastContainer, useToast, usePagination, formatCurrency, CustomSelect } from '../inventory-v2/shared';
import { loadProductsAndCollections, createProduct, updateProduct, deleteProduct, toggleProductPublish, updateCollection } from './api';
import { loadBoms, loadInventory } from '../inventory-v2/api';
import ProductAddEditPage from './ProductAddEditPage';
import { useIsPhone, KpiStrip, PhoneFilterBar, PhoneList, PhoneRow, PhoneSheet } from '@/components/dashboard/phone';
import { useAccess } from '@/contexts/AccessContext';


export default function ProductsV2() {
  const { token } = useAuth();
  // Catalog Work adds, edits and publishes products; removing one is its own tick.
  const { can: canDo } = useAccess();
  const mayWork   = canDo('products.edit');
  const mayDelete = canDo('products.delete');

  const [products,      setProducts]      = useState([]);
  const [boms,          setBoms]          = useState([]);
  const [batches,       setBatches]       = useState([]);
  const [materials,     setMaterials]     = useState([]);
  const [collections,   setCollections]   = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [saving,        setSaving]        = useState(false);
  const [view,          setView]          = useState('list');
  const [formTarget,    setFormTarget]    = useState(null);
  const [tab,           setTab]           = useState('all');   // seeded from ?tab= below
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

  // Which product is open lives in the URL, not only in React state. It was state alone, so a reload
  // - or a shared link, or the back button - threw the editor away and dropped the reader back on the
  // list, having lost their place in a catalogue of 24.
  const router       = useRouter();
  const pathname     = usePathname();
  const searchParams = useSearchParams();

  const goto = (params) => {
    const q = params ? '?' + params : '';
    router.replace(pathname + q, { scroll: false });
  };

  const openAdd  = () => { setFormTarget(null); setView('form'); goto('new=1'); };
  const openEdit = (p) => { setFormTarget(p);   setView('form'); goto('edit=' + encodeURIComponent(p.id)); };
  const closeForm = () => { setFormTarget(null); setView('list'); goto(''); };

  const handleSave = async (data) => {
    try {
      setSaving(true);
      const { collectionIds, ...formData } = data;

      const httpImages = (formData.images || []).filter(u => typeof u === 'string' && /^https?:\/\//.test(u));

      // WARNING: this hand-lists every field, and ProductAddEditPage builds its own object too. A
      // field added there but not here is silently discarded - the save succeeds, the toast says
      // "updated", and the value never reaches the API. Add to BOTH. (Better still, collapse the two
      // into one builder; left alone here so this stays a fix and not a refactor.)
      const payload = {
        name:                formData.name,
        description:         formData.description || '',
        priceType:           formData.pricingMode,
        isCustom:            formData.isCustomizable,
        // Not the opposite of isCustom - both can be true. Missing here is what made the "Sell
        // plain" toggle appear to do nothing: the form sent it, this object dropped it.
        allowPlainPurchase:  formData.allowPlainPurchase,
        isMadeToOrder:       formData.isMadeToOrder,
        requiresDownpayment: Number(formData.downpaymentPct) > 0,
        downpaymentPercent:  Number(formData.downpaymentPct) || null,
        isPublished:         formData.isPublished,
        designFee:           Number(formData.designFee) || 0,
        designTemplates:     formData.designTemplates ?? [],
        minOrderQty:         Number(formData.minOrderQty) || 1,
        bomId:               formData.type === 'standalone' ? (formData.bomId || null) : null,
        // Options travel for every product type, not just multi-variant: a standalone sticker can
        // still offer a cut choice.
        optionGroups:        formData.optionGroups ?? [],
        variantGroups:       formData.type === 'multi-variant'
          // A stable id, not just a name - `v_undefined` was showing up in shop URLs because
          // every read site keys off group.id, and this was the only place that ever wrote one.
          ? [{ id: 'variant', name: 'Variant', options: formData.variants.map(v => v.name) }]
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
        // Dropped the same way, and worth more than it looks: with no BOM this is the only figure
        // Reports has to work out profit from, so losing it silently reports every such sale as
        // pure margin.
        cost:                 (formData.cost !== '' && formData.cost != null) ? Number(formData.cost) : null,
        allowCOD:             formData.allowCOD,
        hideWhenOutOfStock:   formData.hideWhenOutOfStock,
        isFeatured:           formData.isFeatured,
        // Both were caught by the warning above: the form sent them, this list did not carry
        // them, and the save reported success while the value never left the browser. Neither
        // field exists on any product document as a result - not set to false or null, absent.
        // Pre-order therefore never took effect, and "Ask for a quote above" could not be set
        // at all.
        allowPreorder:        formData.allowPreorder,
        quoteAboveQty:        formData.quoteAboveQty ?? null,
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
      closeForm();
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
      // Option pictures belong in the picker too. They are uploaded from the Options card and were
      // reachable from nowhere else afterwards - so a cut diagram that would have made a fine
      // thumbnail had to be uploaded a second time to be usable as one. The picker is a place to
      // FIND an image, not a definition of what the gallery contains.
      (p.optionGroups || []).forEach(g =>
        (g.options || []).forEach(o => {
          if (o?.imageUrl) map.set(o.imageUrl, { id: o.imageUrl, url: o.imageUrl, label: label + ' - ' + (o.label || 'option') });
        }));
    });
    return [...map.values()];
  }, [products]);

  // Restore whatever the URL asks for, once the catalogue has actually loaded - the id means nothing
  // until there is a product to match it against.
  useEffect(() => {
    if (loading) return;
    const t = searchParams.get('tab');
    if (t && ['all', 'published', 'draft'].includes(t)) setTab(t);
    const editId = searchParams.get('edit');
    const isNew  = searchParams.get('new');
    if (editId) {
      const found = products.find(p => String(p.id) === String(editId));
      // A link to a product that has since been deleted lands on the list rather than an empty form.
      if (found) { setFormTarget(found); setView('form'); return; }
    }
    if (isNew) { setFormTarget(null); setView('form'); return; }
    setView('list');
  }, [loading, products, searchParams]);

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
  const isPhone = useIsPhone();

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
      fixed:   { bg: 'var(--st-green-bg)', color: 'var(--st-green-fg)' },
      inquiry: { bg: 'var(--st-amber-bg)', color: 'var(--st-amber-fg)' },
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

  // What actually limits SHIPPING, across every variant: the smallest number any material in any
  // recipe allows, packaging and consumables included. `calcProducible` deliberately ignores
  // cost-only materials because they do not cap a SALE - but ten boxes do cap what can leave the
  // shop, and that is what this figure is for.
  const shipLimit = (p) => {
    const bomsOf = (p.type === 'standalone' && p.bomId)
      ? [boms.find(b => b.id === p.bomId)]
      : (p.combinations || p.variants || []).map(v => boms.find(b => b.id === v.bomId));
    let build = Infinity, ship = Infinity, who = null;
    for (const bom of bomsOf) {
      if (!bom?.items?.length) continue;
      const canBuild = calcProducible(bom, matMap);
      if (canBuild < build) build = canBuild;
      for (const item of bom.items) {
        const mat = matMap[item.matId];
        if (!mat || !(item.qty > 0)) continue;
        const can = Math.floor(freeStock(mat) / item.qty);
        if (can < ship) { ship = can; who = mat.name; }
      }
    }
    if (!isFinite(build) || !isFinite(ship) || ship >= build) return null;
    return { build, ship, who };
  };

  const stockDisplay = (p) => {
    if (p.isMadeToOrder) {
      return <span style={{ fontSize: '11px', background: 'var(--st-purple-bg)', color: '#7c3aed', borderRadius: '4px', padding: '2px 7px', fontWeight: 600 }}>MTO</span>;
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
      <span style={{ fontSize: '12px', fontWeight: 700, color: units > 0 ? 'var(--st-green-fg)' : '#dc2626' }}>
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
          onCancel={closeForm}
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

      {isPhone ? (
        <>
          {mayWork && (<button onClick={openAdd} style={{ ...S.btnPrimary, minHeight:44, justifyContent:'center', width:'100%', marginBottom:12 }}>{ICONS.plus} Add Product</button>)}
          <KpiStrip items={[
            { key:'all',       label:'All',       value: counts.all },
            { key:'published', label:'Published', value: counts.published, color:'var(--st-green-fg)' },
            { key:'draft',     label:'Draft',     value: counts.draft, color:'var(--gray)' },
          ].map(k => ({ ...k, active: tab === k.key, onClick: () => setTab(k.key) }))} />
          <PhoneFilterBar search={search} onSearch={setSearch} placeholder="Search products"
            filters={[{ key:'col', label:'Collection', value:colFilter, defaultValue:'All', onChange:setColFilter,
              options:[{ value:'All', label:'All' }, ...collections.map(c => ({ value:c.id, label:c.title }))] }]}
            note={`${total} product${total !== 1 ? 's' : ''}`} />
          {slice.length === 0 ? (
            <div style={{ ...S.card, padding:'28px 16px', textAlign:'center', color:'var(--gray)', fontSize:13 }}>No products found</div>
          ) : (
            <PhoneList>
              {slice.map((p, i) => (
                <PhoneRow key={p.id} first={i === 0} mono={false} onClick={() => setExpandedStock(p.id)}
                  title={p.name}
                  chip={<span style={{ fontSize:11, fontWeight:700, borderRadius:20, padding:'3px 10px', background: p.isPublished ? '#e9f5ea' : 'var(--dark2)', color: p.isPublished ? 'var(--st-green-fg)' : 'var(--gray)' }}>{p.isPublished ? 'Published' : 'Draft'}</span>}
                  meta={[(p.type === 'multi-variant' || p.combinations?.length) ? `${(p.combinations || p.variants)?.length || 0} variants` : 'Standalone', priceDisplay(p),
                    (() => { const l = shipLimit(p); return l ? `only ${l.ship} can ship - ${l.who} short` : null; })()].filter(Boolean).join(' \u00b7 ')}
                  sub={[p.isCustomizable ? 'custom' : null, p.isMadeToOrder ? 'made to order' : null, p.allowCOD ? 'COD' : 'no COD', p.downpaymentPct > 0 ? `${p.downpaymentPct}% DP` : null].filter(Boolean).join(' \u00b7 ')} />
              ))}
            </PhoneList>
          )}
          <div style={{ padding:'12px 0' }}>
            <PaginationBar total={total} page={page} perPage={perPage} onPage={setPage} onPerPage={setPerPage} />
          </div>
          {(() => {
            const p = expandedStock ? products.find(x => x.id === expandedStock) : null;
            return (
              <PhoneSheet open={!!p} onClose={() => setExpandedStock(null)} mono={false} title={p?.name ?? ''}
                subtitle={p ? priceDisplay(p) : ''}
                chip={p ? <span style={{ fontSize:11, fontWeight:700, borderRadius:20, padding:'3px 10px', background: p.isPublished ? '#e9f5ea' : 'var(--dark2)', color: p.isPublished ? 'var(--st-green-fg)' : 'var(--gray)' }}>{p.isPublished ? 'Published' : 'Draft'}</span> : null}
                footer={p && mayWork && (
                  <div style={{ display:'flex', gap:8 }}>
                    <button onClick={() => togglePublish(p.id)} style={{ ...S.btnGhost, flex:1, minHeight:44, justifyContent:'center' }}>{p.isPublished ? 'Unpublish' : 'Publish'}</button>
                    <button onClick={() => { setExpandedStock(null); openEdit(p); }} style={{ ...S.btnPrimary, flex:2, minHeight:44, justifyContent:'center' }}>{ICONS.edit} Edit product</button>
                  </div>
                )}>
                {p && (
                  <>
                    <div style={{ padding:'12px 14px 0', display:'flex', flexWrap:'wrap', gap:6 }}>{collectionPills(p)}</div>
                    <StockBreakdown product={p} boms={boms} materials={materials} />
                  </>
                )}
              </PhoneSheet>
            );
          })()}
        </>
      ) : (<>
      <div style={{ ...S.rowBetween, marginBottom: '20px' }}>
        {mayWork && (<button onClick={openAdd} style={S.btnPrimary}>{ICONS.plus} Add Product</button>)}
      </div>

      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '20px' }}>
        <SummaryCard label="Total"     value={counts.all}       accent />
        <SummaryCard label="Published" value={counts.published} color="var(--st-green-fg)" />
        <SummaryCard label="Draft"     value={counts.draft}     color="var(--gray)" />
      </div>

      <div style={{ ...S.card, marginBottom: '16px' }}>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', padding: '0 16px' }}>
          {[['all', 'All'], ['published', 'Published'], ['draft', 'Draft']].map(([k, label]) => (
            <button key={k} onClick={() => {
              setTab(k);
              // Same reason as Inventory Overview: a tab held only in React state is gone on
              // reload, and the address bar keeps whatever it was opened with.
              const q = new URLSearchParams(Array.from(searchParams.entries()));
              q.set('tab', k);
              router.replace(`?${q.toString()}`, { scroll: false });
            }}
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
          <table className="pmp-rt" style={{ width: '100%', borderCollapse: 'collapse' }}>
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
                        {(() => {
                          const lim = shipLimit(p);
                          if (!lim) return null;
                          return (
                            <div title={`${lim.who} runs out first: enough for ${lim.ship} of the ${lim.build} this product can build. Expand the row to see every material.`}
                              style={{ marginTop: 3, fontSize: '10px', fontWeight: 700, letterSpacing: '.2px',
                                color:'var(--st-orange-fg)', background: 'rgba(224,168,82,0.14)', border: '1px solid rgba(224,168,82,0.35)',
                                borderRadius: 4, padding: '1px 6px', display: 'inline-block' }}>
                              only {lim.ship} can ship - {lim.who} short
                            </div>
                          );
                        })()}
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
                      {p.allowCOD       && <span style={{ fontSize: '10px', background: 'var(--st-green-bg)', color: 'var(--st-green-fg)', borderRadius: '4px', padding: '2px 6px', fontWeight: 600 }}>COD</span>}
                      {!p.allowCOD      && <span style={{ fontSize: '10px', background: 'var(--st-red-bg)', color: '#dc2626', borderRadius: '4px', padding: '2px 6px', fontWeight: 600 }}>Online</span>}
                      {p.downpaymentPct > 0 && <span style={{ fontSize: '10px', background: '#fff8e1', color:'var(--st-orange-fg)', borderRadius: '4px', padding: '2px 6px', fontWeight: 600 }}>{p.downpaymentPct}% DP</span>}
                    </div>
                  </td>

                  <td style={S.td}>
                    <button onClick={mayWork ? () => togglePublish(p.id) : undefined}
                      title={mayWork ? (p.isPublished ? 'Click to unpublish' : 'Click to publish') : undefined}
                      style={{ background: p.isPublished ? '#e9f5ea' : 'var(--dark2)', color: p.isPublished ? 'var(--st-green-fg)' : 'var(--gray)',
                        border: 'none', borderRadius: '20px', padding: '3px 12px', fontSize: '12px', fontWeight: 600,
                        cursor: mayWork ? 'pointer' : 'default', display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                      <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: p.isPublished ? 'var(--st-green-fg)' : 'var(--gray)', flexShrink: 0 }} />
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
                      {mayWork && (<button onClick={() => openEdit(p)} style={S.btnSmGhost}>{ICONS.edit}</button>)}
                      {mayDelete && (<button onClick={() => setDelTarget(p)} style={S.btnSmDanger}>{ICONS.trash}</button>)}
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

      </>)}

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
  const { can } = useAccess();
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
          if (!counts(mat)) continue;
          const can = item.qty > 0 ? Math.floor(freeStock(mat) / item.qty) : Infinity;
          if (can < bottleneckMin) { bottleneckMin = can; bottleneckId = item.matId; }
        }

        // "Can build" counts only the materials that cap a sale - the blank. The box and the
        // paper are cost-only, so they never lower it, and the panel showed them as "- cost only":
        // a dead end on the exact row the owner was looking at. They do not stop you SELLING, but
        // they absolutely stop you SHIPPING, and 10 boxes against 114 mugs is worth one glance.
        //
        // So every material now says how far it carries the build, and the header says how many
        // can leave the shop complete.
        let shipComplete = prod;
        let shortestId = null;
        for (const item of bom.items || []) {
          const mat = matMap[item.matId];
          if (!mat || !(item.qty > 0)) continue;
          const can = Math.floor(freeStock(mat) / item.qty);
          if (can < shipComplete) { shipComplete = can; shortestId = item.matId; }
        }
        const shortMat = shortestId ? matMap[shortestId] : null;
        const countedNames = (bom.items || [])
          .map(i => matMap[i.matId]).filter(counts).map(m => m.name);
        const hasCostOnly = (bom.items || []).some(i => matMap[i.matId] && matMap[i.matId].isOnDemand);

        const prodColor = prod === 0 ? 'var(--st-red-fg)' : prod <= 10 ? 'var(--st-orange-fg)' : '#1a7f3c';

        return (
          <div key={vi}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'8px' }}>
              {v.label
                ? <span style={{ fontSize:'12px', fontWeight:700, color:'var(--gray-light)' }}>{v.label}</span>
                : <span style={{ fontSize:'12px', color:'var(--gray)' }}>Standalone</span>
              }
              <span style={{ fontSize:'12px', fontWeight:700, color:prodColor }}>
                {prod} can sell
                {shipComplete < prod && (
                  <span style={{ color:'var(--st-orange-fg)', fontWeight:700 }}>
                    {' · '}{shipComplete} ready to ship
                  </span>
                )}
              </span>
            </div>
            <table className="pmp-rt" style={{ width:'100%', borderCollapse:'collapse' }}>
              <thead>
                <tr>
                  {['Material','Stock','Need / unit','Covers the build'].map(h => (
                    <th key={h} style={{ fontSize:'10px', fontWeight:700, color:'var(--gray)', textTransform:'uppercase', letterSpacing:'.4px', padding:'3px 8px', textAlign:'left' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(bom.items || []).map((item, ii) => {
                  const mat    = matMap[item.matId];
                  if (!mat) return null;
                  const counted = counts(mat);
                  const can    = item.qty > 0 ? Math.floor(freeStock(mat) / item.qty) : Infinity;
                  const isLimit = counted && item.matId === bottleneckId;
                  const c      = !counted ? 'var(--gray)' : can === 0 ? 'var(--st-red-fg)' : can <= 10 ? 'var(--st-orange-fg)' : '#1a7f3c';
                  return (
                    <tr key={ii} style={{ opacity: counted ? 1 : 0.62 }}>
                      <td style={{ padding:'4px 8px', fontSize:'12px', color:'var(--gray-light)', fontWeight: isLimit ? 600 : 400 }}>
                        <span style={{ color: counted ? '#1a7f3c' : 'var(--gray)', marginRight:'5px', fontSize:'10px' }}>{counted ? '●' : '○'}</span>
                        {isLimit && <span style={{ fontSize:'9px', fontWeight:700, background:'#fde8e8', color:'var(--st-red-fg)', border:'1px solid color-mix(in srgb, var(--st-red-fg) 35%, transparent)', borderRadius:'3px', padding:'1px 4px', marginRight:'5px', textTransform:'uppercase' }}>limit</span>}
                        {mat.name}
                      </td>
                      <td style={{ padding:'4px 8px', fontSize:'12px', color:'var(--gray-light)' }}>
                        {freeStock(mat)} {mat.unit}
                        {Number(mat.reservedQty ?? 0) > 0 && (
                          <span style={{ color:'var(--st-orange-fg)', fontSize:'11px' }}> ({mat.reservedQty} held)</span>
                        )}
                      </td>
                      <td style={{ padding:'4px 8px', fontSize:'12px', color:'var(--gray)' }}>{item.qty} {mat.unit}</td>
                      <td style={{ padding:'4px 8px', fontSize:'12px', fontWeight:600, color:c, minWidth:150 }}>
                        {(() => {
                          // A material that covers the whole build needs one character, not four
                          // facts. The bar, the fraction and the shortfall are spent only on the
                          // row that is actually holding things up.
                          // Nothing can be made at all: "0 of 0" is not covered, it is empty. The
                          // row at zero is the reason; the others are waiting on it, not "Enough".
                          if (prod <= 0) {
                            const out = counted && can <= 0;
                            return (
                              <div style={{ fontSize:'11px', fontWeight:700, color: out ? 'var(--st-red-fg)' : 'var(--gray)' }}>
                                {out ? 'Out - restock to sell' : counted ? `Has enough for ${can}` : 'cost only'}
                              </div>
                            );
                          }
                          const covers = Math.min(can, prod);
                          const short  = Math.max(0, prod - covers);
                          const pct    = prod > 0 ? Math.min(100, Math.round((covers / prod) * 100)) : 100;
                          const tone   = short <= 0 ? 'var(--st-green-fg)' : pct < 25 ? 'var(--st-red-fg)' : 'var(--st-orange-fg)';
                          const title  = `${freeStock(mat)} ${mat.unit} on hand, ${item.qty} per unit - enough for ${covers} of ${prod}.`;
                          return (
                            <div title={title}>
                              <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                                <span style={{ width:70, height:5, borderRadius:3, background:'var(--dark2)', overflow:'hidden', flexShrink:0 }}>
                                  <span style={{ display:'block', width:`${Math.max(2, pct)}%`, height:'100%', background:tone }} />
                                </span>
                                <span style={{ color:tone, fontWeight:700, fontSize:'11.5px' }}>{covers} of {prod}</span>
                              </div>
                              <div style={{ fontSize:'10.5px', marginTop:2, color:tone, fontWeight:700 }}>
                                {short <= 0 ? 'Enough' : `Short by ${short} ${mat.unit ?? ''}`}
                                {!counted && <span style={{ color:'var(--gray)', fontWeight:400 }}>{' - cost only'}</span>}
                              </div>
                            </div>
                          );
                        })()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div style={{ padding:'6px 8px 0', fontSize:'11px', color:'var(--gray)', lineHeight:1.5 }}
              title={countedNames.length
                ? `What caps a sale: ${countedNames.join(', ')}. Packaging and consumables are costed and appear in To Buy, but do not cap what you can sell.`
                : undefined}>
              {countedNames.length === 0 &&
                <b style={{ color:'var(--st-orange-fg)' }}>Nothing is counted - every material here is cost only, so this cannot say when it runs out.</b>}
              {shortMat && shipComplete < prod && (
                <div style={{ marginTop:5, display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' }}>
                  <b style={{ color:'var(--st-orange-fg)' }}>
                    {shortMat.name} runs out first: enough for {shipComplete} of the {prod} you can
                    build - short by {prod - shipComplete}.
                  </b>
                  {can('toBuy') && (<a href="/dashboard/business/to-buy" style={{ fontSize:'11px', fontWeight:700, color:'var(--gold)', textDecoration:'none' }}>
                    Open To Buy
                  </a>)}
                </div>
              )}
            </div>
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

// Cost-only materials get no vote on how many can be built. A box decides what goes on the To Buy
// list, not how many mugs the shop can sell - and counting it is what made all three mug variants
// read "50 can build" off one shelf of fifty boxes.
export function counts(mat) {
  return !!mat && !mat.isOnDemand;
}

function calcProducible(bom, matMap) {
  if (!bom?.items?.length) return 0;
  let min = Infinity;
  for (const item of bom.items) {
    const mat = matMap[item.matId];
    // A line whose material no longer exists is a hole in the recipe, not a material that
    // happens not to cap the build. Skipping it the way we skip a cost-only line makes the
    // product claim it can make MORE than it can - which is the one direction a stock figure
    // must never be wrong in. Nothing can be built from a recipe we cannot read.
    if (!mat) return 0;
    if (!counts(mat)) continue;
    const can = item.qty > 0 ? Math.floor(freeStock(mat) / item.qty) : Infinity;
    if (can < min) min = can;
  }
  return min === Infinity ? 0 : min;
}
