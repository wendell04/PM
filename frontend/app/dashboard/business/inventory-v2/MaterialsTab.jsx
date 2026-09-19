'use client';
import { useIsPhone, KpiStrip, PhoneFilterBar, PhoneList, PhoneRow } from '@/components/dashboard/phone';
import { useState, useMemo } from 'react';
import { S, ICONS, Field, IntegerInput, DecimalInput, Modal, ConfirmModal, PaginationBar, SearchBar, StatusBadge, EmptyState, SummaryCard, usePagination, formatCurrency, uid, CustomSelect } from './shared';
import { createMat, updateMat, deleteMat, createSupplier, loadMinStockSuggestions, loadArchivedMats, restoreMat } from './api';

function getSkuPrefix(category) {
  const KNOWN = { Garments:'GAR', 'Print Materials':'PRT', Drinkware:'DRW', Packaging:'PKG', Accessories:'ACC', Bags:'BAG', Office:'OFF', Other:'OTH' };
  return KNOWN[category] || category.replace(/[^a-zA-Z]/g,'').slice(0,3).toUpperCase() || 'OTH';
}

function nextSku(category, existing) {
  const prefix = getSkuPrefix(category);
  const nums = existing
    .filter(m => m.sku?.startsWith(prefix + '-'))
    .map(m => parseInt(m.sku.split('-')[1] || '0', 10))
    .filter(n => !isNaN(n));
  const next = nums.length ? Math.max(...nums) + 1 : 1;
  return `${prefix}-${String(next).padStart(4, '0')}`;
}

function validateMat(f) {
  const e = {};
  if (!f.name.trim())            e.name     = 'Material name is required.';
  else if (f.name.length > 120)  e.name     = 'Name too long (max 120 chars).';
  if (!f.vendorId)               e.vendorId = 'Please select a vendor.';
  if (f.baseCost === '' || isNaN(Number(f.baseCost)) || Number(f.baseCost) <= 0)
                                 e.baseCost = 'Enter a valid base cost > 0.';
  if (f.minStock === '' || isNaN(Number(f.minStock)) || Number(f.minStock) < 0)
                                 e.minStock = 'Enter a valid min stock (≥ 0).';
  return e;
}

// ── SelectWithAdd ─────────────────────────────────────────────────────────────
function SelectWithAdd({ value, onChange, options, onAdd, label, style }) {
  const [adding, setAdding] = useState(false);
  const [newVal, setNewVal] = useState('');

  const confirm = () => {
    const v = newVal.trim();
    if (!v) { setAdding(false); return; }
    if (!options.includes(v)) onAdd(v);
    onChange(v);
    setNewVal('');
    setAdding(false);
  };

  return (
    <div style={style}>
      <div style={{ display:'flex', gap:'6px' }}>
        <CustomSelect value={value} onChange={onChange}
          options={options.map(o => ({ value: o, label: o }))}
          placeholder={`Select ${label}…`}
          style={{ flex: 1 }} />
        <button type="button" onClick={() => setAdding(p => !p)}
          style={{ ...S.btnGhost, padding:'0 11px', fontSize:'18px', lineHeight:1, flexShrink:0 }}
          title={`Add new ${label}`}>+</button>
      </div>
      {adding && (
        <div style={{ display:'flex', gap:'6px', marginTop:'5px' }}>
          <input value={newVal} onChange={e => setNewVal(e.target.value)} placeholder={`New ${label}…`}
            onKeyDown={e => { if (e.key==='Enter') confirm(); if (e.key==='Escape') { setAdding(false); setNewVal(''); } }}
            style={{ ...S.input, flex:1, fontSize:'12px', padding:'6px 10px' }} autoFocus />
          <button onClick={confirm} style={{ ...S.btnPrimary, padding:'6px 10px', fontSize:'12px' }}>{ICONS.check}</button>
          <button onClick={() => { setAdding(false); setNewVal(''); }} style={{ ...S.btnGhost, padding:'6px 10px', fontSize:'12px' }}>×</button>
        </div>
      )}
    </div>
  );
}

