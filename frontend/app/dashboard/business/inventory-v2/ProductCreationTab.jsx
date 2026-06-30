'use client';
import { useState, useMemo } from 'react';
import { S, ICONS, Field, IntegerInput, Modal, ConfirmModal, PaginationBar, SearchBar, Note, EmptyState, SummaryCard, usePagination, formatCurrency, uid, CustomSelect } from './shared';
import { createBom, updateBom, deleteBom } from './api';

const EMPTY_FORM = { productName:'', items:[] };

function validate(f) {
  const e = {};
  if (!f.productName.trim())  e.productName = 'Product name is required.';
  else if (f.productName.length > 150) e.productName = 'Name too long (max 150 chars).';
  if (!f.items.length)        e.items       = 'Add at least one material to the BOM.';
  f.items.forEach((it, i) => {
    if (!it.qty || Number(it.qty) < 1) e[`qty_${i}`] = 'Qty must be ≥ 1.';
  });
  return e;
}

function BomCostBreakdown({ items, materials, batches }) {
  const fifoMap = useMemo(() => {
    const m = {};
    (batches || []).forEach(b => {
      if (!m[b.matId]) m[b.matId] = [];
      m[b.matId].push(b);
    });
    Object.keys(m).forEach(k => m[k].sort((a, b) => new Date(a.date) - new Date(b.date)));
    return m;
  }, [batches]);

  const rows = items.map(it => {
    const mat   = materials.find(m => m.id === it.matId);
    const batch = fifoMap[it.matId]?.[0];
    const cost  = batch ? batch.unitCost : (mat?.baseCost || 0);
    return { mat, qty: Number(it.qty) || 0, unitCost: cost, total: cost * (Number(it.qty) || 0) };
  });

  const bomTotal = rows.reduce((s, r) => s + r.total, 0);

  return (
    <div style={{ background:'var(--dark2)', borderRadius:'8px', padding:'12px', marginTop:'6px' }}>
      <div style={{ fontSize:'12px', fontWeight:600, color:'var(--gray)', marginBottom:'8px', textTransform:'uppercase', letterSpacing:'.4px' }}>BOM Cost Estimate (FIFO)</div>
      {rows.map((r, i) => (
        <div key={i} style={{ display:'flex', justifyContent:'space-between', fontSize:'12px', padding:'3px 0', borderBottom: i < rows.length - 1 ? '1px solid var(--border)' : 'none' }}>
          <span style={{ color:'var(--gray-light)' }}>{r.mat?.name || '?'} × {r.qty} {r.mat?.unit}</span>
          <span style={{ color:'var(--gray)' }}>{formatCurrency(r.total)}</span>
        </div>
      ))}
      <div style={{ display:'flex', justifyContent:'space-between', fontWeight:700, fontSize:'13px', marginTop:'8px', paddingTop:'8px', borderTop:'2px solid var(--border)' }}>
        <span>Est. Production Cost</span>
        <span style={{ color:'var(--gold)' }}>{formatCurrency(bomTotal)}</span>
      </div>
    </div>
  );
}

