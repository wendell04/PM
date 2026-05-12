'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { fetchWithTimeout } from '@/lib/fetchWithTimeout';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';

function apiHeaders(token) {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
    'ngrok-skip-browser-warning': 'true',
  };
}

function toSlug(str) {
  return str.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

const EMPTY_FORM = {
  title: '', slug: '', description: '', image: '',
  type: 'manual', productIds: [],
  isPublished: false, sortOrder: 0,
};

// ── ProductPicker ─────────────────────────────────────────────────────────────
function ProductPicker({ token, selected, onChange }) {
  const [products, setProducts]     = useState([]);
  const [search, setSearch]         = useState('');
  const [loading, setLoading]       = useState(false);
  const debounceRef = useRef(null);

  const fetchProds = useCallback(async (q) => {
    setLoading(true);
    try {
      const params = q ? `?search=${encodeURIComponent(q)}&per_page=40` : '?per_page=40';
      const res = await fetchWithTimeout(
        `${API_URL}/api/admin/products${params}`,
        { headers: apiHeaders(token) },
        15000
      );
      const data = await res.json();
      const raw  = data.data ?? data;
      setProducts(Array.isArray(raw) ? raw : (raw.products ?? raw.data ?? []));
    } catch {}
    finally { setLoading(false); }
  }, [token]);

  useEffect(() => { fetchProds(''); }, [fetchProds]);

  const handleSearch = (v) => {
    setSearch(v);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchProds(v), 400);
  };

  const toggle = (id) => {
    onChange(selected.includes(id) ? selected.filter(x => x !== id) : [...selected, id]);
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
        <span style={{ fontSize: '0.8rem', color: 'var(--gray)', fontWeight: 600 }}>
          {selected.length} product{selected.length !== 1 ? 's' : ''} selected
        </span>
        {selected.length > 0 && (
          <button type="button" onClick={() => onChange([])}
            style={{ fontSize: '0.72rem', color: 'var(--red)', background: 'none', border: 'none', cursor: 'pointer' }}>
            Clear all
          </button>
        )}
      </div>
      <input
        placeholder="Search products..."
        value={search}
        onChange={e => handleSearch(e.target.value)}
        style={{
          width: '100%', padding: '8px 12px', marginBottom: '8px',
          background: 'var(--dark3)', border: '1px solid var(--border)',
          borderRadius: '7px', color: 'var(--white)', fontSize: '0.83rem',
        }}
      />
      <div style={{
        maxHeight: '220px', overflowY: 'auto', border: '1px solid var(--border)',
        borderRadius: '8px', background: 'var(--dark2)',
      }}>
        {loading && (
          <div style={{ padding: '16px', textAlign: 'center', color: 'var(--gray)', fontSize: '0.8rem' }}>
            Loading…
          </div>
        )}
        {!loading && products.length === 0 && (
          <div style={{ padding: '16px', textAlign: 'center', color: 'var(--gray)', fontSize: '0.8rem' }}>
            No products found
          </div>
        )}
        {!loading && products.map(p => {
          const id = p._id ?? p.id;
          const checked = selected.includes(id);
          return (
            <label key={id} style={{
              display: 'flex', alignItems: 'center', gap: '10px',
              padding: '8px 12px', cursor: 'pointer',
              borderBottom: '1px solid var(--border)',
              background: checked ? 'rgba(212,168,67,0.06)' : 'transparent',
              transition: 'background 0.15s',
            }}>
              <input
                type="checkbox" checked={checked} onChange={() => toggle(id)}
                style={{ accentColor: 'var(--gold)', width: '15px', height: '15px', flexShrink: 0 }}
              />
              {p.thumbnail && (
                <img src={p.thumbnail} alt="" style={{
                  width: '32px', height: '32px', objectFit: 'cover',
                  borderRadius: '5px', flexShrink: 0,
                }} />
              )}
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--white)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {p.name}
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--gray)' }}>{p.category}</div>
              </div>
              {!p.isPublished && (
                <span style={{ marginLeft: 'auto', fontSize: '0.65rem', color: 'var(--gray)', flexShrink: 0 }}>Draft</span>
              )}
            </label>
          );
        })}
      </div>
    </div>
  );
}