// ── Quick-Add Vendor modal ────────────────────────────────────────────────────
function QuickAddVendorModal({ open, onClose, categories, onAdd, initialCategory }) {
  const [name,     setName]     = useState('');
  const [contact,  setContact]  = useState('');
  const [supplied, setSupplied] = useState(initialCategory ? [initialCategory] : []);
  const [errors,   setErrors]   = useState({});

  const reset = () => { setName(''); setContact(''); setSupplied(initialCategory ? [initialCategory] : []); setErrors({}); };
  const handleClose = () => { reset(); onClose(); };

  const toggle = (cat) => {
    setSupplied(p => p.includes(cat) ? p.filter(c => c !== cat) : [...p, cat]);
    setErrors(p => ({ ...p, supplied:'' }));
  };

  const submit = () => {
    const e = {};
    if (!name.trim())      e.name     = 'Vendor name is required.';
    if (!supplied.length)  e.supplied = 'Select at least one category.';
    if (Object.keys(e).length) { setErrors(e); return; }
    onAdd({ name: name.trim(), contact: contact.trim(), itemsSupplied: supplied });
    reset();
  };

  if (!open) return null;
  return (
    <Modal open={open} onClose={handleClose} title="Quick Add Vendor" width={400}
      footer={<>
        <button onClick={handleClose} style={S.btnGhost}>Cancel</button>
        <button onClick={submit} style={S.btnPrimary}>{ICONS.check} Add Vendor</button>
      </>}
    >
      <div style={S.col}>
        <Field label="Vendor Name" required error={errors.name}>
          <input value={name} onChange={e => { setName(e.target.value); setErrors(p=>({...p,name:''})); }}
            placeholder="e.g. PrintMart Philippines" maxLength={120}
            style={errors.name ? S.inputErr : S.input} autoFocus />
        </Field>
        <Field label="Contact Number">
          <input value={contact} onChange={e => setContact(e.target.value)}
            placeholder="e.g. 09272518750" maxLength={20} style={S.input} />
        </Field>
        <Field label="Items Supplied" required error={errors.supplied}>
          <div style={{ display:'flex', flexWrap:'wrap', gap:'6px', padding:'8px', border:`1px solid ${errors.supplied?'#e05252':'var(--border)'}`, borderRadius:'7px', background:'var(--dark2)', maxHeight:'120px', overflowY:'auto' }}>
            {categories.map(cat => {
              const active = supplied.includes(cat);
              return (
                <button key={cat} type="button" onClick={() => toggle(cat)}
                  style={{ border:`1px solid ${active?'var(--gold)':'var(--border)'}`, borderRadius:'20px', padding:'3px 10px',
                    fontSize:'12px', cursor:'pointer', background: active?'var(--gold)':'var(--dark)',
                    color: active?'var(--dark)':'var(--gray-light)', fontWeight: active?600:400, transition:'all .12s' }}>
                  {cat}
                </button>
              );
            })}
          </div>
        </Field>
      </div>
    </Modal>
  );
}

// ── Manage Categories/Units modal ─────────────────────────────────────────────
function ManageListsModal({ open, onClose, categories, setCategories, units, setUnits, materials }) {
  const [newCat,  setNewCat]  = useState('');
  const [newUnit, setNewUnit] = useState('');
  const [pending, setPending] = useState(null); // { type:'cat'|'unit', value }

  const catUsage  = useMemo(() => {
    const m = {};
    (materials||[]).forEach(mat => { m[mat.category] = (m[mat.category]||0)+1; });
    return m;
  }, [materials]);

  const unitUsage = useMemo(() => {
    const m = {};
    (materials||[]).forEach(mat => { m[mat.unit] = (m[mat.unit]||0)+1; });
    return m;
  }, [materials]);

  const addCat = () => {
    const v = newCat.trim();
    if (!v || categories.includes(v)) return;
    setCategories(p => [...p, v]);
    setNewCat('');
  };

  const addUnit = () => {
    const v = newUnit.trim();
    if (!v || units.includes(v)) return;
    setUnits(p => [...p, v]);
    setNewUnit('');
  };

  const tryRemove = (type, value) => setPending({ type, value });
  const cancelRemove = () => setPending(null);
  const confirmRemove = () => {
    if (!pending) return;
    if (pending.type === 'cat') setCategories(p => p.filter(x => x !== pending.value));
    else setUnits(p => p.filter(x => x !== pending.value));
    setPending(null);
  };

  const renderList = (type, items, usage) => items.map(val => {
    const inUse  = usage[val] || 0;
    const isPending = pending?.type === type && pending?.value === val;
    return (
      <div key={val} style={{ borderRadius:'6px', overflow:'hidden', marginBottom:'3px' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'6px 10px',
          background: isPending ? '#fff5f5' : 'var(--dark2)', border: isPending ? '1px solid #fca5a5' : '1px solid transparent',
          borderRadius:'6px', fontSize:'13px' }}>
          <div>
            <span>{val}</span>
            {inUse > 0 && (
              <span style={{ fontSize:'11px', color:'var(--gray)', marginLeft:'6px' }}>({inUse} material{inUse!==1?'s':''})</span>
            )}
          </div>
          {isPending ? (
            <div style={{ display:'flex', alignItems:'center', gap:'6px', fontSize:'12px' }}>
              <span style={{ color:'#c62828', fontWeight:500 }}>
                {inUse > 0 ? `Remove? (${inUse} material${inUse!==1?'s':''} use this)` : 'Remove?'}
              </span>
              <button onClick={confirmRemove}
                style={{ background:'#c62828', color:'var(--dark)', border:'none', borderRadius:'4px', padding:'2px 8px', fontSize:'11px', cursor:'pointer', fontWeight:600 }}>
                Yes
              </button>
              <button onClick={cancelRemove}
                style={{ background:'none', border:'1px solid var(--border)', borderRadius:'4px', padding:'2px 8px', fontSize:'11px', cursor:'pointer' }}>
                No
              </button>
            </div>
          ) : (
            <button onClick={() => tryRemove(type, val)}
              style={{ background:'none', border:'none', cursor:'pointer', color:'var(--gray)', fontSize:'18px', lineHeight:1, padding:'0 2px' }}>×</button>
          )}
        </div>
      </div>
    );
  });

  return (
    <Modal open={open} onClose={onClose} title="Manage Categories & Units" width={540}
      footer={<button onClick={onClose} style={S.btnPrimary}>Done</button>}
    >
      <div style={{ display:'flex', gap:'24px' }}>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:'12px', fontWeight:700, color:'var(--gray-light)', marginBottom:'10px', textTransform:'uppercase' }}>Categories</div>
          <div style={{ display:'flex', gap:'6px', marginBottom:'10px' }}>
            <input value={newCat} onChange={e => setNewCat(e.target.value)} placeholder="New category…"
              onKeyDown={e => e.key==='Enter' && addCat()}
              style={{ ...S.input, flex:1, fontSize:'12px', padding:'6px 10px' }} />
            <button onClick={addCat} style={{ ...S.btnPrimary, padding:'6px 12px', fontSize:'12px' }}>{ICONS.plus}</button>
          </div>
          <div style={{ maxHeight:'260px', overflowY:'auto' }}>
            {renderList('cat', categories, catUsage)}
          </div>
        </div>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:'12px', fontWeight:700, color:'var(--gray-light)', marginBottom:'10px', textTransform:'uppercase' }}>Units</div>
          <div style={{ display:'flex', gap:'6px', marginBottom:'10px' }}>
            <input value={newUnit} onChange={e => setNewUnit(e.target.value)} placeholder="New unit…"
              onKeyDown={e => e.key==='Enter' && addUnit()}
              style={{ ...S.input, flex:1, fontSize:'12px', padding:'6px 10px' }} />
            <button onClick={addUnit} style={{ ...S.btnPrimary, padding:'6px 12px', fontSize:'12px' }}>{ICONS.plus}</button>
          </div>
          <div style={{ maxHeight:'260px', overflowY:'auto' }}>
            {renderList('unit', units, unitUsage)}
          </div>
        </div>
      </div>
    </Modal>
  );
}