export default function ProductCreationTab({ boms, setBoms, materials, batches, token, onRefresh, toast }) {
  const [search,   setSearch]  = useState('');
  const [form,     setForm]    = useState(EMPTY_FORM);
  const [errors,   setErrors]  = useState({});
  const [editId,   setEditId]  = useState(null);
  const [showForm, setShowForm]= useState(false);
  const [confirm,  setConfirm] = useState(null);
  const [addMat,   setAddMat]  = useState('');
  const [saving,   setSaving]  = useState(false);

  const filtered = useMemo(() => {
    if (!search.trim()) return boms;
    const q = search.toLowerCase();
    return boms.filter(b => b.productName.toLowerCase().includes(q));
  }, [boms, search]);

  const { slice, page, perPage, total, setPage, setPerPage } = usePagination(filtered);

  const stockMap = useMemo(() => {
    const m = {};
    (batches || []).forEach(b => { m[b.matId] = (m[b.matId] || 0) + (b.remainingQty || 0); });
    return m;
  }, [batches]);

  const openAdd = () => { setForm(EMPTY_FORM); setErrors({}); setEditId(null); setAddMat(''); setShowForm(true); };

  const openEdit = (b) => {
    setForm({ productName:b.productName, items: b.items.map(i => ({ ...i, qty:String(i.qty) })) });
    setErrors({}); setEditId(b.id); setAddMat(''); setShowForm(true);
  };

  const closeForm = () => { setShowForm(false); setErrors({}); };

  const save = async () => {
    const e = validate(form);
    if (Object.keys(e).length) { setErrors(e); return; }
    const components = form.items.map(it => {
      const mat = materials.find(m => m.id === it.matId);
      const batchList = (batches || []).filter(b => b.matId === it.matId).sort((a, b) => new Date(a.date) - new Date(b.date));
      return {
        inventoryId:  it.matId,
        materialName: mat?.name ?? it.matId,
        qty:          Number(it.qty),
        unit:         mat?.unit ?? 'pcs',
        unitCost:     batchList[0]?.unitCost ?? (mat?.baseCost ?? 0),
      };
    });
    const payload = {
      productName:      form.productName.trim(),
      productGroupName: form.productName.trim(),
      variantName:      '',
      components,
    };
    setSaving(true);
    try {
      if (editId) {
        await updateBom(token, editId, payload);
      } else {
        await createBom(token, payload);
      }
      await onRefresh(['boms']);
      closeForm();
      toast?.(editId ? 'Product updated.' : 'Product created.', 'success');
    } catch (err) {
      setErrors({ _api: err.message });
    } finally {
      setSaving(false);
    }
  };

  const addItem = () => {
    if (!addMat) return;
    if (form.items.find(i => i.matId === addMat)) { setAddMat(''); return; }
    setForm(p => ({ ...p, items:[...p.items, { matId:addMat, qty:'1' }] }));
    setErrors(p => ({ ...p, items:'' }));
    setAddMat('');
  };

  const removeItem = (idx) => setForm(p => ({ ...p, items:p.items.filter((_,i) => i !== idx) }));

  const setQty = (idx, v) => {
    setForm(p => { const items=[...p.items]; items[idx]={...items[idx],qty:v}; return {...p,items}; });
    setErrors(p => ({ ...p, [`qty_${idx}`]:'' }));
  };

  const setF = (k, v) => { setForm(p => ({ ...p, [k]:v })); setErrors(p => ({ ...p, [k]:'' })); };

  // available materials not yet in form items
  const availableMats = materials.filter(m => !form.items.find(i => i.matId === m.id));

  return (
    <div style={S.col}>
      <SummaryCard label="Products Defined" value={boms.length} accent style={{ alignSelf:'flex-start', minWidth:0 }} />

      {/* toolbar */}
      <div style={{ ...S.card, ...S.rowBetween }}>
        <SearchBar value={search} onChange={setSearch} placeholder="Search product name…" style={{ width:'260px' }} />
        <button onClick={openAdd} style={S.btnPrimary}>{ICONS.plus} New Product</button>
      </div>

      {/* table */}
      <div style={{ ...S.card, padding:0, overflow:'hidden' }}>
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr>
                {[{l:'Product Name'},{l:'Materials (BOM)'},{l:'Est. Cost',r:true},{l:'',r:true}].map(h => (
                  <th key={h.l} style={{ ...S.th, textAlign: h.r ? 'right' : 'left' }}>{h.l}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {slice.length === 0 ? (
                <tr><td colSpan={4}><EmptyState message="No products defined" sub="Create a product with its Bill of Materials." /></td></tr>
              ) : slice.map(bom => {
                const cost = bom.items.reduce((s, it) => {
                  const mat = materials.find(m => m.id === it.matId);
                  const batList = (batches || []).filter(b => b.matId === it.matId).sort((a, b) => new Date(a.date) - new Date(b.date));
                  const uc = batList[0]?.unitCost ?? (mat?.baseCost || 0);
                  return s + uc * it.qty;
                }, 0);
                return (
                  <tr key={bom.id} style={S.tr} onMouseEnter={e => e.currentTarget.style.background='var(--dark2)'} onMouseLeave={e => e.currentTarget.style.background=''}>
                    <td style={{ ...S.td, fontWeight:600 }}>{bom.productName}</td>
                    <td style={S.td}>
                      <div style={{ display:'flex', flexWrap:'wrap', gap:'4px' }}>
                        {bom.items.map(it => {
                          const mat = materials.find(m => m.id === it.matId);
                          const stock = stockMap[it.matId] || 0;
                          const canMake = stock >= it.qty;
                          return (
                            <span key={it.matId} title={canMake ? undefined : 'Insufficient stock'}
                              style={{ background: canMake ? '#f0f4ff' : '#fde8e8', color: canMake ? '#1e40af' : '#c62828', borderRadius:'5px', padding:'2px 8px', fontSize:'11px', fontWeight:500 }}>
                              {mat?.name || it.matId} ×{it.qty}
                            </span>
                          );
                        })}
                      </div>
                    </td>
                    <td style={{ ...S.td, fontWeight:600, color:'var(--gold)', textAlign:'right' }}>{formatCurrency(cost)}</td>
                    <td style={{ ...S.td, textAlign:'right' }}>
                      <div style={{ display:'flex', gap:'6px', justifyContent:'flex-end' }}>
                        <button onClick={() => openEdit(bom)} style={S.btnSmGhost}>{ICONS.edit}</button>
                        <button onClick={() => setConfirm({ id:bom.id, name:bom.productName })} style={S.btnSmDanger}>{ICONS.trash}</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div style={{ padding:'12px 16px', borderTop:'1px solid var(--border)' }}>
          <PaginationBar total={total} page={page} perPage={perPage} onPage={setPage} onPerPage={setPerPage} />
        </div>
      </div>

      {/* Add/Edit modal */}
      <Modal
        open={showForm}
        onClose={closeForm}
        title={editId ? 'Edit Product BOM' : 'New Product'}
        width={560}
        footer={
          <>
            <button onClick={closeForm} style={S.btnGhost} disabled={saving}>Cancel</button>
            <button onClick={save} style={{ ...S.btnPrimary, opacity: saving ? .6 : 1 }} disabled={saving}>{ICONS.check} {editId ? 'Save Changes' : 'Create Product'}</button>
          </>
        }
      >
        <div style={{ display:'flex', flexDirection:'column', gap:'14px' }}>
          {errors._api && <div style={{ color:'#c62828', fontSize:'12px', padding:'8px 12px', background:'#fff5f5', borderRadius:'6px' }}>{errors._api}</div>}
          <Field label="Product Name" required error={errors.productName}>
            <input
              value={form.productName}
              onChange={e => setF('productName', e.target.value)}
              placeholder="e.g. Custom Mug 11oz"
              maxLength={150}
              style={errors.productName ? S.inputErr : S.input}
            />
          </Field>

          <Note type="info">
            Define the Bill of Materials (BOM): the raw materials consumed to produce one unit of this product. Quantities use the unit defined per material.
          </Note>

          {/* add material row */}
          <Field label="Add Material to BOM">
            <div style={{ display:'flex', gap:'8px' }}>
              <CustomSelect value={addMat} onChange={setAddMat}
                options={availableMats.map(m => ({ value:m.id, label:`${m.name} (${m.unit})` }))}
                placeholder="Select material"
                style={{ flex:1 }} />
              <button onClick={addItem} disabled={!addMat} style={{ ...S.btnPrimary, opacity: addMat ? 1 : .5 }}>{ICONS.plus} Add</button>
            </div>
          </Field>

          {errors.items && <span style={S.errText}>{errors.items}</span>}

          {/* BOM items */}
          {form.items.length > 0 && (
            <div style={{ border:'1px solid var(--border)', borderRadius:'8px', overflow:'hidden' }}>
              <table style={{ width:'100%', borderCollapse:'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ ...S.th, padding:'8px 12px' }}>Material</th>
                    <th style={{ ...S.th, padding:'8px 12px' }}>Qty per Unit</th>
                    <th style={{ ...S.th, padding:'8px 12px' }}>Stock</th>
                    <th style={{ ...S.th, padding:'8px 12px', width:'40px' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {form.items.map((it, i) => {
                    const mat   = materials.find(m => m.id === it.matId);
                    const stock = stockMap[it.matId] || 0;
                    return (
                      <tr key={it.matId}>
                        <td style={{ ...S.td, padding:'8px 12px', fontWeight:500 }}>{mat?.name || it.matId}</td>
                        <td style={{ ...S.td, padding:'8px 12px', width:'120px' }}>
                          <div>
                            <IntegerInput value={it.qty} onChange={v => setQty(i, v)} placeholder="1" style={errors[`qty_${i}`] ? S.inputErr : undefined} />
                            {errors[`qty_${i}`] && <span style={S.errText}>{errors[`qty_${i}`]}</span>}
                          </div>
                        </td>
                        <td style={{ ...S.td, padding:'8px 12px', fontSize:'12px', color: stock < Number(it.qty || 1) ? '#c62828' : '#2e7d32' }}>
                          {stock} {mat?.unit}
                        </td>
                        <td style={{ ...S.td, padding:'8px 12px' }}>
                          <button onClick={() => removeItem(i)} style={{ background:'none', border:'none', cursor:'pointer', color:'#e05252', display:'flex' }}>{ICONS.trash}</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {form.items.length > 0 && (
            <BomCostBreakdown items={form.items} materials={materials} batches={batches} />
          )}
        </div>
      </Modal>

      {/* Delete confirm */}
      <ConfirmModal
        open={!!confirm}
        onClose={() => setConfirm(null)}
        onConfirm={async () => {
          try {
            await deleteBom(token, confirm.id);
            await onRefresh(['boms']);
            toast?.(`Product deleted.`, 'warn');
          } catch (err) {
            toast?.(err.message, 'error');
          }
          setConfirm(null);
        }}
        title="Delete Product"
        confirmLabel="Delete"
        confirmStyle="danger"
        message={`Delete product "${confirm?.name}"? This will remove its Bill of Materials definition. This cannot be undone.`}
      />
    </div>
  );
}
