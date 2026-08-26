'use client';
import { useState, useMemo } from 'react';
import { S, ICONS, Field, IntegerInput, Modal, ConfirmModal, PaginationBar, SearchBar, StatusBadge, Note, EmptyState, SummaryCard, usePagination, formatCurrency, formatDate, uid, CustomSelect } from './shared';
import { adjustStock } from './api';

// "Qc Scrap" is what generic title-casing does to an acronym. These are the reasons the stock screens
// can actually receive; anything unmapped still degrades to words rather than a raw database key.
const OUT_REASON_LABEL = {
  qc_scrap:             'QC Scrap',
  qc_rework:            'QC Rework',
  production_spoilage:  'Spoilage',
  production:           'Production',
  sale_reserved:        'Sale',
  reservation_released: 'Reservation Released',
  production_reserved:  'Reserved',
  writeoff:             'Write-Off',
  adjustment:           'Adjustment',
};

function outReasonLabel(reason) {
  if (!reason) return 'Adjustment';
  return OUT_REASON_LABEL[reason] ?? String(reason)
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
    .replace(/\bQc\b/g, 'QC');
}

const REDUCE_REASONS = ['Damaged','Expired','Lost','Write-Off','Quality Check','Other'];

function StockOutModal({ open, onClose, material, currentStock, materialBatches, onConfirm }) {
  const [qty,        setQty]       = useState('');
  const [reason,     setReason]    = useState('Damaged');
  const [notes,      setNotes]     = useState('');
  const [useBatch,   setUseBatch]  = useState(false);
  const [batchId,    setBatchId]   = useState('');
  const [errors,     setErrors]    = useState({});

  const availBatches = useMemo(() =>
    (materialBatches || []).filter(b => b.remainingQty > 0).sort((a, b) => new Date(a.date) - new Date(b.date)),
  [materialBatches]);

  const selectedBatch = useBatch ? availBatches.find(b => b.id === batchId) : null;
  const maxQty = selectedBatch ? selectedBatch.remainingQty : currentStock;

  const reset = () => { setQty(''); setReason('Damaged'); setNotes(''); setUseBatch(false); setBatchId(''); setErrors({}); };

  const handleToggleBatch = (on) => {
    setUseBatch(on);
    if (on && availBatches.length > 0) setBatchId(availBatches[0].id);
    else setBatchId('');
    setQty('');
    setErrors({});
  };

  const validate = () => {
    const e = {};
    const n = Number(qty);
    if (!qty || n < 1) e.qty = 'Qty must be at least 1.';
    else if (n > maxQty) e.qty = `Cannot exceed ${useBatch ? 'batch' : 'current'} stock (${maxQty}).`;
    if (useBatch && !batchId) e.batch = 'Select a batch.';
    return e;
  };

  const submit = () => {
    const e = validate();
    if (Object.keys(e).length) { setErrors(e); return; }
    onConfirm({ qty: Number(qty), reason, notes: notes.trim(), batchId: useBatch ? batchId : null });
    reset();
  };

  const handleClose = () => { reset(); onClose(); };

  if (!open) return null;
  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={`Stock Out: ${material?.name}`}
      width={480}
      footer={
        <>
          <button onClick={handleClose} style={S.btnGhost}>Cancel</button>
          <button onClick={submit} style={S.btnDanger}>{ICONS.warn} Confirm Reduction</button>
        </>
      }
    >
      <div style={S.col}>
        <Note>This permanently records stock as having left inventory. Use for physically lost, damaged, expired, or discarded units.</Note>

        <div style={{ ...S.cardSm, background:'var(--dark2)', display:'flex', justifyContent:'space-between' }}>
          <span style={{ fontSize:'13px', color:'var(--gray)' }}>Current Stock</span>
          <span style={{ fontWeight:700, fontSize:'15px', color: currentStock <= (material?.minStock || 0) ? '#c62828' : 'var(--white)' }}>{currentStock} {material?.unit}</span>
        </div>

        {/* Batch picker toggle */}
        {availBatches.length > 1 && (
          <div style={{ display:'flex', alignItems:'center', gap:'10px' }}>
            <label style={{ display:'flex', alignItems:'center', gap:'8px', cursor:'pointer', userSelect:'none', fontSize:'13px', color:'var(--gray-light)' }}>
              <input type="checkbox" checked={useBatch} onChange={e => handleToggleBatch(e.target.checked)}
                style={{ accentColor:'var(--gold)', width:'15px', height:'15px' }} />
              Deduct from specific batch (instead of FIFO)
            </label>
          </div>
        )}

        {useBatch && (
          <div style={{ border:'1px solid var(--border)', borderRadius:'7px', overflow:'hidden' }}>
            <div style={{ padding:'8px 12px', background:'var(--dark2)', fontSize:'11px', fontWeight:700, color:'var(--gray)', textTransform:'uppercase', letterSpacing:'.4px', display:'grid', gridTemplateColumns:'1fr auto auto auto', gap:'8px' }}>
              <span>Invoice</span><span>Date</span><span style={{ textAlign:'right' }}>Remaining</span><span></span>
            </div>
            {availBatches.map(b => (
              <label key={b.id} style={{ display:'grid', gridTemplateColumns:'1fr auto auto auto', gap:'8px', alignItems:'center', padding:'9px 12px', cursor:'pointer', borderTop:'1px solid var(--border)', background: batchId === b.id ? 'var(--gold-subtle)' : 'var(--dark)', transition:'background .1s' }}>
                <span style={{ fontSize:'12px', fontFamily:'monospace', color:'var(--gray-light)' }}>{b.invoiceNo || '—'}</span>
                <span style={{ fontSize:'12px', color:'var(--gray)' }}>{b.date}</span>
                <span style={{ fontSize:'12px', fontWeight:600, textAlign:'right', color: b.remainingQty <= 10 ? '#b45309' : '#2e7d32' }}>{b.remainingQty} {material?.unit}</span>
                <input type="radio" name="batchPick" value={b.id} checked={batchId === b.id}
                  onChange={() => { setBatchId(b.id); setQty(''); setErrors({}); }}
                  style={{ accentColor:'var(--gold)' }} />
              </label>
            ))}
          </div>
        )}

        <Field label="Qty to Remove" required error={errors.qty}>
          <IntegerInput value={qty} onChange={v => { setQty(v); setErrors(p => ({ ...p, qty:'' })); }} max={maxQty} placeholder="0" style={errors.qty ? S.inputErr : undefined} />
        </Field>

        <Field label="Reason" required>
          <CustomSelect value={reason} onChange={setReason} options={REDUCE_REASONS} />
        </Field>

        <Field label="Notes">
          <textarea value={notes} onChange={e => setNotes(e.target.value)} maxLength={300} placeholder="Describe what happened…" style={S.textarea} />
        </Field>

        {qty && Number(qty) > 0 && Number(qty) <= maxQty && (
          <div style={{ background:'#fff5f5', border:'1px solid #fca5a5', borderRadius:'7px', padding:'10px 14px', fontSize:'13px' }}>
            {useBatch && selectedBatch && <div style={{ fontSize:'12px', color:'var(--gray)', marginBottom:'4px' }}>Batch {selectedBatch.invoiceNo || 'no invoice'} · {selectedBatch.remainingQty - Number(qty)} remaining after</div>}
            Remaining stock: <b>{currentStock - Number(qty)} {material?.unit}</b>
            {currentStock - Number(qty) <= (material?.minStock || 0) && (
              <span style={{ color:'#c62828', marginLeft:'8px' }}>(below min stock!)</span>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
const REASON_MAP = {
  'Damaged':       'damaged',
  'Expired':       'writeoff',
  'Lost':          'lost',
  'Write-Off':     'writeoff',
  'Quality Check': 'adjustment',
  'Other':         'adjustment',
};

export default function ActualStockTab({ materials, batches, setBatches, badOrders, stockOuts, setStockOuts, toast, token, onRefresh }) {
  const [search,      setSearch]     = useState('');
  const [catFilter,   setCat]        = useState('All');
  const [statusFilter,setStatus]     = useState('All');
  const [reduceTarget,setReduceTarget]= useState(null); // material

  const categories = useMemo(() => ['All', ...new Set(materials.map(m => m.category))], [materials]);

  // compute per-material actual stock
  const stockData = useMemo(() => {
    return materials.map(mat => {
      const actualQty    = mat.stockQty != null
        ? mat.stockQty
        : (batches || []).filter(b => b.matId === mat.id).reduce((s, b) => s + b.remainingQty, 0);
      const pendingBOQty = (badOrders || []).filter(b => b.matId === mat.id && b.status === 'pending').reduce((s, b) => s + b.qty, 0);
      const reductionQty = (stockOuts || []).filter(s => s.matId === mat.id).reduce((s, r) => s + r.qty, 0);
      const reservedQty  = Number(mat.reservedQty ?? 0);
      const goodsQty     = Math.max(0, actualQty - pendingBOQty);
      const availableQty = Math.max(0, goodsQty - reservedQty);
      const status       = availableQty === 0 ? 'out_of_stock' : availableQty <= mat.minStock ? 'low_stock' : 'in_stock';

      const sorted   = (batches || []).filter(b => b.matId === mat.id && b.remainingQty > 0).sort((a, b) => new Date(a.date) - new Date(b.date));
      const unitCost = sorted[0]?.unitCost ?? mat.baseCost;

      return { mat, actualQty, pendingBOQty, reductionQty, goodsQty, reservedQty, availableQty, status, unitCost, stockValue: actualQty * unitCost };
    });
  }, [materials, batches, badOrders, stockOuts]);

  const filtered = useMemo(() => {
    let list = stockData;
    if (catFilter !== 'All')     list = list.filter(d => d.mat.category === catFilter);
    if (statusFilter !== 'All')  list = list.filter(d => d.status === statusFilter.toLowerCase().replace(/ /g,'_'));
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(d => d.mat.name.toLowerCase().includes(q) || d.mat.sku?.toLowerCase().includes(q));
    }
    return list;
  }, [stockData, catFilter, statusFilter, search]);

  const { slice, page, perPage, total, setPage, setPerPage } = usePagination(filtered);

  const inStock  = stockData.filter(d => d.status === 'in_stock').length;
  const lowStock = stockData.filter(d => d.status === 'low_stock').length;
  const outStock = stockData.filter(d => d.status === 'out_of_stock').length;
  const totalVal = stockData.reduce((s, d) => s + d.stockValue, 0);

  const handleReduce = async ({ qty, reason, notes, batchId }) => {
    const mat = reduceTarget;
    try {
      await adjustStock(token, mat.id, {
        quantity:       qty,
        reason:         REASON_MAP[reason] ?? 'adjustment',
        adjustmentType: 'subtract',
        remarks:        notes || null,
        ...(batchId ? { batchId } : {}),
      });
      await onRefresh(['materials', 'stockOuts']);
      toast?.(`${qty} ${mat.unit} removed from ${mat.name}.`, 'warn');
    } catch (err) {
      toast?.(err.message ?? 'Stock out failed.', 'error');
    }
    setReduceTarget(null);
  };

  // stock out history search + filter
  const [histSearch,     setHistSearch]     = useState('');
  const [histTypeFilter, setHistTypeFilter] = useState('All');
  const sortedOuts = useMemo(() => [...(stockOuts || [])].sort((a,b) => new Date(b.date) - new Date(a.date)), [stockOuts]);
  const filteredOuts = useMemo(() => {
    let list = sortedOuts;
    if (histTypeFilter !== 'All') list = list.filter(s => s.type === histTypeFilter.toLowerCase());
    if (!histSearch.trim()) return list;
    const q = histSearch.toLowerCase();
    return list.filter(s =>
      s.matName?.toLowerCase().includes(q) ||
      s.reason?.toLowerCase().includes(q) ||
      s.ref?.toLowerCase().includes(q)
    );
  }, [sortedOuts, histSearch, histTypeFilter]);
  const { slice: hSlice, page: hPage, perPage: hPerPage, total: hTotal, setPage: setHPage, setPerPage: setHPerPage } = usePagination(filteredOuts);

  return (
    <div style={S.col}>
      {/* summary */}
      <div style={{ display:'flex', gap:'12px', flexWrap:'wrap' }}>
        <SummaryCard label="In Stock"     value={inStock}  color="#2e7d32" accent />
        <SummaryCard label="Low Stock"    value={lowStock} color="#b45309" />
        <SummaryCard label="Out of Stock" value={outStock} color="#c62828" />
        <SummaryCard label="Actual Value" value={formatCurrency(totalVal)} />
      </div>

      <Note type="info">
        <b>Actual Stock</b> = physical units in the warehouse (including pending Bad Orders). <b>Reserved</b> = held by open orders, released on cancellation or consumed at QC. <b>Available</b> = Actual − Pending BOs − Reserved, and this is the number the storefront sells against.
      </Note>

      {/* toolbar */}
      <div style={{ ...S.card, ...S.rowBetween }}>
        <div style={{ display:'flex', gap:'8px', flexWrap:'wrap' }}>
          <SearchBar value={search} onChange={setSearch} placeholder="Search name or SKU…" style={{ width:'220px' }} />
          <CustomSelect value={catFilter} onChange={setCat}
            options={categories.map(c => ({ value:c, label:c }))}
            style={{ width:'160px' }} />
          <CustomSelect value={statusFilter} onChange={setStatus}
            options={['All','In Stock','Low Stock','Out of Stock']}
            style={{ width:'140px' }} />
        </div>
      </div>

      {/* actual stock table */}
      <div style={{ ...S.card, padding:0, overflow:'hidden' }}>
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr>
                {[
                  {l:'SKU'},{l:'Material'},
                  {l:'Actual Stock',r:true},{l:'Pending BO',r:true},{l:'Stock Outs',r:true},
                  {l:'Reserved',r:true},{l:'Available',r:true},{l:'FIFO Cost',r:true},{l:'Value',c:true},
                  {l:'Status'},{l:''},
                ].map(h => (
                  <th key={h.l} style={{ ...S.th, textAlign: h.r ? 'right' : h.c ? 'center' : 'left' }}>{h.l}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {slice.length === 0 ? (
                <tr><td colSpan={11}><EmptyState message="No stock data" sub="Receive stock first." /></td></tr>
              ) : slice.map(d => (
                <tr key={d.mat.id} style={S.tr} onMouseEnter={e => e.currentTarget.style.background='var(--dark2)'} onMouseLeave={e => e.currentTarget.style.background=''}>
                  <td style={{ ...S.td, fontFamily:'monospace', fontSize:'12px', color:'var(--gray)' }}>{d.mat.sku}</td>
                  <td style={{ ...S.td, fontWeight:500 }}>{d.mat.name}</td>
                  <td style={{ ...S.td, textAlign:'right', fontWeight:700, fontSize:'15px', color: d.status === 'out_of_stock' ? '#c62828' : d.status === 'low_stock' ? '#b45309' : '#2e7d32' }}>
                    {d.actualQty} {d.mat.unit}
                  </td>
                  <td style={{ ...S.td, textAlign:'right', color: d.pendingBOQty > 0 ? '#e05252' : 'var(--gray)' }}>
                    {d.pendingBOQty > 0 ? `−${d.pendingBOQty}` : '0'} {d.mat.unit}
                  </td>
                  <td style={{ ...S.td, textAlign:'right', color: d.reductionQty > 0 ? '#b45309' : 'var(--gray)' }}>
                    {d.reductionQty > 0 ? `−${d.reductionQty}` : '0'} {d.mat.unit}
                  </td>
                  <td style={{ ...S.td, textAlign:'right', color: d.reservedQty > 0 ? '#b45309' : 'var(--gray)' }}
                    title={d.reservedQty > 0 ? 'Held by open orders. Released when the order is cancelled or the material is consumed at QC.' : undefined}>
                    {d.reservedQty > 0 ? `\u2212${d.reservedQty}` : '0'} {d.mat.unit}
                  </td>
                  <td style={{ ...S.td, textAlign:'right', fontWeight:700, color: d.availableQty === 0 ? '#c62828' : d.availableQty <= d.mat.minStock ? '#b45309' : '#2e7d32' }}
                    title="What the storefront can still sell.">
                    {d.availableQty} {d.mat.unit}
                  </td>
                  <td style={{ ...S.td, textAlign:'right' }}>{formatCurrency(d.unitCost)}</td>
                  <td style={{ ...S.td, textAlign:'center', fontWeight:600 }}>{formatCurrency(d.stockValue)}</td>
                  <td style={S.td}><StatusBadge status={d.status} /></td>
                  <td style={{ ...S.td, textAlign:'right' }}>
                    <button onClick={() => setReduceTarget(d.mat)} style={S.btnSmDanger} title="Record Stock Out">{ICONS.warn} Stock Out</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ padding:'12px 16px', borderTop:'1px solid var(--border)' }}>
          <PaginationBar total={total} page={page} perPage={perPage} onPage={setPage} onPerPage={setPerPage} />
        </div>
      </div>

      {/* Stock out history */}
      <div style={{ ...S.cardSm, fontWeight:700, fontSize:'14px', color:'var(--gray-light)' }}>Stock Out History</div>
      <div style={{ ...S.card, ...S.rowBetween }}>
        <div style={{ display:'flex', gap:'8px', flexWrap:'wrap' }}>
          <SearchBar value={histSearch} onChange={setHistSearch} placeholder="Search material, reason, or ref…" style={{ width:'260px' }} />
          <CustomSelect value={histTypeFilter} onChange={setHistTypeFilter}
            options={['All','Sale','Adjustment','Production']}
            style={{ width:'140px' }} />
        </div>
      </div>
      <div style={{ ...S.card, padding:0, overflow:'hidden' }}>
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr>
                {[
                  {l:'Date'},{l:'Reference'},{l:'Type'},{l:'Material'},
                  {l:'Qty Out',r:true},{l:'Reason'},
                  {l:'Total Cost',r:true},
                  {l:'By'},{l:'Notes'},
                ].map(h => (
                  <th key={h.l} style={{ ...S.th, textAlign: h.r ? 'right' : 'left' }}>{h.l}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {hSlice.length === 0 ? (
                <tr><td colSpan={9}><EmptyState message="No stock outs recorded" /></td></tr>
              ) : hSlice.map(s => {
                const mat = materials.find(m => m.id === s.matId);
                const isProduction = s.type === 'production';
                const isSale = s.type === 'sale';
                const isLoss = ['qc_scrap', 'production_spoilage', 'damage', 'writeoff', 'scrap', 'lost'].includes(s.reason);
                return (
                  <tr key={s.id} style={S.tr} onMouseEnter={e => e.currentTarget.style.background='var(--dark2)'} onMouseLeave={e => e.currentTarget.style.background=''}>
                    <td style={{ ...S.td, whiteSpace:'nowrap' }}>{formatDate(s.date)}</td>
                    <td style={{ ...S.td, fontFamily:'monospace', fontSize:'12px', color:'var(--gray)' }}>{s.ref || '—'}</td>
                    <td style={S.td}>
                      <span style={{ background: isProduction ? '#f0f4ff' : isSale ? '#f0fdf4' : isLoss ? '#fee2e2' : 'var(--dark2)', color: isProduction ? '#1e40af' : isSale ? '#166534' : isLoss ? '#991b1b' : 'var(--gray-light)', borderRadius:'5px', padding:'2px 8px', fontSize:'11px', fontWeight:600 }}>
                        {isProduction ? 'Production' : isSale ? 'Sale' : isLoss ? 'Loss' : 'Adjustment'}
                      </span>
                    </td>
                    <td style={{ ...S.td, fontWeight:500 }}>{s.matName}</td>
                    <td style={{ ...S.td, textAlign:'right', color:'#c62828', fontWeight:600 }}>−{Math.abs(Number(s.qty) || 0)} {mat?.unit}</td>
                    <td style={S.td}><StatusBadge status={s.reason} label={outReasonLabel(s.reason)} /></td>
                    <td style={{ ...S.td, textAlign:'right', fontWeight:600, color: isProduction ? 'var(--gray-light)' : '#c62828' }}>{formatCurrency(s.totalCost)}</td>
                    <td style={{ ...S.td, fontSize:'12px', color:'var(--gray-light)' }}>{s.performedBy || <span style={{ color:'var(--gray)' }}>—</span>}</td>
                    <td style={{ ...S.td, fontSize:'12px', color:'var(--gray)', maxWidth:'200px' }}>{s.notes}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div style={{ padding:'12px 16px', borderTop:'1px solid var(--border)' }}>
          <PaginationBar total={hTotal} page={hPage} perPage={hPerPage} onPage={setHPage} onPerPage={setHPerPage} />
        </div>
      </div>

      {/* Stock out modal */}
      <StockOutModal
        open={!!reduceTarget}
        onClose={() => setReduceTarget(null)}
        material={reduceTarget}
        currentStock={stockData.find(d => d.mat.id === reduceTarget?.id)?.actualQty || 0}
        materialBatches={(batches || []).filter(b => b.matId === reduceTarget?.id)}
        onConfirm={handleReduce}
      />
    </div>
  );
}