// ── Main tab ──────────────────────────────────────────────────────────────────
// Days of cover: free stock divided by how fast the material has actually been leaving. Measured
// against the supplier's wait, because three days is fine from a same-day supplier and already
// late from a week-long one.
const COVER_TONE = {
  out:      { bg: 'rgba(198,40,40,0.16)',  fg: '#c62828', label: 'out' },
  critical: { bg: 'rgba(198,40,40,0.14)',  fg: '#c62828', label: null },
  soon:     { bg: 'rgba(224,168,82,0.16)', fg: '#b45309', label: null },
  ok:       { bg: 'rgba(46,125,50,0.12)',  fg: '#2e7d32', label: null },
};

// The same gauge To Buy draws: how full against the line the owner set. It answers "konti na
// ba?" without asking anyone to compare two numbers in their head.
function LevelBar({ have, min, uom, width = 96 }) {
  const m = Number(min) || 0;
  const h = Math.max(0, Number(have) || 0);
  if (m <= 0) return <span style={{ fontSize: 10.5, color: 'var(--gray)' }} title="No minimum set for this material.">no level set</span>;
  const pct  = Math.min(100, Math.round((h / m) * 100));
  const tone = pct === 0 ? '#c62828' : pct < 50 ? '#c62828' : pct < 100 ? '#b45309' : '#2e7d32';
  return (
    <span title={`${h} ${uom ?? ''} on hand against a minimum of ${m}`}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
      <span style={{ width, height: 6, borderRadius: 3, background: 'var(--dark2)', overflow: 'hidden', flexShrink: 0 }}>
        <span style={{ display: 'block', width: `${Math.max(2, pct)}%`, height: '100%', background: tone }} />
      </span>
      <span style={{ fontSize: 10.5, fontWeight: 700, color: tone }}>{h}/{m}</span>
    </span>
  );
}

function CoverCell({ mat }) {
  if (mat?.daysOfCover == null) {
    return <span title="Nothing has left the shelf yet, so there is no usage to measure against."
      style={{ fontSize: 11, color: 'var(--gray)' }}>-</span>;
  }
  const tone = COVER_TONE[mat.urgency] ?? COVER_TONE.ok;
  const d = mat.daysOfCover;
  const text = tone.label ?? (d === 0 ? 'today' : d === 1 ? '1 day' : `${d} days`);
  const lead = mat.leadTime > 0 ? `${mat.leadTime}-day` : 'assumed 7-day';
  return (
    <span title={`${mat.usagePerDay} ${mat.unit}/day over the last ${mat.coverBasisDays} days. Supplier wait: ${lead}.${mat.runsOutOn ? ` Runs out about ${mat.runsOutOn}.` : ''}`}
      style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.3px', textTransform: 'uppercase',
        padding: '2px 7px', borderRadius: 4, background: tone.bg, color: tone.fg, whiteSpace: 'nowrap' }}>
      {text}
    </span>
  );
}