// ── CollectionModal ───────────────────────────────────────────────────────────
function CollectionModal({ token, existing, onClose, onSave }) {
  const [form, setForm]       = useState(existing ? { ...existing } : { ...EMPTY_FORM });
  const [slugManual, setSlugManual] = useState(!!existing);
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState(null);
  const [tab, setTab]         = useState('basic');

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }));

  const handleTitle = (v) => {
    set('title', v);
    if (!slugManual) set('slug', toSlug(v));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) { setError('Title is required.'); return; }
    setSaving(true);
    setError(null);
    try {
      const url    = existing
        ? `${API_URL}/api/admin/collections/${existing._id ?? existing.id}`
        : `${API_URL}/api/admin/collections`;
      const method = existing ? 'PUT' : 'POST';
      const body   = { ...form };
      if (body.sortOrder !== undefined) body.sortOrder = Number(body.sortOrder) || 0;
      const res  = await fetchWithTimeout(url, {
        method,
        headers: apiHeaders(token),
        body: JSON.stringify(body),
      }, 20000);
      const data = await res.json();
      if (!res.ok) { setError(data.message || 'Failed to save.'); return; }
      onSave(data.data);
    } catch (err) {
      setError(err.message || 'Failed to save.');
    } finally {
      setSaving(false);
    }
  };

  const inputStyle = {
    width: '100%', padding: '9px 12px',
    background: 'var(--dark3)', border: '1px solid var(--border)',
    borderRadius: '8px', color: 'var(--white)', fontSize: '0.85rem',
  };
  const labelStyle = {
    display: 'block', fontSize: '0.75rem', fontWeight: 700,
    color: 'var(--gray)', textTransform: 'uppercase', letterSpacing: '0.5px',
    marginBottom: '6px',
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000, padding: '16px',
    }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{
        background: 'var(--dark)', borderRadius: '14px',
        border: '1px solid var(--border)', width: '100%', maxWidth: '640px',
        maxHeight: '90vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
      }}>
        {/* Header */}
        <div style={{
          padding: '18px 24px', borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
        }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--white)', margin: 0 }}>
            {existing ? 'Edit Collection' : 'New Collection'}
          </h3>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', color: 'var(--gray)',
            cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '2px',
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div style={{
          display: 'flex', gap: '4px', padding: '12px 24px 0',
          borderBottom: '1px solid var(--border)', flexShrink: 0,
        }}>
          {[
            { key: 'basic',    label: 'Basic Info' },
            { key: 'products', label: 'Products' },
          ].map(t => (
            <button key={t.key} type="button" onClick={() => setTab(t.key)}
              style={{
                padding: '7px 16px', background: 'none',
                border: 'none', borderBottom: tab === t.key ? '2px solid var(--gold)' : '2px solid transparent',
                color: tab === t.key ? 'var(--gold)' : 'var(--gray)',
                cursor: 'pointer', fontSize: '0.83rem', fontWeight: 600,
                marginBottom: '-1px',
              }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} style={{ overflowY: 'auto', flex: 1 }}>
          <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {tab === 'basic' && (
              <>
                {/* Title */}
                <div>
                  <label style={labelStyle}>Title *</label>
                  <input
                    style={inputStyle} value={form.title} required
                    onChange={e => handleTitle(e.target.value)}
                    placeholder="e.g. Summer Sale, Best Sellers, Custom Tees…"
                  />
                </div>

                {/* Slug */}
                <div>
                  <label style={labelStyle}>Slug (URL handle)</label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input
                      style={{ ...inputStyle, flex: 1 }}
                      value={form.slug}
                      onChange={e => { setSlugManual(true); set('slug', toSlug(e.target.value)); }}
                      placeholder="auto-generated"
                    />
                    {slugManual && (
                      <button type="button"
                        onClick={() => { setSlugManual(false); set('slug', toSlug(form.title)); }}
                        style={{
                          padding: '7px 12px', background: 'var(--dark3)', border: '1px solid var(--border)',
                          borderRadius: '8px', color: 'var(--gray)', cursor: 'pointer', fontSize: '0.75rem',
                        }}>
                        Auto
                      </button>
                    )}
                  </div>
                  <p style={{ fontSize: '0.72rem', color: 'var(--gray)', marginTop: '4px' }}>
                    /collections/{form.slug || '—'}
                  </p>
                </div>

                {/* Description */}
                <div>
                  <label style={labelStyle}>Description</label>
                  <textarea
                    style={{ ...inputStyle, resize: 'vertical', minHeight: '72px' }}
                    value={form.description}
                    onChange={e => set('description', e.target.value)}
                    placeholder="Optional description shown on the storefront"
                  />
                </div>

                {/* Image */}
                <div>
                  <label style={labelStyle}>Cover Image URL</label>
                  <input
                    style={inputStyle} value={form.image}
                    onChange={e => set('image', e.target.value)}
                    placeholder="https://…"
                  />
                  {form.image && (
                    <img src={form.image} alt="preview" style={{
                      marginTop: '8px', width: '100%', maxHeight: '140px',
                      objectFit: 'cover', borderRadius: '8px',
                    }} />
                  )}
                </div>

                {/* Sort order + publish */}
                <div style={{ display: 'flex', gap: '12px' }}>
                  <div style={{ flex: 1 }}>
                    <label style={labelStyle}>Sort order</label>
                    <input
                      type="number" min="0" style={inputStyle}
                      value={form.sortOrder}
                      onChange={e => set('sortOrder', e.target.value)}
                    />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: '2px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                      <div
                        onClick={() => set('isPublished', !form.isPublished)}
                        style={{
                          width: '40px', height: '22px', borderRadius: '11px', position: 'relative', cursor: 'pointer',
                          background: form.isPublished ? 'var(--gold)' : 'var(--dark3)',
                          border: '1px solid var(--border)', transition: 'background 0.2s',
                        }}>
                        <div style={{
                          position: 'absolute', top: '2px', left: form.isPublished ? '19px' : '2px',
                          width: '16px', height: '16px', borderRadius: '50%',
                          background: form.isPublished ? 'var(--black)' : 'var(--gray)',
                          transition: 'left 0.2s',
                        }} />
                      </div>
                      <span style={{ fontSize: '0.82rem', color: 'var(--gray-light)', fontWeight: 600 }}>
                        {form.isPublished ? 'Published' : 'Draft'}
                      </span>
                    </label>
                  </div>
                </div>
              </>
            )}

            {tab === 'products' && (
              <ProductPicker
                token={token}
                selected={form.productIds}
                onChange={ids => set('productIds', ids)}
              />
            )}
          </div>

          {/* Footer */}
          <div style={{
            padding: '14px 24px', borderTop: '1px solid var(--border)',
            display: 'flex', gap: '10px', justifyContent: 'flex-end', flexShrink: 0,
          }}>
            {error && (
              <span style={{ flex: 1, fontSize: '0.8rem', color: 'var(--red)', alignSelf: 'center' }}>{error}</span>
            )}
            <button type="button" onClick={onClose}
              style={{
                padding: '8px 18px', background: 'var(--dark3)',
                border: '1px solid var(--border)', borderRadius: '8px',
                color: 'var(--gray-light)', cursor: 'pointer', fontSize: '0.85rem',
              }}>
              Cancel
            </button>
            <button type="submit" disabled={saving}
              style={{
                padding: '8px 20px', background: 'var(--gold)',
                border: 'none', borderRadius: '8px', color: 'var(--black)',
                fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer',
                fontSize: '0.85rem', opacity: saving ? 0.7 : 1,
              }}>
              {saving ? 'Saving…' : (existing ? 'Save Changes' : 'Create Collection')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── CollectionCard ────────────────────────────────────────────────────────────
function CollectionCard({ col, onEdit, onDelete, onTogglePublish, toggling }) {
  return (
    <div style={{
      background: 'var(--dark)', border: '1px solid var(--border)',
      borderRadius: '12px', overflow: 'hidden',
      display: 'flex', flexDirection: 'column',
      transition: 'border-color 0.2s, box-shadow 0.2s',
    }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(212,168,67,0.4)'; e.currentTarget.style.boxShadow = '0 4px 20px rgba(0,0,0,0.15)'; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = 'none'; }}
    >
      {/* Cover image */}
      <div style={{
        height: '140px', background: col.image ? 'transparent' : 'var(--dark2)',
        overflow: 'hidden', position: 'relative', flexShrink: 0,
      }}>
        {col.image ? (
          <img src={col.image} alt={col.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <div style={{
            width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'linear-gradient(135deg, var(--dark2), var(--dark3))',
          }}>
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="var(--border)" strokeWidth="1.5">
              <path d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
        )}
        {/* Publish badge */}
        <div style={{
          position: 'absolute', top: '8px', right: '8px',
          padding: '3px 8px', borderRadius: '5px', fontSize: '0.65rem', fontWeight: 700,
          display: 'flex', alignItems: 'center', gap: '4px',
          background: col.isPublished ? 'rgba(74,222,128,0.15)' : 'rgba(136,136,136,0.2)',
          color: col.isPublished ? 'var(--green)' : 'var(--gray)',
          border: `1px solid ${col.isPublished ? 'rgba(74,222,128,0.3)' : 'rgba(136,136,136,0.25)'}`,
          backdropFilter: 'blur(4px)',
        }}>
          <svg width="6" height="6" viewBox="0 0 6 6" fill="currentColor">
            <circle cx="3" cy="3" r="3"/>
          </svg>
          {col.isPublished ? 'Live' : 'Draft'}
        </div>
      </div>

      {/* Body */}
      <div style={{ padding: '14px 16px', flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <h3 style={{ fontSize: '0.92rem', fontWeight: 700, color: 'var(--white)', margin: 0, lineHeight: 1.3 }}>
          {col.title}
        </h3>

        {col.description && (
          <p style={{
            fontSize: '0.78rem', color: 'var(--gray)', margin: 0,
            overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
          }}>
            {col.description}
          </p>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: 'auto', paddingTop: '4px' }}>
          <span style={{ fontSize: '0.78rem', color: 'var(--gray)' }}>
            <span style={{ fontWeight: 700, color: 'var(--white)' }}>{col.productCount ?? 0}</span> products
          </span>
          <span style={{ fontSize: '0.72rem', color: 'var(--border)', userSelect: 'none' }}>·</span>
          <span style={{ fontSize: '0.72rem', color: 'var(--gray)', fontFamily: 'monospace' }}>/{col.slug}</span>
        </div>
      </div>

      {/* Actions */}
      <div style={{
        padding: '10px 16px', borderTop: '1px solid var(--border)',
        display: 'flex', gap: '8px', alignItems: 'center',
      }}>
        <button type="button" onClick={() => onEdit(col)}
          style={{
            padding: '6px 14px', background: 'var(--dark2)',
            border: '1px solid var(--border)', borderRadius: '7px',
            color: 'var(--white)', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600,
          }}>
          Edit
        </button>
        <button type="button" onClick={() => onTogglePublish(col)} disabled={toggling === (col._id ?? col.id)}
          style={{
            padding: '6px 14px',
            background: col.isPublished ? 'rgba(136,136,136,0.1)' : 'rgba(74,222,128,0.1)',
            border: `1px solid ${col.isPublished ? 'var(--border)' : 'rgba(74,222,128,0.3)'}`,
            borderRadius: '7px',
            color: col.isPublished ? 'var(--gray)' : 'var(--green)',
            cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600,
            opacity: toggling === (col._id ?? col.id) ? 0.6 : 1,
          }}>
          {col.isPublished ? 'Unpublish' : 'Publish'}
        </button>
        <button type="button" onClick={() => onDelete(col)}
          style={{
            marginLeft: 'auto', padding: '6px 10px',
            background: 'rgba(196,30,58,0.08)', border: '1px solid rgba(196,30,58,0.25)',
            borderRadius: '7px', color: 'var(--red)', cursor: 'pointer', fontSize: '0.78rem',
          }}>
          Delete
        </button>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function CollectionsPage() {
  const { token } = useAuth();
  const [collections, setCollections] = useState([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState(null);
  const [showModal, setShowModal]     = useState(false);
  const [editing, setEditing]         = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting]       = useState(false);
  const [toggling, setToggling]       = useState(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res  = await fetchWithTimeout(`${API_URL}/api/admin/collections`, { headers: apiHeaders(token) }, 20000);
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to load collections.');
      const raw = data.data ?? data;
      setCollections(Array.isArray(raw) ? raw : []);
    } catch (err) {
      setError(err.message || 'Failed to load collections.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const handleSave = (saved) => {
    setCollections(prev => {
      const idx = prev.findIndex(c => (c._id ?? c.id) === (saved._id ?? saved.id));
      return idx >= 0 ? prev.map((c, i) => i === idx ? saved : c) : [saved, ...prev];
    });
    setShowModal(false);
    setEditing(null);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const id  = deleteTarget._id ?? deleteTarget.id;
      const res = await fetchWithTimeout(
        `${API_URL}/api/admin/collections/${id}`,
        { method: 'DELETE', headers: apiHeaders(token) },
        15000
      );
      if (!res.ok) return;
      setCollections(prev => prev.filter(c => (c._id ?? c.id) !== id));
      setDeleteTarget(null);
    } catch {}
    finally { setDeleting(false); }
  };

  const handleTogglePublish = async (col) => {
    const id = col._id ?? col.id;
    setToggling(id);
    try {
      const res  = await fetchWithTimeout(
        `${API_URL}/api/admin/collections/${id}/toggle-publish`,
        { method: 'PATCH', headers: apiHeaders(token) },
        15000
      );
      const data = await res.json();
      if (!res.ok) return;
      setCollections(prev => prev.map(c =>
        (c._id ?? c.id) === id ? { ...c, isPublished: data.data?.isPublished ?? !col.isPublished } : c
      ));
    } catch {}
    finally { setToggling(null); }
  };

  const published = collections.filter(c => c.isPublished).length;

  return (
    <div style={{ padding: '24px', maxWidth: '1100px' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '24px', gap: '16px', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--white)', margin: 0, marginBottom: '4px' }}>
            Collections
          </h1>
          <p style={{ fontSize: '0.82rem', color: 'var(--gray)', margin: 0 }}>
            Group products into curated collections — like Shopify's Collections. No category dependency.
          </p>
        </div>
        <button
          onClick={() => { setEditing(null); setShowModal(true); }}
          style={{
            padding: '9px 18px', background: 'var(--gold)', border: 'none',
            borderRadius: '9px', color: 'var(--black)', fontWeight: 700,
            cursor: 'pointer', fontSize: '0.85rem', whiteSpace: 'nowrap',
          }}>
          + New Collection
        </button>
      </div>

      {/* Stats */}
      {!loading && collections.length > 0 && (
        <div style={{ display: 'flex', gap: '12px', marginBottom: '24px', flexWrap: 'wrap' }}>
          {[
            { label: 'Total',     value: collections.length },
            { label: 'Published', value: published, color: 'var(--green)' },
            { label: 'Draft',     value: collections.length - published, color: 'var(--gray)' },
          ].map(({ label, value, color }) => (
            <div key={label} style={{
              flex: '1 1 120px', padding: '14px 18px',
              background: 'var(--dark2)', border: '1px solid var(--border)', borderRadius: '10px',
            }}>
              <div style={{ fontSize: '0.7rem', color: 'var(--gray)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>
                {label}
              </div>
              <div style={{ fontSize: '1.4rem', fontWeight: 800, color: color || 'var(--white)' }}>
                {value}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* States */}
      {loading && (
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px',
        }}>
          {[...Array(4)].map((_, i) => (
            <div key={i} style={{
              height: '280px', background: 'var(--dark)', border: '1px solid var(--border)',
              borderRadius: '12px', opacity: 0.5,
            }} />
          ))}
        </div>
      )}

      {!loading && error && (
        <div style={{
          padding: '20px', background: 'rgba(196,30,58,0.08)',
          border: '1px solid rgba(196,30,58,0.25)', borderRadius: '10px',
          color: 'var(--red)', fontSize: '0.85rem',
        }}>
          {error}
          <button onClick={load} style={{ marginLeft: '12px', color: 'var(--white)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', fontSize: '0.85rem' }}>
            Retry
          </button>
        </div>
      )}

      {!loading && !error && collections.length === 0 && (
        <div style={{
          padding: '60px 24px', textAlign: 'center',
          border: '2px dashed var(--border)', borderRadius: '14px',
        }}>
          <div style={{ marginBottom: '12px', color: 'var(--border)' }}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"/>
            </svg>
          </div>
          <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--white)', marginBottom: '8px' }}>
            No collections yet
          </div>
          <div style={{ fontSize: '0.83rem', color: 'var(--gray)', marginBottom: '20px' }}>
            Create your first collection to group products independently from categories.
          </div>
          <button onClick={() => setShowModal(true)}
            style={{
              padding: '9px 20px', background: 'var(--gold)',
              border: 'none', borderRadius: '9px',
              color: 'var(--black)', fontWeight: 700, cursor: 'pointer', fontSize: '0.85rem',
            }}>
            + New Collection
          </button>
        </div>
      )}

      {!loading && !error && collections.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
          {collections.map(col => (
            <CollectionCard
              key={col._id ?? col.id}
              col={col}
              toggling={toggling}
              onEdit={c => { setEditing(c); setShowModal(true); }}
              onDelete={setDeleteTarget}
              onTogglePublish={handleTogglePublish}
            />
          ))}
        </div>
      )}

      {/* Create/Edit modal */}
      {showModal && (
        <CollectionModal
          token={token}
          existing={editing}
          onClose={() => { setShowModal(false); setEditing(null); }}
          onSave={handleSave}
        />
      )}

      {/* Delete confirm */}
      {deleteTarget && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1100, padding: '16px',
        }}>
          <div style={{
            background: 'var(--dark)', borderRadius: '12px',
            border: '1px solid var(--border)', padding: '24px',
            maxWidth: '380px', width: '100%',
          }}>
            <h3 style={{ margin: '0 0 10px', fontSize: '1rem', fontWeight: 700, color: 'var(--white)' }}>
              Delete collection?
            </h3>
            <p style={{ margin: '0 0 20px', fontSize: '0.85rem', color: 'var(--gray)', lineHeight: 1.5 }}>
              <strong style={{ color: 'var(--white)' }}>{deleteTarget.title}</strong> will be permanently deleted.
              Products are not affected.
            </p>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => setDeleteTarget(null)}
                style={{
                  padding: '8px 16px', background: 'var(--dark2)',
                  border: '1px solid var(--border)', borderRadius: '8px',
                  color: 'var(--gray-light)', cursor: 'pointer', fontSize: '0.85rem',
                }}>
                Cancel
              </button>
              <button type="button" onClick={handleDelete} disabled={deleting}
                style={{
                  padding: '8px 16px', background: 'var(--red)',
                  border: 'none', borderRadius: '8px',
                  color: '#fff', fontWeight: 700, cursor: deleting ? 'not-allowed' : 'pointer',
                  fontSize: '0.85rem', opacity: deleting ? 0.7 : 1,
                }}>
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
