'use client';
import { useState, useEffect } from 'react';
import { S, ICONS, Field, IntegerInput, DecimalInput, Modal, ConfirmModal, Note, formatCurrency, uid } from '../inventory-v2/shared';
import { PRODUCT_CATEGORIES } from './mock-data';

const EMPTY_VARIANT = () => ({ id: uid('v'), name: '', bomId: '', price: '', downpaymentPct: '50' });

const EMPTY_FORM = {
  name: '', category: 'T-Shirts', description: '', thumbnail: '',
  type: 'standalone',
  bomId: '', price: '', downpaymentPct: '0',
  variants: [EMPTY_VARIANT()],
  hideWhenOutOfStock: false, isPublished: false,
};

function validate(f) {
  const e = {};
  if (!f.name.trim())           e.name     = 'Product name is required.';
  else if (f.name.length > 120) e.name     = 'Name too long (max 120 chars).';
  if (!f.category)              e.category = 'Category is required.';
  if (f.description.length > 500) e.description = 'Max 500 characters.';
  if (f.downpaymentPct === '' || isNaN(Number(f.downpaymentPct)) || Number(f.downpaymentPct) < 0 || Number(f.downpaymentPct) > 100)
                                e.downpaymentPct = 'Enter 0–100.';
  if (f.type === 'standalone') {
    if (!f.bomId)               e.bomId    = 'Select a BOM.';
    if (!f.price || Number(f.price) <= 0) e.price = 'Price must be > 0.';
  } else {
    if (!f.variants.length)     e.variants = 'Add at least one variant.';
    f.variants.forEach((v, i) => {
      if (!v.name.trim())       e[`vname_${i}`]  = 'Variant name required.';
      if (!v.bomId)             e[`vbom_${i}`]   = 'Select a BOM.';
      if (!v.price || Number(v.price) <= 0) e[`vprice_${i}`] = 'Price > 0 required.';
    });
  }
  return e;
}

function Toggle({ on, onChange }) {
  return (
    <button type="button" onClick={() => onChange(!on)}
      style={{ position:'relative', width:'40px', height:'22px', borderRadius:'11px', border:'none', cursor:'pointer',
        background: on ? '#c9973f' : '#e1e3e5', flexShrink:0, transition:'background .15s' }}>
      <span style={{ position:'absolute', top:'3px', left: on ? '21px' : '3px', width:'16px', height:'16px',
        borderRadius:'50%', background:'#fff', transition:'left .15s', boxShadow:'0 1px 3px rgba(0,0,0,.2)' }} />
    </button>
  );
}