export default function MaterialsTab({ materials, setMaterials, vendors, setVendors, batches, boms, categories, setCategories, units, setUnits, token, onRefresh, toast }) {
  const [search,       setSearch]     = useState('');
  const [catFilter,    setCat]        = useState('All');
  const [form,         setForm]       = useState({ name:'', category:'', unit:'', vendorId:'', baseCost:'', minStock:'', leadTime:'7', isOnDemand:false });
  const [errors,       setErrors]     = useState({});
  const [editId,       setEditId]     = useState(null);
  const [showForm,     setShowForm]   = useState(false);
  const [confirm,      setConfirm]    = useState(null);
  const [showManage,   setShowManage] = useState(false);
  // The minimum-stock review: null = closed, 'loading', or the rows the server suggested.
  const [sugg, setSugg] = useState(null);
  const [applying, setApplying] = useState(null);   // inventoryId being written, or 'all'
  const openSuggestions = async () => {
    setSugg('loading');
    try { setSugg(await loadMinStockSuggestions(token)); }
    catch (err) { toast?.(err.message, 'error'); setSugg(null); }
  };
  const acceptSuggestion = async (rows) => {
    setApplying(rows.length === 1 ? rows[0].inventoryId : 'all');
    let done = 0;
    for (const r of rows) {
      try { await updateMat(token, r.inventoryId, { minStockLevel: r.suggested }); done++; }
      catch (err) { toast?.(`${r.name}: ${err.message}`, 'error'); }
    }
    await onRefresh(['materials']);
    setSugg(prev => (prev && prev !== 'loading') ? { ...prev, rows: prev.rows.map(x => rows.find(a => a.inventoryId === x.inventoryId) ? { ...x, current: x.suggested } : x) } : prev);
    setApplying(null);
    if (done) toast?.(`${done} minimum${done === 1 ? '' : 's'} updated.`, 'success');
  };
  const [showQVendor,  setShowQVendor]= useState(false);
  const [saving,       setSaving]     = useState(false);

  const stockMap = useMemo(() => {
    const m = {};
    (batches || []).forEach(b => { m[b.matId] = (m[b.matId] || 0) + (b.remainingQty || 0); });
    // stockQty is the authoritative figure - batches are only its receipt history, and a material
    // can hold stock with no batch rows at all.
    (materials || []).forEach(mat => {
      if (mat.stockQty != null) m[mat.id] = Number(mat.stockQty);
    });
    return m;
  }, [batches, materials]);

  const inBomSet = useMemo(() => {
    const s = new Set();
    (boms || []).forEach(bom => (bom.items || []).forEach(it => s.add(it.matId)));
    return s;
  }, [boms]);

  const filtered = useMemo(() => {
    let list = materials;
    if (catFilter !== 'All') list = list.filter(m => m.category === catFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(m => m.name.toLowerCase().includes(q) || m.sku?.toLowerCase().includes(q));
    }
    return list;
  }, [materials, catFilter, search]);

  const { slice, page, perPage, total, setPage, setPerPage } = usePagination(filtered);
  const isPhone = useIsPhone();

  const openAdd = () => {
    setForm({ name:'', category: categories[0]||'', unit: units[0]||'', vendorId:'', baseCost:'', minStock:'', leadTime:'7', isOnDemand:false });
    setErrors({}); setEditId(null); setShowForm(true);
  };

  const openEdit = (mat) => {
    setForm({ name:mat.name, category:mat.category, unit:mat.unit, vendorId:mat.vendorId, baseCost:String(mat.baseCost), minStock:String(mat.minStock), leadTime:String(mat.leadTime ?? 7), isOnDemand:!!mat.isOnDemand });
    setErrors({}); setEditId(mat.id); setShowForm(true);
  };

  const closeForm = () => { setShowForm(false); setErrors({}); };

  const save = async () => {
    const e = validateMat(form);
    if (Object.keys(e).length) { setErrors(e); return; }
    const vendor = vendors.find(v => v.id === form.vendorId);
    const payload = {
      name:          form.name.trim(),
      category:      form.category,
      uom:           form.unit,
      supplierId:    form.vendorId || null,
      supplierName:  vendor?.name || null,
      baseCost:      Number(form.baseCost),
      minStockLevel: Number(form.minStock),
      leadTimeDays:  Number(form.leadTime || 7),
      isOnDemand:    !!form.isOnDemand,
    };
    setSaving(true);
    try {
      if (editId) {
        await updateMat(token, editId, payload);
      } else {
        await createMat(token, { ...payload, stockQty: 0, unitCost: Number(form.baseCost) });
      }
      await onRefresh(['materials']);
      closeForm();
      toast?.(editId ? 'Material updated.' : 'Material added.', 'success');
    } catch (err) {
      setErrors({ _api: err.message });
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = (mat) => {
    const qty   = stockMap[mat.id] || 0;
    const inBom = inBomSet.has(mat.id);
    setConfirm({ id:mat.id, name:mat.name, hasStock: qty > 0, qty, inBom });
  };

  const doDelete = async () => {
    if (confirm?.inBom) { setConfirm(null); return; }
    try {
      await deleteMat(token, confirm.id);
      await onRefresh(['materials']);
      toast?.(`"${confirm.name}" deleted.`, 'warn');
    } catch (err) {
      toast?.(err.message, 'error');
    }
    setConfirm(null);
  };

  // Archiving was reversible in the database and irreversible from the screen - nothing could
  // see an archived material, so nothing could put one back. This is the missing half.
  const [showArchived, setShowArchived] = useState(false);
  const [archived,     setArchived]     = useState(null);   // null = not loaded yet
  const [archBusy,     setArchBusy]     = useState('');

  const openArchived = async () => {
    setShowArchived(true);
    try {
      setArchived(await loadArchivedMats(token));
    } catch (err) {
      toast?.(err.message, 'error');
      setArchived([]);
    }
  };

  const doRestore = async (row) => {
    const id = String(row._id ?? row.id ?? '');
    setArchBusy(id);
    try {
      await restoreMat(token, id);
      setArchived(a => (a ?? []).filter(r => String(r._id ?? r.id) !== id));
      await onRefresh(['materials']);
      toast?.(`"${row.name}" is back in Master Data.`, 'success');
    } catch (err) {
      toast?.(err.message, 'error');
    }
    setArchBusy('');
  };

  const catVendors = useMemo(() =>
    vendors.filter(v => !form.category || (v.itemsSupplied || []).includes(form.category)),
  [vendors, form.category]);

  const setF = (k, v) => {
    setForm(p => {
      const next = { ...p, [k]: v };
      if (k === 'category' && next.vendorId) {
        const vnd = vendors.find(x => x.id === next.vendorId);
        if (vnd && !(vnd.itemsSupplied || []).includes(v)) next.vendorId = '';
      }
      return next;
    });
    setErrors(p => ({ ...p, [k]: '' }));
  };

  const handleQuickAddVendor = async ({ name, contact, itemsSupplied }) => {
    try {
      const created = await createSupplier(token, { name, phone: contact, itemsSupplied });
      await onRefresh(['vendors']);
      const newId = String(created._id ?? created.id ?? '');
      if (newId) setF('vendorId', newId);
    } catch (err) {
      toast?.(err.message, 'error');
    }
    setShowQVendor(false);
  };

  const inStock  = materials.filter(m => (stockMap[m.id] || 0) > m.minStock).length;
  const lowStock = materials.filter(m => { const q = stockMap[m.id] || 0; return q > 0 && q <= m.minStock; }).length;
  const outStock = materials.filter(m => (stockMap[m.id] || 0) === 0).length;

  return (
    <div style={S.col}>
      {isPhone ? (
        <>
          <button onClick={openAdd} style={{ ...S.btnPrimary, minHeight:44, justifyContent:'center' }}>{ICONS.plus} Add Material</button>
          <KpiStrip items={[
            { key:'all', label:'Materials',    value: materials.length },
            { key:'in',  label:'In stock',     value: inStock,  color:'#2e7d32' },
            { key:'low', label:'Low stock',    value: lowStock, color:'#b45309' },
            { key:'out', label:'Out of stock', value: outStock, color:'#c62828' },
          ]} />
          <PhoneFilterBar search={search} onSearch={setSearch} placeholder="Search name or SKU"
            filters={[{ key:'cat', label:'Category', value:catFilter, defaultValue:'All', onChange:setCat,
              options:[{ value:'All', label:'All' }, ...categories.map(c => ({ value:c, label:c }))] }]}
            actions={<><button onClick={openArchived} style={{ ...S.btnSmGhost, minHeight:36 }}>Archived</button><button onClick={() => setShowManage(true)} style={{ ...S.btnSmGhost, minHeight:36 }}>Manage lists</button></>}
            note={`${total} material${total !== 1 ? 's' : ''}`} />
        </>
      ) : (<>
      <div style={{ display:'flex', gap:'12px', flexWrap:'wrap' }}>
        <SummaryCard label="Total Materials" value={materials.length} accent />
        <SummaryCard label="In Stock"        value={inStock}          color="#2e7d32" />
        <SummaryCard label="Low Stock"       value={lowStock}         color="#b45309" />
        <SummaryCard label="Out of Stock"    value={outStock}         color="#c62828" />
      </div>

      <div style={{ ...S.card, ...S.rowBetween }}>
        <div style={{ display:'flex', gap:'8px', flexWrap:'wrap' }}>
          <SearchBar value={search} onChange={setSearch} placeholder="Search name or SKU…" style={{ width:'220px' }} />
          <CustomSelect value={catFilter} onChange={setCat}
            options={[{ value:'All', label:'All Categories' }, ...categories.map(c => ({ value:c, label:c }))]}
            style={{ width:'160px' }} />
        </div>
        <div style={{ display:'flex', gap:'8px' }}>
          <button onClick={openArchived} style={S.btnGhost} title="Materials taken out of circulation. Their stock and history are kept, and any of them can be put back.">Archived</button>
          <button onClick={() => setShowManage(true)} style={S.btnGhost}>Manage Lists</button>
          <button onClick={openAdd} style={S.btnPrimary}>{ICONS.plus} Add Material</button>
        </div>
      </div>

      </>)}

      {isPhone ? (
        <>
          {slice.length === 0 ? (
            <div style={{ ...S.card, padding:0 }}><EmptyState message="No materials found" sub="Add a material or adjust filters." /></div>
          ) : (
            <PhoneList>
              {slice.map((mat, i) => {
                const qty    = stockMap[mat.id] || 0;
                const status = qty === 0 ? 'out_of_stock' : qty <= mat.minStock ? 'low_stock' : 'in_stock';
                const vendor = vendors.find(v => v.id === mat.vendorId);
                return (
                  <PhoneRow key={mat.id} first={i === 0} onClick={() => openEdit(mat)}
                    title={mat.sku} chip={<StatusBadge status={status} />}
                    meta={mat.name}
                    sub={[`${qty} ${mat.unit}`, `min ${mat.minStock}`, formatCurrency(mat.baseCost), mat.category, vendor?.name].filter(Boolean).join(' \u00b7 ')} />
                );
              })}
            </PhoneList>
          )}
          <div style={{ padding:'12px 0' }}>
            <PaginationBar total={total} page={page} perPage={perPage} onPage={setPage} onPerPage={setPerPage} />
          </div>
        </>
      ) : (
      <div style={{ ...S.card, padding:0, overflow:'hidden' }}>
        <div style={{ overflowX:'auto' }}>
          <table className="pmp-rt" style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr>
                {['SKU','Material Name','Category','Unit','Vendor','Base Cost','Min Stock','Stock','Status',''].map((h, i) => (
                  <th key={i} style={S.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {slice.length === 0 ? (
                <tr><td colSpan={10}><EmptyState message="No materials found" sub="Add a material or adjust filters." /></td></tr>
              ) : slice.map(mat => {
                const qty    = stockMap[mat.id] || 0;
                const status = qty === 0 ? 'out_of_stock' : qty <= mat.minStock ? 'low_stock' : 'in_stock';
                const vendor = vendors.find(v => v.id === mat.vendorId);
                return (
                  <tr key={mat.id} style={S.tr} onMouseEnter={e => e.currentTarget.style.background='var(--dark2)'} onMouseLeave={e => e.currentTarget.style.background=''}>
                    <td style={{ ...S.td, fontFamily:'monospace', fontSize:'12px', color:'var(--gray)' }}>{mat.sku}</td>
                    <td style={{ ...S.td, fontWeight:500 }}>{mat.name}</td>
                    <td style={S.td}><span style={{ background:'var(--dark2)', borderRadius:'5px', padding:'2px 8px', fontSize:'12px', color:'var(--gray-light)' }}>{mat.category}</span></td>
                    <td style={S.td}>{mat.unit}</td>
                    <td style={{ ...S.td, fontSize:'12px', color:'var(--gray)' }}>{vendor?.name}</td>
                    <td style={S.td}>{formatCurrency(mat.baseCost)}</td>
                    <td style={S.td}>{mat.minStock} {mat.unit}</td>
                    <td style={S.td}>
                      <div style={{ fontWeight:600, marginBottom:3 }}>{qty} {mat.unit}</div>
                      <LevelBar have={qty} min={mat.minStock} uom={mat.unit} />
                    </td>
                    <td style={S.td}><StatusBadge status={status} /></td>
                    <td style={{ ...S.td, textAlign:'right' }}>
                      <div style={{ display:'flex', gap:'6px', justifyContent:'flex-end' }}>
                        <button onClick={() => openEdit(mat)} style={S.btnSmGhost}>{ICONS.edit}</button>
                        <button onClick={() => confirmDelete(mat)} style={S.btnSmDanger}>{ICONS.trash}</button>
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

      )}

      {/* Add / Edit modal */}
      <Modal
        open={showForm}
        onClose={closeForm}
        title={editId ? 'Edit Material' : 'Add Material'}
        width={520}
        footer={
          <>
            <button onClick={closeForm} style={S.btnGhost} disabled={saving}>Cancel</button>
            <button onClick={save} style={{ ...S.btnPrimary, opacity: saving ? .6 : 1 }} disabled={saving}>{ICONS.check} {editId ? 'Save Changes' : 'Add Material'}</button>
          </>
        }
      >
        <div style={{ display:'flex', flexDirection:'column', gap:'14px' }}>
          {errors._api && <div style={{ color:'#c62828', fontSize:'12px', padding:'8px 12px', background:'#fff5f5', borderRadius:'6px' }}>{errors._api}</div>}
          <Field label="Material Name" required error={errors.name}>
            <input
              value={form.name}
              onChange={e => setF('name', e.target.value)}
              placeholder="e.g. Inner Color Mug 11oz"
              maxLength={120}
              style={errors.name ? S.inputErr : S.input}
            />
          </Field>

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px' }}>
            <Field label="Category" required>
              <SelectWithAdd
                value={form.category}
                onChange={v => setF('category', v)}
                options={categories}
                onAdd={v => setCategories(p => [...p, v])}
                label="category"
              />
            </Field>
            <Field label="Unit" required>
              <SelectWithAdd
                value={form.unit}
                onChange={v => setF('unit', v)}
                options={units}
                onAdd={v => setUnits(p => [...p, v])}
                label="unit"
              />
            </Field>
          </div>

          <Field label="Preferred Vendor" required error={errors.vendorId}>
            <div style={{ display:'flex', gap:'6px' }}>
              <CustomSelect value={form.vendorId} onChange={v => setF('vendorId', v)}
                options={catVendors.map(v => ({ value:v.id, label:v.name }))}
                placeholder="Select vendor"
                error={errors.vendorId}
                style={{ flex:1 }} />
              <button type="button" onClick={() => setShowQVendor(true)}
                style={{ ...S.btnGhost, padding:'0 11px', fontSize:'18px', lineHeight:1, flexShrink:0 }}
                title="Add new vendor">+</button>
            </div>
            {catVendors.length === 0 && vendors.length > 0 && (
              <div style={{ fontSize:'11px', color:'#b45309', marginTop:'4px' }}>No vendors supply {form.category}. Click + to add one.</div>
            )}
            {catVendors.length === 0 && vendors.length === 0 && (
              <div style={{ fontSize:'11px', color:'#b45309', marginTop:'4px' }}>No vendors yet. Click + to add one.</div>
            )}
            {catVendors.length > 0 && catVendors.length < vendors.length && (
              <div style={{ fontSize:'11px', color:'var(--gray)', marginTop:'3px' }}>Showing vendors that supply {form.category}.</div>
            )}
          </Field>

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px' }}>
            <Field label="Base Cost (₱)" required error={errors.baseCost}>
              <DecimalInput value={form.baseCost} onChange={v => setF('baseCost', v)} placeholder="0.00" style={errors.baseCost ? S.inputErr : undefined} />
            </Field>
            <Field label={`Min Stock (${form.unit})`} required error={errors.minStock}>
              <IntegerInput value={form.minStock} onChange={v => setF('minStock', v)} placeholder="0" style={errors.minStock ? S.inputErr : undefined} />
            </Field>
          </div>

          <Field label="Lead Time (days)">
            <IntegerInput value={form.leadTime} onChange={v => setF('leadTime', v)} placeholder="7" />
            <div style={{ fontSize:'11px', color:'var(--gray)', marginTop:'4px' }}>
              How long replenishment takes - used to compute the reorder point in the Forecast page.
            </div>
          </Field>

          {/* Named for its EFFECT, not for a stocking model. The old name said "you do not keep
              this on the shelf", which was untrue of the shop that needed it most: fifty boxes sit
              in the back room, they just should not be able to refuse a mug order. What the flag
              really decides is whether a material gets a vote on availability.

              Read by the reports, the To Buy list, the forecast and the availability calculation.
              Pre-order is deliberately NOT here: a material is shared across recipes, so promising
              one would promise every product that uses it. That decision belongs to the product. */}
          <div style={{ ...S.card, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <label style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', cursor: 'pointer' }}>
              <input type="checkbox" checked={!!form.isOnDemand}
                onChange={e => setF('isOnDemand', e.target.checked)}
                style={{ width: 16, height: 16, accentColor: 'var(--gold)', marginTop: 2, flexShrink: 0, cursor: 'pointer' }} />
              <span>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--white)' }}>Cost only - never blocks a sale</span>
                <span style={{ display: 'block', fontSize: 11.5, color: 'var(--gray)', marginTop: 2, lineHeight: 1.5 }}>
                  Still stocked, still costed, still on the To Buy list - it just never stops an
                  order. For packaging and consumables you can restock quickly: boxes, transfer
                  paper, tape.
                </span>
                <span style={{ display: 'block', fontSize: 11.5, color: 'var(--gray)', marginTop: 6, lineHeight: 1.5 }}>
                  Leave it OFF for the blank the product is actually made from. That is the one
                  that should be able to say you have run out.
                </span>
              </span>
            </label>

          </div>

          {!editId && (
            <div style={S.noteInfo}>
              SKU will be auto-generated based on category ({getSkuPrefix(form.category)}-XXXX).
            </div>
          )}
        </div>
      </Modal>

      {/* Delete confirm */}
      <ConfirmModal
        open={!!confirm}
        onClose={() => setConfirm(null)}
        onConfirm={doDelete}
        title={confirm?.inBom ? 'This material is still in use' : 'Archive material'}
        confirmLabel={confirm?.inBom ? 'Understood' : 'Archive'}
        confirmStyle={confirm?.inBom ? 'primary' : 'danger'}
        message={
          confirm?.inBom
            ? `"${confirm?.name}" is part of a recipe, so it cannot be archived yet. Take it out of that recipe first - a product built from a recipe with a missing material cannot report an honest stock figure. Open Master Data > BOM to edit it.`
            : `"${confirm?.name}" will be archived: hidden from every list and from To Buy.${confirm?.hasStock ? ` Its ${confirm?.qty} units stop counting as stock.` : ''} The record is kept, so nothing in past orders or history changes.`
        }
      />

      {/* Minimum-stock review. The server suggests lead time x daily usage + a buffer, from the
          stock ledger; nothing is written until the owner accepts a row or all of them. */}
      <Modal open={sugg !== null} onClose={() => setSugg(null)} title="What should each minimum be?" width={760}>
        {sugg === 'loading' ? (
          <div style={{ padding:'24px 0', color:'var(--gray)', fontSize:13 }}>Reading the stock ledger</div>
        ) : sugg && (() => {
          const rows   = sugg.rows || [];
          const change = rows.filter(r => r.suggested !== null && r.suggested !== r.current);
          const same   = rows.filter(r => r.suggested !== null && r.suggested === r.current).length;
          const quiet  = rows.filter(r => r.suggested === null);
          return (
            <div style={S.col}>
              <div style={{ fontSize:12.5, color:'var(--gray)', lineHeight:1.55 }}>
                A minimum is the stock that covers the wait for the next delivery, plus a cushion for a busy week:
                <b style={{ color:'var(--gray-light)' }}> daily usage x lead time + buffer</b>. Usage comes from the last {sugg.windowDays} days of
                the stock ledger (production, sales, quotes, scrap). A lead time marked * is not set on the material, so 7 days is assumed -
                set the real one on the material and the suggestion tightens.
                {same > 0 && ` ${same} already match.`}
              </div>

              {change.length === 0 ? (
                <div style={{ padding:'18px 0', fontSize:13, color:'var(--gray)' }}>Every minimum with usage behind it already matches its suggestion.</div>
              ) : (
                <>
                  <div style={{ ...S.rowBetween }}>
                    <span style={{ fontSize:12, color:'var(--gray)' }}>{change.length} would change</span>
                    <button onClick={() => acceptSuggestion(change)} disabled={!!applying} style={{ ...S.btnPrimary, opacity: applying ? .6 : 1 }}>
                      {applying === 'all' ? 'Applying' : `Accept all ${change.length}`}
                    </button>
                  </div>
                  <div style={{ border:'1px solid var(--border)', borderRadius:8, overflow:'hidden' }}>
                    {change.map((r, i) => {
                      const up = r.suggested > r.current;
                      return (
                        <div key={r.inventoryId} style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 12px', borderTop: i ? '1px solid var(--border)' : 'none', flexWrap:'wrap' }}>
                          <div style={{ flex:'1 1 200px', minWidth:0 }}>
                            <div style={{ fontSize:13, fontWeight:600 }}>{r.name}</div>
                            <div style={{ fontSize:11.5, color:'var(--gray)', marginTop:2 }}>
                              {r.avgDaily} {r.uom}/day over {r.windowDays} days · lead {r.leadTimeDays}d{r.leadAssumed ? '*' : ''} · on hand {r.stockQty}
                            </div>
                          </div>
                          <div style={{ textAlign:'right', minWidth:110 }}>
                            <span style={{ fontSize:12, color:'var(--gray)', textDecoration:'line-through' }}>{r.current}</span>
                            <span style={{ margin:'0 6px', color:'var(--gray)' }}>&rarr;</span>
                            <b style={{ fontSize:15, color: up ? '#b45309' : '#2e7d32' }}>{r.suggested}</b>
                            <span style={{ fontSize:11, color:'var(--gray)' }}> {r.uom}</span>
                          </div>
                          <button onClick={() => acceptSuggestion([r])} disabled={!!applying} style={{ ...S.btnSm, minHeight:36, opacity: applying ? .6 : 1 }}>
                            {applying === r.inventoryId ? 'Saving' : 'Accept'}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}

              {quiet.length > 0 && (
                <div style={{ fontSize:12, color:'var(--gray)', lineHeight:1.5 }}>
                  <b style={{ color:'var(--gray-light)' }}>No usage yet ({quiet.length}):</b> {quiet.map(r => r.name).join(', ')}. Their minimums stay as you set them - nothing to base a number on.
                </div>
              )}
            </div>
          );
        })()}
      </Modal>

      {/* Manage Lists modal */}
      <ManageListsModal
        open={showManage}
        onClose={() => setShowManage(false)}
        categories={categories} setCategories={setCategories}
        units={units} setUnits={setUnits}
        materials={materials}
      />

      {showArchived && (
        <Modal open onClose={() => setShowArchived(false)} title="Archived materials" width={760}>
          <div style={{ padding:'0 0 8px' }}>
            <div style={{ fontSize:'12px', color:'var(--gray)', marginTop:4, lineHeight:1.5 }}>
              Taken out of circulation: hidden from Master Data, from recipes and from To Buy.
              Nothing was deleted - the stock figure and the whole movement history are kept, and
              Restore puts the material back exactly as it was.
            </div>
          </div>
          <div style={{ padding:'0 0 6px' }}>
            {archived === null ? (
              <div style={{ padding:'24px 0', fontSize:'13px', color:'var(--gray)' }}>Loading...</div>
            ) : archived.length === 0 ? (
              <EmptyState message="Nothing is archived" sub="Every material you have created is still in circulation." />
            ) : (
              <table style={{ width:'100%', borderCollapse:'collapse' }}>
                <thead>
                  <tr>
                    {['Material','Category','Stock held','Archived', ''].map((h, i) => (
                      <th key={i} style={{ ...S.th, fontSize:'10px' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {archived.map(row => {
                    const id = String(row._id ?? row.id ?? '');
                    return (
                      <tr key={id} style={S.tr}>
                        <td style={{ ...S.td, fontWeight:500 }}>
                          {row.name}
                          <div style={{ fontFamily:'monospace', fontSize:'11px', color:'var(--gray)' }}>{row.sku}</div>
                        </td>
                        <td style={{ ...S.td, fontSize:'12px', color:'var(--gray)' }}>{row.category}</td>
                        <td style={{ ...S.td, fontSize:'12px' }}>
                          {row.heldStock ?? row.stockQty ?? 0} {row.uom}
                          <div style={{ fontSize:'10.5px', color:'var(--gray)' }}>not counted while archived</div>
                        </td>
                        <td style={{ ...S.td, fontSize:'12px', color:'var(--gray)' }}>
                          {row.deletedAt ? new Date(row.deletedAt).toLocaleDateString('en-PH', { month:'short', day:'numeric', year:'numeric' }) : '-'}
                        </td>
                        <td style={{ ...S.td, textAlign:'right' }}>
                          <button onClick={() => doRestore(row)} disabled={archBusy === id} style={S.btnSmGhost}>
                            {archBusy === id ? 'Restoring...' : 'Restore'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </Modal>
      )}

      {/* Quick-add vendor - conditional render so state resets with current category on each open */}
      {showQVendor && (
        <QuickAddVendorModal
          open={showQVendor}
          onClose={() => setShowQVendor(false)}
          categories={categories}
          onAdd={handleQuickAddVendor}
          initialCategory={form.category}
        />
      )}
    </div>
  );
}
