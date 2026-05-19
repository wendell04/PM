'use client';
import { useState, useMemo } from 'react';
import { S, ICONS, Field, Modal, ConfirmModal, PaginationBar, SearchBar, StatusBadge, EmptyState, SummaryCard, usePagination, uid } from './shared';
import { createSupplier, updateSupplier, deleteSupplier } from './api';

const EMPTY_FORM = { name:'', contact:'', email:'', address:'', itemsSupplied:[] };

function validate(f) {
  const e = {};
  if (!f.name.trim())              e.name    = 'Vendor name is required.';
  else if (f.name.length > 120)    e.name    = 'Name too long (max 120 chars).';
  if (f.contact) {
    const digits = f.contact.replace(/\D/g, '');
    if (digits.length !== 11) e.contact = 'Must be exactly 11 digits (e.g. 0927 251 8750).';
  }
  if (f.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim()))
                                   e.email   = 'Enter a valid email address.';
  if (f.address.length > 200)      e.address = 'Address too long (max 200 chars).';
  if (!f.itemsSupplied.length)     e.itemsSupplied = 'Select at least one item category.';
  return e;
}

export default function VendorsTab({ vendors, setVendors, materials, categories, onAddCategory, token, onRefresh, toast }) {
  const [search,      setSearch]      = useState('');
  const [form,        setForm]        = useState(EMPTY_FORM);
  const [errors,      setErrors]      = useState({});
  const [editId,      setEditId]      = useState(null);
  const [showForm,    setShowForm]    = useState(false);
  const [confirm,     setConfirm]     = useState(null);
  const [saving,      setSaving]      = useState(false);
  const [customInput, setCustomInput] = useState('');
  const [showCustom,  setShowCustom]  = useState(false);

  const matCountMap = useMemo(() => {
    const m = {};
    (materials || []).forEach(mat => { m[mat.vendorId] = (m[mat.vendorId] || 0) + 1; });
    return m;
  }, [materials]);

  const filtered = useMemo(() => {
    if (!search.trim()) return vendors;
    const q = search.toLowerCase();
    return vendors.filter(v =>
      v.name.toLowerCase().includes(q) ||
      v.email?.toLowerCase().includes(q) ||
      v.contact?.includes(q)
    );
  }, [vendors, search]);

  const { slice, page, perPage, total, setPage, setPerPage } = usePagination(filtered);

  const openAdd = () => { setForm(EMPTY_FORM); setErrors({}); setEditId(null); setShowForm(true); };

  const openEdit = (v) => {
    setForm({ name:v.name, contact:v.contact||'', email:v.email||'', address:v.address||'', itemsSupplied:[...(v.itemsSupplied||[])] });
    setErrors({}); setEditId(v.id); setShowForm(true);
  };

  const closeForm = () => { setShowForm(false); setErrors({}); };

  const save = async () => {
    const e = validate(form);
    if (Object.keys(e).length) { setErrors(e); return; }
    const payload = {
      name:          form.name.trim(),
      phone:         form.contact.trim(),
      email:         form.email.trim(),
      address:       form.address.trim(),
      itemsSupplied: form.itemsSupplied,
    };
    setSaving(true);
    try {
      if (editId) {
        await updateSupplier(token, editId, payload);
      } else {
        await createSupplier(token, payload);
      }
      await onRefresh(['vendors']);
      closeForm();
      toast?.(editId ? 'Vendor updated.' : 'Vendor added.', 'success');
    } catch (err) {
      setErrors({ _api: err.message });
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = (v) => {
    const count = matCountMap[v.id] || 0;
    setConfirm({ id:v.id, name:v.name, matCount:count });
  };

  const doDelete = async () => {
    try {
      await deleteSupplier(token, confirm.id);
      await onRefresh(['vendors']);
      toast?.(`"${confirm.name}" deleted.`, 'warn');
    } catch (err) {
      toast?.(err.message, 'error');
    }
    setConfirm(null);
  };

  const setF = (k, v) => { setForm(p => ({ ...p, [k]:v })); setErrors(p => ({ ...p, [k]:'' })); };

  const toggleCategory = (cat) => {
    setForm(p => {
      const has = p.itemsSupplied.includes(cat);
      return { ...p, itemsSupplied: has ? p.itemsSupplied.filter(c => c !== cat) : [...p.itemsSupplied, cat] };
    });
    setErrors(p => ({ ...p, itemsSupplied:'' }));
  };

  const addCustomCategory = () => {
    const val = customInput.trim();
    if (!val) return;
    onAddCategory?.(val);
    if (!form.itemsSupplied.includes(val)) {
      setF('itemsSupplied', [...form.itemsSupplied, val]);
    }
    setCustomInput('');
    setShowCustom(false);
  };

  return (
    <div style={S.col}>
      {/* summary */}
      <div style={{ display:'flex', gap:'12px', flexWrap:'wrap' }}>
        <SummaryCard label="Total Vendors" value={vendors.length} accent />
        <SummaryCard label="With Materials" value={Object.keys(matCountMap).length} />
      </div>

      {/* toolbar */}
      <div style={{ ...S.card, ...S.rowBetween }}>
        <SearchBar value={search} onChange={setSearch} placeholder="Search vendor name, email…" style={{ width:'260px' }} />
        <button onClick={openAdd} style={S.btnPrimary}>{ICONS.plus} Add Vendor</button>
      </div>

      {/* table */}
      <div style={{ ...S.card, padding:0, overflow:'hidden' }}>
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr>
                {[
                  {l:'Vendor Name'},{l:'Contact'},{l:'Email'},{l:'Address'},{l:'Items Supplied'},
                  {l:'Materials',c:true},{l:'',r:true},
                ].map(h => (
                  <th key={h.l} style={{ ...S.th, textAlign: h.r ? 'right' : h.c ? 'center' : 'left' }}>{h.l}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {slice.length === 0 ? (
                <tr><td colSpan={7}><EmptyState message="No vendors found" sub="Add a vendor to get started." /></td></tr>
              ) : slice.map(v => (
                <tr key={v.id} style={S.tr} onMouseEnter={e => e.currentTarget.style.background='#fafbfc'} onMouseLeave={e => e.currentTarget.style.background=''}>
                  <td style={{ ...S.td, fontWeight:600 }}>{v.name}</td>
                  <td style={{ ...S.td, fontSize:'12px', color:'#6b7280' }}>{v.contact}</td>
                  <td style={{ ...S.td, fontSize:'12px', color:'#6b7280' }}>{v.email}</td>
                  <td style={{ ...S.td, fontSize:'12px', color:'#6b7280', maxWidth:'180px' }}>{v.address}</td>
                  <td style={S.td}>
                    <div style={{ display:'flex', flexWrap:'wrap', gap:'4px' }}>
                      {(v.itemsSupplied || []).map(c => (
                        <span key={c} style={{ background:'#f0f4ff', color:'#1e40af', borderRadius:'5px', padding:'2px 7px', fontSize:'11px', fontWeight:500 }}>{c}</span>
                      ))}
                    </div>
                  </td>
                  <td style={{ ...S.td, textAlign:'center', fontWeight:600 }}>{matCountMap[v.id] || 0}</td>
                  <td style={{ ...S.td, textAlign:'right' }}>
                    <div style={{ display:'flex', gap:'6px', justifyContent:'flex-end' }}>
                      <button onClick={() => openEdit(v)} style={S.btnSmGhost}>{ICONS.edit}</button>
                      <button onClick={() => confirmDelete(v)} style={S.btnSmDanger}>{ICONS.trash}</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ padding:'12px 16px', borderTop:'1px solid #f0f1f2' }}>
          <PaginationBar total={total} page={page} perPage={perPage} onPage={setPage} onPerPage={setPerPage} />
        </div>
      </div>

      {/* Add / Edit modal */}
      <Modal
        open={showForm}
        onClose={closeForm}
        title={editId ? 'Edit Vendor' : 'Add Vendor'}
        width={520}
        footer={
          <>
            <button onClick={closeForm} style={S.btnGhost} disabled={saving}>Cancel</button>
            <button onClick={save} style={{ ...S.btnPrimary, opacity: saving ? .6 : 1 }} disabled={saving}>{ICONS.check} {editId ? 'Save Changes' : 'Add Vendor'}</button>
          </>
        }
      >
        <div style={{ display:'flex', flexDirection:'column', gap:'14px' }}>
          {errors._api && <div style={{ color:'#c62828', fontSize:'12px', padding:'8px 12px', background:'#fff5f5', borderRadius:'6px' }}>{errors._api}</div>}
          <Field label="Vendor Name" required error={errors.name}>
            <input
              value={form.name}
              onChange={e => setF('name', e.target.value)}
              placeholder="e.g. PrintMart Philippines"
              maxLength={120}
              style={errors.name ? S.inputErr : S.input}
            />
          </Field>

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px' }}>
            <Field label="Contact Number" error={errors.contact}>
              <input
                value={form.contact}
                onChange={e => {
                  const digits = e.target.value.replace(/\D/g, '').slice(0, 11);
                  const fmt = digits.length <= 4 ? digits
                    : digits.length <= 7 ? `${digits.slice(0,4)} ${digits.slice(4)}`
                    : `${digits.slice(0,4)} ${digits.slice(4,7)} ${digits.slice(7)}`;
                  setF('contact', fmt);
                }}
                placeholder="0927 251 8750"
                maxLength={13}
                style={errors.contact ? S.inputErr : S.input}
              />
            </Field>
            <Field label="Email Address" error={errors.email}>
              <input
                value={form.email}
                onChange={e => setF('email', e.target.value)}
                placeholder="e.g. vendor@example.com"
                maxLength={120}
                style={errors.email ? S.inputErr : S.input}
              />
            </Field>
          </div>

          <Field label="Address" error={errors.address}>
            <input
              value={form.address}
              onChange={e => setF('address', e.target.value)}
              placeholder="e.g. Divisoria, Manila"
              maxLength={200}
              style={errors.address ? S.inputErr : S.input}
            />
          </Field>

          <Field label="Items Supplied" required error={errors.itemsSupplied}>
            <div style={{ display:'flex', flexWrap:'wrap', gap:'8px', padding:'10px', border:`1px solid ${errors.itemsSupplied ? '#e05252' : '#e1e3e5'}`, borderRadius:'7px', background:'#f9f9f9', maxHeight:'180px', overflowY:'auto' }}>
              {(categories || []).map(cat => {
                const active = form.itemsSupplied.includes(cat);
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => toggleCategory(cat)}
                    style={{
                      border: `1px solid ${active ? '#c9973f' : '#e1e3e5'}`,
                      borderRadius:'20px', padding:'4px 12px', fontSize:'12px', cursor:'pointer',
                      background: active ? '#c9973f' : '#fff',
                      color:      active ? '#fff'    : '#374151',
                      fontWeight: active ? 600       : 400,
                      transition: 'all .12s',
                    }}
                  >
                    {cat}
                  </button>
                );
              })}
              {showCustom ? (
                <div style={{ display:'flex', gap:'6px', width:'100%', marginTop:'4px' }}>
                  <input
                    value={customInput}
                    onChange={e => setCustomInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') addCustomCategory(); }}
                    placeholder="e.g. Packaging"
                    autoFocus
                    style={{ flex:1, ...S.input, fontSize:'12px', padding:'4px 8px' }}
                  />
                  <button type="button" onClick={addCustomCategory} style={{ ...S.btnPrimary, fontSize:'12px', padding:'4px 10px' }}>Add</button>
                  <button type="button" onClick={() => { setShowCustom(false); setCustomInput(''); }} style={{ ...S.btnGhost, fontSize:'12px', padding:'4px 8px' }}>✕</button>
                </div>
              ) : (
                <button type="button" onClick={() => setShowCustom(true)} style={{ fontSize:'11px', color:'#c9973f', background:'none', border:'1px dashed #c9973f', borderRadius:'20px', padding:'3px 10px', cursor:'pointer' }}>
                  + Add Custom
                </button>
              )}
            </div>
          </Field>
        </div>
      </Modal>

      {/* Delete confirm */}
      <ConfirmModal
        open={!!confirm}
        onClose={() => setConfirm(null)}
        onConfirm={doDelete}
        title="Delete Vendor"
        confirmLabel="Delete"
        confirmStyle="danger"
        message={
          confirm?.matCount > 0
            ? `"${confirm?.name}" is linked to ${confirm?.matCount} material(s). Deleting will remove the vendor but materials will remain unlinked. This cannot be undone.`
            : `Delete "${confirm?.name}"? This cannot be undone.`
        }
      />
    </div>
  );
}
