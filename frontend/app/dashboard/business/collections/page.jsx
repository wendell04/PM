'use client';
import { useState, useMemo, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { S, ICONS, ConfirmModal, PaginationBar, SearchBar, SummaryCard, ToastContainer, useToast, usePagination } from '../inventory-v2/shared';
import { loadProductsAndCollections, createCollection, updateCollection, deleteCollection, toggleCollectionPublish, normCollection } from '../products-v2/api';
import { uploadImage } from '@/lib/productApi';

function toSlug(str) {
  return str.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

const EMPTY_FORM = { title: '', slug: '', description: '', image: '', isPublished: false, productIds: [], landing_order: null, landing_image_position: null };

// ── Toggle ────────────────────────────────────────────────────────────────────

function Toggle({ on, onChange }) {
  return (
    <button type="button" onClick={() => onChange(!on)}
      style={{ position: 'relative', width: '40px', height: '22px', borderRadius: '11px', border: 'none',
        cursor: 'pointer', background: on ? 'var(--gold)' : 'var(--border)', flexShrink: 0, transition: 'background .15s' }}>
      <span style={{ position: 'absolute', top: '3px', left: on ? '21px' : '3px', width: '16px', height: '16px',
        borderRadius: '50%', background: 'var(--dark)', transition: 'left .15s', boxShadow: '0 1px 3px rgba(0,0,0,.2)' }} />
    </button>
  );
}

// ── Product Picker ────────────────────────────────────────────────────────────

function ProductPicker({ selected, onChange, products }) {
  const [search, setSearch] = useState('');

  const visible = useMemo(() => {
    if (!search.trim()) return products;
    const q = search.toLowerCase();
    return products.filter(p => p.name.toLowerCase().includes(q));
  }, [products, search]);

  const toggle = (id) =>
    onChange(selected.includes(id) ? selected.filter(x => x !== id) : [...selected, id]);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
        <span style={{ fontSize: '12px', color: 'var(--gray)', fontWeight: 600 }}>
          {selected.length} product{selected.length !== 1 ? 's' : ''} selected
        </span>
        {selected.length > 0 && (
          <button type="button" onClick={() => onChange([])}
            style={{ fontSize: '11px', color: '#dc2626', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
            Clear all
          </button>
        )}
      </div>
      <input placeholder="Search products..." value={search} onChange={e => setSearch(e.target.value)}
        style={{ ...S.input, marginBottom: '8px' }} />
      <div style={{ maxHeight: '240px', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: '8px' }}>
        {visible.length === 0 && (
          <div style={{ padding: '16px', textAlign: 'center', color: 'var(--gray)', fontSize: '13px' }}>No products found</div>
        )}
        {visible.map(p => {
          const checked = selected.includes(p.id);
          return (
            <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 12px',
              cursor: 'pointer', borderBottom: '1px solid var(--border)',
              background: checked ? 'var(--gold-subtle)' : 'transparent', transition: 'background .1s' }}>
              <input type="checkbox" checked={checked} onChange={() => toggle(p.id)}
                style={{ accentColor: 'var(--gold)', width: '15px', height: '15px', flexShrink: 0, cursor: 'pointer' }} />
              {p.thumbnail && (
                <img src={p.thumbnail} alt="" style={{ width: '32px', height: '32px', objectFit: 'cover', borderRadius: '5px', flexShrink: 0, border: '1px solid var(--border)' }} />
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--white)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {p.name}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--gray)' }}>
                  {p.type === 'multi-variant' ? `${p.variants?.length || 0} variants` : 'Standalone'}
                </div>
              </div>
              {!p.isPublished && (
                <span style={{ fontSize: '10px', color: 'var(--gray)', background: 'var(--dark2)', borderRadius: '4px', padding: '1px 6px', flexShrink: 0 }}>
                  Draft
                </span>
              )}
            </label>
          );
        })}
      </div>
    </div>
  );
}

// ── Collection Add/Edit Modal ─────────────────────────────────────────────────

function CollectionModal({ existing, onClose, onSave, products, token }) {
  const [form, setForm]             = useState(existing ? { ...existing } : { ...EMPTY_FORM });
  const [slugManual, setSlugManual] = useState(!!existing);
  const [tab, setTab]               = useState('basic');
  const [imgUploading, setImgUploading] = useState(false);
  const [imgUrlMode, setImgUrlMode] = useState(false);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleImageFile = async (file) => {
    if (!file) return;
    setImgUploading(true);
    try {
      const result = await uploadImage(file, 'pmp-products', token);
      set('image', result.url ?? result.secure_url ?? result);
    } catch {
      // silent — user can retry
    } finally {
      setImgUploading(false);
    }
  };

  const handleTitle = (v) => {
    set('title', v);
    if (!slugManual) set('slug', toSlug(v));
  };

  const handleSave = () => {
    if (!form.title.trim()) return;
    onSave({ ...form, slug: form.slug || toSlug(form.title) });
  };

  const LabelStyle = { display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--gray-light)', marginBottom: '5px' };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: 'var(--dark)', borderRadius: '12px', width: '100%', maxWidth: '580px',
        maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden',
        boxShadow: '0 20px 60px rgba(0,0,0,0.18)', border: '1px solid var(--border)' }}>

        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <div style={{ fontWeight: 700, fontSize: '15px', color: 'var(--white)' }}>
            {existing ? `Edit "${existing.title}"` : 'New Collection'}
          </div>
          <button onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--gray)', fontSize: '22px', lineHeight: 1, padding: '2px' }}>
            ×
          </button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', padding: '0 20px', flexShrink: 0 }}>
          {[['basic', 'Basic Info'], ['products', `Products (${form.productIds.length})`]].map(([k, label]) => (
            <button key={k} type="button" onClick={() => setTab(k)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '10px 14px', fontSize: '13px', fontWeight: 600,
                color: tab === k ? 'var(--gold)' : 'var(--gray)',
                borderBottom: tab === k ? '2px solid var(--gold)' : '2px solid transparent',
                marginBottom: '-1px' }}>
              {label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
          {tab === 'basic' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>

              <div>
                <label style={LabelStyle}>Title <span style={{ color: '#dc2626' }}>*</span></label>
                <input value={form.title} onChange={e => handleTitle(e.target.value)}
                  placeholder="e.g. Drinkware, Best Sellers, New Arrivals…" maxLength={80}
                  style={S.input} autoFocus />
              </div>

              <div>
                <label style={LabelStyle}>Slug (URL handle)</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input value={form.slug} onChange={e => { setSlugManual(true); set('slug', toSlug(e.target.value)); }}
                    placeholder="auto-generated" style={{ ...S.input, flex: 1 }} />
                  {slugManual && (
                    <button type="button" onClick={() => { setSlugManual(false); set('slug', toSlug(form.title)); }}
                      style={S.btnGhost}>
                      Auto
                    </button>
                  )}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--gray)', marginTop: '4px' }}>
                  /collections/{form.slug}
                </div>
              </div>

              <div>
                <label style={LabelStyle}>Description</label>
                <textarea value={form.description} onChange={e => set('description', e.target.value)}
                  placeholder="Optional, shown on the storefront collection page" maxLength={400}
                  style={S.textarea} />
                <div style={{ fontSize: '11px', color: 'var(--gray)', textAlign: 'right', marginTop: '2px' }}>
                  {form.description.length}/400
                </div>
              </div>

              <div>
                <label style={LabelStyle}>Cover Image</label>
                {form.image ? (
                  <div style={{ position: 'relative', marginTop: '4px' }}>
                    <img src={form.image} alt="cover"
                      style={{ width: '100%', maxHeight: '160px', objectFit: 'cover',
                        borderRadius: '8px', border: '1px solid var(--border)', display: 'block' }} />
                    <button type="button" onClick={() => set('image', '')}
                      style={{ position: 'absolute', top: '6px', right: '6px', width: '24px', height: '24px',
                        borderRadius: '50%', background: 'rgba(0,0,0,0.55)', border: 'none', color: 'var(--dark)',
                        fontSize: '14px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>
                      ×
                    </button>
                  </div>
                ) : (
                  <div
                    onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) handleImageFile(f); }}
                    onDragOver={e => e.preventDefault()}
                    onPaste={e => { const f = Array.from(e.clipboardData?.items || []).find(i => i.type.startsWith('image/'))?.getAsFile(); if (f) handleImageFile(f); }}
                    tabIndex={0}
                    style={{ marginTop: '4px', border: '1.5px dashed var(--border)', borderRadius: '8px',
                      padding: '24px 16px', textAlign: 'center', background: 'var(--dark2)', cursor: 'default', outline: 'none' }}>
                    {imgUploading ? (
                      <span style={{ fontSize: '13px', color: 'var(--gray)' }}>Uploading…</span>
                    ) : (
                      <>
                        <div style={{ fontSize: '22px', marginBottom: '6px', color: 'var(--border)' }}>↑</div>
                        <div style={{ fontSize: '13px', color: 'var(--gray)', marginBottom: '10px' }}>
                          Drag &amp; drop or
                          <label style={{ marginLeft: '6px', color: 'var(--gold)', fontWeight: 600, cursor: 'pointer' }}>
                            Upload image
                            <input type="file" accept="image/*" style={{ display: 'none' }}
                              onChange={e => { if (e.target.files?.[0]) handleImageFile(e.target.files[0]); e.target.value = ''; }} />
                          </label>
                        </div>
                        <button type="button" onClick={() => setImgUrlMode(v => !v)}
                          style={{ fontSize: '11px', color: 'var(--gray)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
                          {imgUrlMode ? 'hide URL input' : 'or enter URL'}
                        </button>
                        {imgUrlMode && (
                          <input value={form.image} onChange={e => set('image', e.target.value)}
                            placeholder="https://…" style={{ ...S.input, marginTop: '8px' }} />
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '12px 14px', background: 'var(--dark2)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--gray-light)' }}>
                    {form.isPublished ? 'Published' : 'Draft'}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--gray)', marginTop: '2px' }}>
                    {form.isPublished ? 'Visible in the storefront' : 'Hidden from customers'}
                  </div>
                </div>
                <Toggle on={form.isPublished} onChange={v => set('isPublished', v)} />
              </div>

              {/* Landing Page Section */}
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: '14px' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--gray)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '10px' }}>Landing Page</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '12px 14px', background: 'var(--dark2)', borderRadius: '8px', border: '1px solid var(--border)', marginBottom: '10px' }}>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--gray-light)' }}>Show on Landing Page</div>
                    <div style={{ fontSize: '11px', color: 'var(--gray)', marginTop: '2px' }}>
                      {form.landing_order ? `Order position: ${form.landing_order}` : 'Not shown on landing page'}
                    </div>
                  </div>
                  <Toggle
                    on={form.landing_order != null}
                    onChange={v => set('landing_order', v ? 99 : null)}
                  />
                </div>
                {form.landing_order != null && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <div>
                      <label style={{ ...LabelStyle, marginBottom: '4px' }}>Order Position</label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <input
                          type="number" min="1" max="100"
                          value={form.landing_order ?? ''}
                          onChange={e => set('landing_order', Math.max(1, parseInt(e.target.value) || 1))}
                          style={{ ...S.input, width: '80px', textAlign: 'center' }}
                        />
                        <span style={{ fontSize: '11px', color: 'var(--gray)' }}>Every 4 = 1 dot page</span>
                      </div>
                    </div>
                    <div>
                      <label style={{ ...LabelStyle, marginBottom: '6px' }}>Image Focus Point</label>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '4px', width: '120px' }}>
                        {[
                          ['top left','top center','top right'],
                          ['center left','center center','center right'],
                          ['bottom left','bottom center','bottom right'],
                        ].flat().map(pos => {
                          const active = (form.landing_image_position || 'center center') === pos;
                          return (
                            <button key={pos} type="button" title={pos}
                              onClick={() => set('landing_image_position', pos)}
                              style={{
                                width: '36px', height: '36px', borderRadius: '5px',
                                border: `2px solid ${active ? 'var(--gold)' : 'var(--border)'}`,
                                background: active ? 'rgba(201,151,63,0.12)' : 'var(--dark2)',
                                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                              }}>
                              <div style={{
                                width: '8px', height: '8px', borderRadius: '50%',
                                background: active ? 'var(--gold)' : 'var(--border)',
                              }} />
                            </button>
                          );
                        })}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--gray)', marginTop: '4px' }}>
                        {form.landing_image_position || 'center center'}
                      </div>
                    </div>
                  </div>
                )}
              </div>

            </div>
          )}

          {tab === 'products' && (
            <ProductPicker selected={form.productIds} onChange={ids => set('productIds', ids)} products={products} />
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border)',
          display: 'flex', gap: '8px', justifyContent: 'flex-end', flexShrink: 0 }}>
          <button type="button" onClick={onClose} style={S.btnGhost}>Cancel</button>
          <button type="button" onClick={handleSave} style={S.btnPrimary} disabled={!form.title.trim()}>
            {ICONS.check} {existing ? 'Save Changes' : 'Create Collection'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function CollectionsPage() {
  const { token } = useAuth();

  const [collections, setCollections] = useState([]);
  const [products,    setProducts]    = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [showModal,   setShowModal]   = useState(false);
  const [editing,     setEditing]     = useState(null);
  const [delTarget,   setDelTarget]   = useState(null);
  const [tab,         setTab]         = useState('all');
  const [search,      setSearch]      = useState('');
  const { toasts, push: toast, dismiss } = useToast();

  const refresh = useCallback(async () => {
    if (!token) return;
    const { prods, cols } = await loadProductsAndCollections(token);
    setProducts(prods);
    setCollections(cols);
  }, [token]);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    refresh().catch(e => toast(e.message || 'Failed to load.', 'error')).finally(() => setLoading(false));
  }, [token]);

  const openAdd  = () => { setEditing(null);  setShowModal(true); };
  const openEdit = (col) => { setEditing(col); setShowModal(true); };

  const handleSave = async (data) => {
    try {
      if (editing) {
        const updated = await updateCollection(token, editing.id, {
          title:       data.title,
          description: data.description,
          image:       data.image || null,
          productIds:  data.productIds,
          isPublished: data.isPublished,
        });
        toast(`"${data.title}" updated.`, 'success');
      } else {
        await createCollection(token, {
          title:       data.title,
          description: data.description,
          image:       data.image || null,
          productIds:  data.productIds,
          isPublished: data.isPublished,
        });
        toast(`"${data.title}" created.`, 'success');
      }
      await refresh();
      setShowModal(false);
      setEditing(null);
    } catch (e) {
      toast(e.message || 'Failed to save.', 'error');
    }
  };

  const doDelete = async () => {
    try {
      await deleteCollection(token, delTarget.id);
      setCollections(prev => prev.filter(c => c.id !== delTarget.id));
      toast(`"${delTarget.title}" deleted.`, 'warn');
    } catch (e) {
      toast(e.message || 'Failed to delete.', 'error');
    } finally {
      setDelTarget(null);
    }
  };

  const togglePublish = async (id) => {
    const col = collections.find(c => c.id === id);
    try {
      await toggleCollectionPublish(token, id);
      setCollections(prev => prev.map(c => c.id === id ? { ...c, isPublished: !c.isPublished } : c));
      toast(`"${col?.title}" ${col?.isPublished ? 'unpublished' : 'published'}.`, 'info');
    } catch (e) {
      toast(e.message || 'Failed to toggle.', 'error');
    }
  };

  // ── All hooks before early return ──────────────────────────────────────────

  const counts = {
    all:       collections.length,
    published: collections.filter(c =>  c.isPublished).length,
    draft:     collections.filter(c => !c.isPublished).length,
  };

  const filtered = useMemo(() => {
    let list = collections;
    if (tab === 'published') list = list.filter(c =>  c.isPublished);
    if (tab === 'draft')     list = list.filter(c => !c.isPublished);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(c =>
        c.title.toLowerCase().includes(q) || c.slug.toLowerCase().includes(q)
      );
    }
    return list;
  }, [collections, tab, search]);

  const { slice, page, perPage, total, setPage, setPerPage } = usePagination(filtered);

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={{ ...S.page, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '300px' }}>
        <span style={{ color: 'var(--gray)', fontSize: '14px' }}>Loading collections...</span>
      </div>
    );
  }

  return (
    <div style={S.page}>

      <div style={{ ...S.rowBetween, marginBottom: '20px' }}>
        <button onClick={openAdd} style={S.btnPrimary}>{ICONS.plus} New Collection</button>
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
                color: tab === k ? 'var(--gold)' : 'var(--gray)',
                borderBottom: tab === k ? '2px solid var(--gold)' : '2px solid transparent',
                marginBottom: '-1px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              {label}
              <span style={{ background: tab === k ? '#f5ede0' : '#f0f0f0', color: tab === k ? 'var(--gold)' : 'var(--gray)',
                borderRadius: '20px', padding: '1px 8px', fontSize: '11px', fontWeight: 700 }}>
                {counts[k]}
              </span>
            </button>
          ))}
        </div>

        {/* Toolbar */}
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
          <SearchBar value={search} onChange={setSearch} placeholder="Search collections..." style={{ width: '240px' }} />
        </div>

        {/* Table */}
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Collection', 'Slug', 'Products', 'Status', ''].map(h => (
                  <th key={h} style={S.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {slice.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: '48px', color: 'var(--gray)', fontSize: '14px' }}>
                    No collections found
                  </td>
                </tr>
              ) : slice.map(col => (
                <tr key={col.id} style={S.tr}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--dark2)'}
                  onMouseLeave={e => e.currentTarget.style.background = ''}>

                  <td style={S.td}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      {col.image
                        ? <img src={col.image} alt={col.title}
                            style={{ width: '40px', height: '40px', borderRadius: '7px', objectFit: 'cover',
                              border: '1px solid var(--border)', flexShrink: 0 }} />
                        : <div style={{ width: '40px', height: '40px', borderRadius: '7px', background: 'var(--dark2)',
                            border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: 'var(--border)', flexShrink: 0 }}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                              <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"/>
                            </svg>
                          </div>
                      }
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '14px', color: 'var(--white)' }}>{col.title}</div>
                        {col.description
                          ? <div style={{ fontSize: '11px', color: 'var(--gray)', maxWidth: '280px',
                              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {col.description}
                            </div>
                          : <div style={{ fontSize: '11px', color: 'var(--border)', fontStyle: 'italic' }}>No description</div>
                        }
                      </div>
                    </div>
                  </td>

                  <td style={S.td}>
                    <span style={{ fontSize: '12px', color: 'var(--gray)', fontFamily: 'monospace',
                      background: 'var(--dark2)', padding: '2px 7px', borderRadius: '4px' }}>
                      /{col.slug}
                    </span>
                  </td>

                  <td style={S.td}>
                    <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--gray-light)' }}>
                      {col.productIds?.length ?? 0}
                    </span>
                    <span style={{ fontSize: '11px', color: 'var(--gray)', marginLeft: '3px' }}>
                      product{(col.productIds?.length ?? 0) !== 1 ? 's' : ''}
                    </span>
                  </td>

                  <td style={S.td}>
                    <button onClick={() => togglePublish(col.id)}
                      title={col.isPublished ? 'Click to unpublish' : 'Click to publish'}
                      style={{ background: col.isPublished ? '#e9f5ea' : 'var(--dark2)',
                        color: col.isPublished ? '#2e7d32' : 'var(--gray)',
                        border: 'none', borderRadius: '20px', padding: '3px 12px', fontSize: '12px', fontWeight: 600,
                        cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                      <span style={{ width: '6px', height: '6px', borderRadius: '50%',
                        background: col.isPublished ? '#2e7d32' : 'var(--gray)', flexShrink: 0 }} />
                      {col.isPublished ? 'Published' : 'Draft'}
                    </button>
                  </td>

                  <td style={{ ...S.td, textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                      <button onClick={() => openEdit(col)} style={S.btnSmGhost}>{ICONS.edit}</button>
                      <button onClick={() => setDelTarget(col)} style={S.btnSmDanger}>{ICONS.trash}</button>
                    </div>
                  </td>

                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)' }}>
          <PaginationBar total={total} page={page} perPage={perPage} onPage={setPage} onPerPage={setPerPage} />
        </div>
      </div>

      {showModal && (
        <CollectionModal
          key={editing?.id || 'new'}
          existing={editing}
          onClose={() => { setShowModal(false); setEditing(null); }}
          onSave={handleSave}
          products={products}
          token={token}
        />
      )}

      <ConfirmModal
        open={!!delTarget}
        onClose={() => setDelTarget(null)}
        onConfirm={doDelete}
        title="Delete Collection"
        confirmLabel="Delete"
        confirmStyle="danger"
        message={`Delete "${delTarget?.title}"? Products are not affected.`}
      />

      <ToastContainer toasts={toasts} dismiss={dismiss} />
    </div>
  );
}