export default function ProductFormModal({ open, onClose, onSave, product, boms }) {
  const [form,   setForm]   = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (!open) return;
    if (product) {
      setForm({
        name:              product.name || '',
        category:          product.category || 'T-Shirts',
        description:       product.description || '',
        thumbnail:         product.thumbnail || '',
        type:              product.type || 'standalone',
        bomId:             product.bomId || '',
        price:             product.price != null ? String(product.price) : '',
        downpaymentPct:    product.downpaymentPct != null ? String(product.downpaymentPct) : '0',
        variants:          product.variants?.length
                             ? product.variants.map(v => ({ ...v, price: String(v.price), downpaymentPct: String(v.downpaymentPct ?? 0) }))
                             : [EMPTY_VARIANT()],
        hideWhenOutOfStock: product.hideWhenOutOfStock ?? false,
        isPublished:        product.isPublished ?? false,
      });
    } else {
      setForm(EMPTY_FORM);
    }
    setErrors({});
  }, [open, product]);

  const setF = (k, v) => { setForm(p => ({ ...p, [k]: v })); setErrors(p => ({ ...p, [k]: '' })); };

  const setVariant = (i, k, v) => {
    setForm(p => { const vs = [...p.variants]; vs[i] = { ...vs[i], [k]: v }; return { ...p, variants: vs }; });
    setErrors(p => ({ ...p, [`v${k}_${i}`]: '' }));
  };
  const addVariant    = () => setForm(p => ({ ...p, variants: [...p.variants, EMPTY_VARIANT()] }));
  const removeVariant = (i) => setForm(p => ({ ...p, variants: p.variants.filter((_, j) => j !== i) }));

  const save = () => {
    const e = validate(form);
    if (Object.keys(e).length) { setErrors(e); return; }
    const base = {
      name:              form.name.trim(),
      category:          form.category,
      description:       form.description.trim(),
      thumbnail:         form.thumbnail.trim(),
      type:              form.type,
      hideWhenOutOfStock:form.hideWhenOutOfStock,
      isPublished:       form.isPublished,
      downpaymentPct:    Number(form.downpaymentPct),
    };
    const data = form.type === 'standalone'
      ? { ...base, bomId: form.bomId, price: Number(form.price), variants: undefined }
      : { ...base, bomId: undefined, price: undefined,
          variants: form.variants.map(v => ({ ...v, price: Number(v.price) })) };
    onSave(data);
  };

  const isEdit = !!product;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? 'Edit Product' : 'Add Product'}
      width={580}
      footer={
        <>
          <button onClick={onClose} style={S.btnGhost}>Cancel</button>
          <button onClick={save} style={S.btnPrimary}>{ICONS.check} {isEdit ? 'Save Changes' : 'Add Product'}</button>
        </>
      }
    >
      <div style={{ display:'flex', flexDirection:'column', gap:'14px' }}>

        {/* Name */}
        <Field label="Product Name" required error={errors.name}>
          <input value={form.name} onChange={e => setF('name', e.target.value)}
            placeholder="e.g. Custom White T-Shirt" maxLength={120}
            style={errors.name ? S.inputErr : S.input} />
        </Field>

        {/* Category */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px' }}>
          <Field label="Category" required error={errors.category}>
            <select value={form.category} onChange={e => setF('category', e.target.value)}
              style={errors.category ? S.selectErr : S.select}>
              {PRODUCT_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>

          {/* DP % */}
          <Field label="Downpayment Required (%)" error={errors.downpaymentPct}>
            <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
              <IntegerInput value={form.downpaymentPct} onChange={v => setF('downpaymentPct', v)}
                max={100} placeholder="0"
                style={{ ...(errors.downpaymentPct ? S.inputErr : S.input), width:'80px' }} />
              <span style={{ fontSize:'12px', color:'#6b7280' }}>
                {Number(form.downpaymentPct) === 0 ? 'No DP required' : `${form.downpaymentPct}% upon approval`}
              </span>
            </div>
          </Field>
        </div>

        {/* Description */}
        <Field label="Description" error={errors.description}>
          <textarea value={form.description} onChange={e => setF('description', e.target.value)}
            maxLength={500} placeholder="Optional product description…" style={S.textarea} />
          <span style={{ fontSize:'11px', color:'#9ca3af', textAlign:'right' }}>{form.description.length}/500</span>
        </Field>

        {/* Cover Image */}
        <Field label="Cover Image URL">
          <input value={form.thumbnail} onChange={e => setF('thumbnail', e.target.value)}
            placeholder="https://… (leave blank for default)" style={S.input} />
        </Field>

        {/* Divider */}
        <div style={S.divider} />

        {/* Type selector */}
        <Field label="Product Type" required>
          <div style={{ display:'flex', gap:'8px' }}>
            {[{val:'standalone', label:'Standalone', desc:'Single product, one BOM'},
              {val:'multi-variant', label:'Multi-Variant', desc:'Multiple options (e.g. sizes, types)'}].map(o => (
              <label key={o.val} style={{ flex:1, display:'flex', flexDirection:'column', gap:'4px', padding:'12px', border:`1px solid ${form.type===o.val ? '#c9973f' : '#e1e3e5'}`, borderRadius:'8px', cursor:'pointer', background: form.type===o.val ? '#fffbe8' : '#fff', transition:'all .12s' }}>
                <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
                  <input type="radio" name="ptype" value={o.val} checked={form.type===o.val} onChange={() => setF('type', o.val)} style={{ accentColor:'#c9973f' }} />
                  <span style={{ fontWeight:600, fontSize:'13px' }}>{o.label}</span>
                </div>
                <span style={{ fontSize:'11px', color:'#9ca3af', paddingLeft:'20px' }}>{o.desc}</span>
              </label>
            ))}
          </div>
        </Field>

        {/* ── Standalone fields ── */}
        {form.type === 'standalone' && (
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px' }}>
            <Field label="Bill of Materials (BOM)" required error={errors.bomId}>
              <select value={form.bomId} onChange={e => setF('bomId', e.target.value)}
                style={errors.bomId ? S.selectErr : S.select}>
                <option value="">— Select BOM —</option>
                {boms.map(b => <option key={b.id} value={b.id}>{b.productName}</option>)}
              </select>
            </Field>
            <Field label="Selling Price (₱)" required error={errors.price}>
              <DecimalInput value={form.price} onChange={v => setF('price', v)}
                placeholder="0.00" style={errors.price ? S.inputErr : undefined} />
            </Field>
          </div>
        )}

        {/* ── Multi-Variant fields ── */}
        {form.type === 'multi-variant' && (
          <div style={{ display:'flex', flexDirection:'column', gap:'10px' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <span style={{ fontSize:'13px', fontWeight:600, color:'#374151' }}>Variants</span>
              <button onClick={addVariant} style={S.btnSm}>{ICONS.plus} Add Variant</button>
            </div>
            {errors.variants && <span style={S.errText}>{errors.variants}</span>}
            {form.variants.map((v, i) => (
              <div key={v.id} style={{ border:'1px solid #e1e3e5', borderRadius:'8px', padding:'12px', background:'#fafbfc' }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'10px' }}>
                  <span style={{ fontSize:'12px', fontWeight:600, color:'#6b7280' }}>Variant {i + 1}</span>
                  {form.variants.length > 1 && (
                    <button onClick={() => removeVariant(i)} style={{ background:'none', border:'none', cursor:'pointer', color:'#e05252', display:'flex' }}>{ICONS.trash}</button>
                  )}
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'10px' }}>
                  <Field label="Variant Name" required error={errors[`vname_${i}`]}>
                    <input value={v.name} onChange={e => setVariant(i, 'name', e.target.value)}
                      placeholder="e.g. Inner Color" maxLength={80}
                      style={errors[`vname_${i}`] ? S.inputErr : S.input} />
                  </Field>
                  <Field label="BOM" required error={errors[`vbom_${i}`]}>
                    <select value={v.bomId} onChange={e => setVariant(i, 'bomId', e.target.value)}
                      style={errors[`vbom_${i}`] ? S.selectErr : S.select}>
                      <option value="">— Select —</option>
                      {boms.map(b => <option key={b.id} value={b.id}>{b.productName}</option>)}
                    </select>
                  </Field>
                  <Field label="Price (₱)" required error={errors[`vprice_${i}`]}>
                    <DecimalInput value={v.price} onChange={val => setVariant(i, 'price', val)}
                      placeholder="0.00" style={errors[`vprice_${i}`] ? S.inputErr : undefined} />
                  </Field>
                </div>
              </div>
            ))}
          </div>
        )}

        <div style={S.divider} />

        {/* Settings */}
        <div style={{ display:'flex', flexDirection:'column', gap:'12px' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <div>
              <div style={{ fontSize:'13px', fontWeight:600, color:'#374151' }}>Hide when out of stock</div>
              <div style={{ fontSize:'11px', color:'#9ca3af' }}>Product won't appear in shop when stock is 0</div>
            </div>
            <Toggle on={form.hideWhenOutOfStock} onChange={v => setF('hideWhenOutOfStock', v)} />
          </div>

          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <div>
              <div style={{ fontSize:'13px', fontWeight:600, color:'#374151' }}>Published</div>
              <div style={{ fontSize:'11px', color:'#9ca3af' }}>Visible in the shop storefront</div>
            </div>
            <Toggle on={form.isPublished} onChange={v => setF('isPublished', v)} />
          </div>
        </div>

        {Number(form.downpaymentPct) > 0 && (
          <Note type="info">
            Customers must pay <b>{form.downpaymentPct}%</b> downpayment upon order approval before production starts. Remaining balance is collected on delivery/pickup.
          </Note>
        )}

      </div>
    </Modal>
  );
}
