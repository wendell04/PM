'use client';
import { useState, useMemo, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { S, ICONS, ConfirmModal, PaginationBar, SearchBar, SummaryCard, ToastContainer, useToast, usePagination } from '../inventory-v2/shared';
import { loadProductsAndCollections, createCollection, updateCollection, deleteCollection, toggleCollectionPublish, normCollection } from '../products-v2/api';

function toSlug(str) {
  return str.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

const EMPTY_FORM = { title: '', slug: '', description: '', image: '', isPublished: false, productIds: [] };

// ── Toggle ────────────────────────────────────────────────────────────────────

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
        <span style={{ fontSize: '12px', color: '#6b7280', fontWeight: 600 }}>
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
      <div style={{ maxHeight: '240px', overflowY: 'auto', border: '1px solid #e1e3e5', borderRadius: '8px' }}>
        {visible.length === 0 && (
          <div style={{ padding: '16px', textAlign: 'center', color: '#9ca3af', fontSize: '13px' }}>No products found</div>
        )}
        {visible.map(p => {
          const checked = selected.includes(p.id);
          return (
            <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 12px',
              cursor: 'pointer', borderBottom: '1px solid #f0f1f2',
              background: checked ? '#fffbe8' : 'transparent', transition: 'background .1s' }}>
              <input type="checkbox" checked={checked} onChange={() => toggle(p.id)}
                style={{ accentColor: '#c9973f', width: '15px', height: '15px', flexShrink: 0, cursor: 'pointer' }} />
              {p.thumbnail && (
                <img src={p.thumbnail} alt="" style={{ width: '32px', height: '32px', objectFit: 'cover', borderRadius: '5px', flexShrink: 0, border: '1px solid #e1e3e5' }} />
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '13px', fontWeight: 600, color: '#1a1a2e', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {p.name}
                </div>
                <div style={{ fontSize: '11px', color: '#9ca3af' }}>
                  {p.type === 'multi-variant' ? `${p.variants?.length || 0} variants` : 'Standalone'}
                </div>
              </div>
              {!p.isPublished && (
                <span style={{ fontSize: '10px', color: '#9ca3af', background: '#f3f4f6', borderRadius: '4px', padding: '1px 6px', flexShrink: 0 }}>
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

function CollectionModal({ existing, onClose, onSave, products }) {
  const [form, setForm]             = useState(existing ? { ...existing } : { ...EMPTY_FORM });
  const [slugManual, setSlugManual] = useState(!!existing);
  const [tab, setTab]               = useState('basic');
  const [imgErr, setImgErr]         = useState(false);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleTitle = (v) => {
    set('title', v);
    if (!slugManual) set('slug', toSlug(v));
  };

  const handleSave = () => {
    if (!form.title.trim()) return;
    onSave({ ...form, slug: form.slug || toSlug(form.title) });
  };

  const LabelStyle = { display: 'block', fontSize: '12px', fontWeight: 700, color: '#374151', marginBottom: '5px' };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: '#fff', borderRadius: '12px', width: '100%', maxWidth: '580px',
        maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden',
        boxShadow: '0 20px 60px rgba(0,0,0,0.18)', border: '1px solid #e1e3e5' }}>

        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #e1e3e5',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <div style={{ fontWeight: 700, fontSize: '15px', color: '#1a1a2e' }}>
            {existing ? `Edit "${existing.title}"` : 'New Collection'}
          </div>
          <button onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', fontSize: '22px', lineHeight: 1, padding: '2px' }}>
            ×
          </button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid #e1e3e5', padding: '0 20px', flexShrink: 0 }}>
          {[['basic', 'Basic Info'], ['products', `Products (${form.productIds.length})`]].map(([k, label]) => (
            <button key={k} type="button" onClick={() => setTab(k)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '10px 14px', fontSize: '13px', fontWeight: 600,
                color: tab === k ? '#c9973f' : '#6b7280',
                borderBottom: tab === k ? '2px solid #c9973f' : '2px solid transparent',
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
                <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '4px' }}>
                  /collections/{form.slug}
                </div>
              </div>

              <div>
                <label style={LabelStyle}>Description</label>
                <textarea value={form.description} onChange={e => set('description', e.target.value)}
                  placeholder="Optional, shown on the storefront collection page" maxLength={400}
                  style={S.textarea} />
                <div style={{ fontSize: '11px', color: '#9ca3af', textAlign: 'right', marginTop: '2px' }}>
                  {form.description.length}/400
                </div>
              </div>

              <div>
                <label style={LabelStyle}>Cover Image URL</label>
                <input value={form.image} onChange={e => { set('image', e.target.value); setImgErr(false); }}
                  placeholder="https://…" style={S.input} />
                {form.image && !imgErr && (
                  <img src={form.image} alt="preview" onError={() => setImgErr(true)}
                    style={{ marginTop: '8px', width: '100%', maxHeight: '140px', objectFit: 'cover',
                      borderRadius: '8px', border: '1px solid #e1e3e5' }} />
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '12px 14px', background: '#f9fafb', borderRadius: '8px', border: '1px solid #f0f1f2' }}>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#374151' }}>
                    {form.isPublished ? 'Published' : 'Draft'}
                  </div>
                  <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '2px' }}>
                    {form.isPublished ? 'Visible in the storefront' : 'Hidden from customers'}
                  </div>
                </div>
                <Toggle on={form.isPublished} onChange={v => set('isPublished', v)} />
              </div>

            </div>
          )}

          {tab === 'products' && (
            <ProductPicker selected={form.productIds} onChange={ids => set('productIds', ids)} products={products} />
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '14px 20px', borderTop: '1px solid #e1e3e5',
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
        <span style={{ color: '#9ca3af', fontSize: '14px' }}>Loading collections...</span>
      </div>
    );
  }

  return (
    <div style={S.page}>

      <div style={{ ...S.rowBetween, marginBottom: '20px' }}>
        <h1 style={{ margin: 0, fontSize: '22px', fontWeight: 800, color: '#1a1a2e' }}>Collections</h1>
        <button onClick={openAdd} style={S.btnPrimary}>{ICONS.plus} New Collection</button>
      </div>

      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '20px' }}>
        <SummaryCard label="Total"     value={counts.all}       accent />
        <SummaryCard label="Published" value={counts.published} color="#2e7d32" />
        <SummaryCard label="Draft"     value={counts.draft}     color="#6b7280" />
      </div>

      <div style={{ ...S.card, marginBottom: '16px' }}>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid #e1e3e5', padding: '0 16px' }}>
          {[['all', 'All'], ['published', 'Published'], ['draft', 'Draft']].map(([k, label]) => (
            <button key={k} onClick={() => setTab(k)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '12px 16px', fontSize: '13px', fontWeight: 600,
                color: tab === k ? '#c9973f' : '#6b7280',
                borderBottom: tab === k ? '2px solid #c9973f' : '2px solid transparent',
                marginBottom: '-1px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              {label}
              <span style={{ background: tab === k ? '#f5ede0' : '#f0f0f0', color: tab === k ? '#c9973f' : '#6b7280',
                borderRadius: '20px', padding: '1px 8px', fontSize: '11px', fontWeight: 700 }}>
                {counts[k]}
              </span>
            </button>
          ))}
        </div>

        {/* Toolbar */}
        <div style={{ padding: '12px 16px', borderBottom: '1px solid #f0f1f2' }}>
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
                  <td colSpan={5} style={{ textAlign: 'center', padding: '48px', color: '#9ca3af', fontSize: '14px' }}>
                    No collections found
                  </td>
                </tr>
              ) : slice.map(col => (
                <tr key={col.id} style={S.tr}
                  onMouseEnter={e => e.currentTarget.style.background = '#fafbfc'}
                  onMouseLeave={e => e.currentTarget.style.background = ''}>

                  <td style={S.td}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      {col.image
                        ? <img src={col.image} alt={col.title}
                            style={{ width: '40px', height: '40px', borderRadius: '7px', objectFit: 'cover',
                              border: '1px solid #e1e3e5', flexShrink: 0 }} />
                        : <div style={{ width: '40px', height: '40px', borderRadius: '7px', background: '#f4f6f8',
                            border: '1px solid #e1e3e5', display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: '#d1d5db', flexShrink: 0 }}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                              <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"/>
                            </svg>
                          </div>
                      }
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '14px', color: '#1a1a2e' }}>{col.title}</div>
                        {col.description
                          ? <div style={{ fontSize: '11px', color: '#9ca3af', maxWidth: '280px',
                              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {col.description}
                            </div>
                          : <div style={{ fontSize: '11px', color: '#d1d5db', fontStyle: 'italic' }}>No description</div>
                        }
                      </div>
                    </div>
                  </td>

                  <td style={S.td}>
                    <span style={{ fontSize: '12px', color: '#9ca3af', fontFamily: 'monospace',
                      background: '#f4f6f8', padding: '2px 7px', borderRadius: '4px' }}>
                      /{col.slug}
                    </span>
                  </td>

                  <td style={S.td}>
                    <span style={{ fontSize: '13px', fontWeight: 700, color: '#374151' }}>
                      {col.productIds?.length ?? 0}
                    </span>
                    <span style={{ fontSize: '11px', color: '#9ca3af', marginLeft: '3px' }}>
                      product{(col.productIds?.length ?? 0) !== 1 ? 's' : ''}
                    </span>
                  </td>

                  <td style={S.td}>
                    <button onClick={() => togglePublish(col.id)}
                      title={col.isPublished ? 'Click to unpublish' : 'Click to publish'}
                      style={{ background: col.isPublished ? '#e9f5ea' : '#f3f4f6',
                        color: col.isPublished ? '#2e7d32' : '#6b7280',
                        border: 'none', borderRadius: '20px', padding: '3px 12px', fontSize: '12px', fontWeight: 600,
                        cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                      <span style={{ width: '6px', height: '6px', borderRadius: '50%',
                        background: col.isPublished ? '#2e7d32' : '#9ca3af', flexShrink: 0 }} />
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

        <div style={{ padding: '12px 16px', borderTop: '1px solid #f0f1f2' }}>
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
