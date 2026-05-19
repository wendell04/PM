'use client';
import { useState, useMemo } from 'react';
import { S, ICONS, Field, IntegerInput, DecimalInput, Modal, ConfirmModal, PaginationBar, SearchBar, StatusBadge, Note, EmptyState, SummaryCard, usePagination, formatCurrency, formatDate, uid, CustomSelect } from './shared';

function ReturnModal({ open, onClose, materials, vendors, badOrders, onSave }) {
  const [matId,    setMatId]   = useState('');
  const [vendorId, setVendorId]= useState('');
  const [date,     setDate]    = useState(new Date().toISOString().split('T')[0]);
  const [qty,      setQty]     = useState('');
  const [unitCost, setUnitCost]= useState('');
  const [reason,   setReason]  = useState('');
  const [resType,  setResType] = useState('replacement');
  const [notes,    setNotes]   = useState('');
  const [linkedBO, setLinkedBO]= useState('');
  const [errors,   setErrors]  = useState({});

  const mat = materials.find(m => m.id === matId);

  // BOs linked to selected material (pending ones)
  const relatedBOs = useMemo(() => (badOrders || []).filter(b => b.matId === matId && b.status === 'pending'), [badOrders, matId]);

  const reset = () => { setMatId(''); setVendorId(''); setDate(new Date().toISOString().split('T')[0]); setQty(''); setUnitCost(''); setReason(''); setResType('replacement'); setNotes(''); setLinkedBO(''); setErrors({}); };

  const validate = () => {
    const e = {};
    if (!matId)                              e.matId     = 'Select a material.';
    if (!vendorId)                           e.vendorId  = 'Select a vendor.';
    if (!date)                               e.date      = 'Date is required.';
    if (!qty || Number(qty) < 1)             e.qty       = 'Qty ≥ 1 required.';
    if (!unitCost || Number(unitCost) <= 0)  e.unitCost  = 'Unit cost > 0 required.';
    if (!reason.trim())                      e.reason    = 'Reason is required.';
    return e;
  };

  const submit = () => {
    const e = validate();
    if (Object.keys(e).length) { setErrors(e); return; }
    onSave({
      matId, matName: mat?.name || '',
      vendorId, vendorName: vendors.find(v => v.id === vendorId)?.name || '',
      date, qty: Number(qty), unitCost: Number(unitCost),
      totalValue: Number(qty) * Number(unitCost),
      reason: reason.trim(), resolutionType: resType,
      replacementQty: 0, notes: notes.trim(),
      status: 'pending', linkedBadOrderId: linkedBO || null,
    });
    reset();
  };

  const handleClose = () => { reset(); onClose(); };

  if (!open) return null;
  return (
    <Modal open={open} onClose={handleClose} title="Log Return to Vendor" width={520}
      footer={
        <>
          <button onClick={handleClose} style={S.btnGhost}>Cancel</button>
          <button onClick={submit} style={S.btnPrimary}>{ICONS.check} Log Return</button>
        </>
      }
    >
      <div style={S.col}>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px' }}>
          <Field label="Material" required error={errors.matId} style={{ gridColumn:'1 / -1' }}>
            <CustomSelect value={matId}
              onChange={v => { setMatId(v); setVendorId(''); setLinkedBO(''); setErrors(p=>({...p,matId:''})); }}
              options={materials.map(m => ({ value:m.id, label:`${m.name} (${m.unit})` }))}
              placeholder="Select material"
              error={errors.matId} />
          </Field>

          <Field label="Vendor" required error={errors.vendorId}>
            <CustomSelect value={vendorId}
              onChange={v => { setVendorId(v); setErrors(p=>({...p,vendorId:''})); }}
              options={vendors.map(v => ({ value:v.id, label:v.name }))}
              placeholder="Select vendor"
              error={errors.vendorId} />
          </Field>

          <Field label="Return Date" required error={errors.date}>
            <input type="date" value={date} onChange={e => { setDate(e.target.value); setErrors(p=>({...p,date:''})); }}
              max={new Date().toISOString().split('T')[0]} style={errors.date ? S.inputErr : S.input} />
          </Field>

          <Field label={`Qty Returned ${mat ? `(${mat.unit})` : ''}`} required error={errors.qty}>
            <IntegerInput value={qty} onChange={v => { setQty(v); setErrors(p=>({...p,qty:''})); }} style={errors.qty ? S.inputErr : undefined} />
          </Field>

          <Field label="Unit Cost (₱)" required error={errors.unitCost}>
            <DecimalInput value={unitCost} onChange={v => { setUnitCost(v); setErrors(p=>({...p,unitCost:''})); }} style={errors.unitCost ? S.inputErr : undefined} />
          </Field>
        </div>

        <Field label="Reason for Return" required error={errors.reason}>
          <input value={reason} onChange={e => { setReason(e.target.value); setErrors(p=>({...p,reason:''})); }}
            maxLength={200} placeholder="e.g. Defective items, wrong size, etc." style={errors.reason ? S.inputErr : S.input} />
        </Field>

        <Field label="Resolution Expected">
          <div style={{ display:'flex', gap:'8px' }}>
            {[{val:'replacement', label:'Replacement'},{val:'credit', label:'Credit / Refund'},{val:'pending', label:'TBD'}].map(o => (
              <label key={o.val} style={{ flex:1, display:'flex', alignItems:'center', gap:'6px', padding:'8px 10px', border:`1px solid ${resType===o.val?'#c9973f':'#e1e3e5'}`, borderRadius:'7px', cursor:'pointer', background: resType===o.val?'#fffbe8':'#fff', fontSize:'12px', fontWeight: resType===o.val ? 600 : 400, transition:'all .12s' }}>
                <input type="radio" name="resType" value={o.val} checked={resType===o.val} onChange={() => setResType(o.val)} style={{ accentColor:'#c9973f' }} />
                {o.label}
              </label>
            ))}
          </div>
        </Field>

        {relatedBOs.length > 0 && (
          <Field label="Link to Bad Order (optional)">
            <CustomSelect value={linkedBO} onChange={setLinkedBO}
              options={[{ value:'', label:'None' }, ...relatedBOs.map(b => ({ value:b.id, label:`BO ${b.date} · ${b.type} · qty ${b.qty}` }))]} />
          </Field>
        )}

        <Field label="Notes">
          <textarea value={notes} onChange={e => setNotes(e.target.value)} maxLength={300} placeholder="Additional notes…" style={S.textarea} />
        </Field>

        {qty && unitCost && Number(qty) > 0 && Number(unitCost) > 0 && (
          <div style={{ ...S.cardSm, background:'#f8f9fa', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <span style={{ fontSize:'13px', color:'#6b7280' }}>Return Value</span>
            <span style={{ fontWeight:700, fontSize:'16px', color:'#c9973f' }}>{formatCurrency(Number(qty) * Number(unitCost))}</span>
          </div>
        )}
      </div>
    </Modal>
  );
}

function ReceiveReplacementModal({ open, onClose, returnRecord, material, onConfirm }) {
  const [qty,       setQty]       = useState('');
  const [invoiceNo, setInvoiceNo] = useState('');
  const [notes,     setNotes]     = useState('');
  const [errors,    setErrors]    = useState({});

  const reset = () => { setQty(''); setInvoiceNo(''); setNotes(''); setErrors({}); };
  const handleClose = () => { reset(); onClose(); };

  const submit = () => {
    const e = {};
    if (!qty || Number(qty) < 1) e.qty = 'Qty ≥ 1 required.';
    if (Object.keys(e).length) { setErrors(e); return; }
    onConfirm({ qty: Number(qty), invoiceNo: invoiceNo.trim(), notes: notes.trim() });
    reset();
  };

  if (!open) return null;
  return (
    <Modal open={open} onClose={handleClose} title="Receive Replacement" width={440}
      footer={
        <>
          <button onClick={handleClose} style={S.btnGhost}>Cancel</button>
          <button onClick={submit} style={{ ...S.btnPrimary, background:'#2e7d32' }}>{ICONS.check} Add to Stock</button>
        </>
      }
    >
      <div style={S.col}>
        <Note type="info">
          Receiving a replacement will create a new stock batch for <b>{material?.name}</b> at the original return unit cost ({formatCurrency(returnRecord?.unitCost)}).
        </Note>

        <Field label={`Replacement Qty (${material?.unit})`} required error={errors.qty}>
          <IntegerInput value={qty} onChange={v => { setQty(v); setErrors(p=>({...p,qty:''})); }} />
        </Field>

        <Field label="Delivery Invoice / OR No.">
          <input value={invoiceNo} onChange={e => setInvoiceNo(e.target.value)} maxLength={50}
            placeholder="e.g. OR-2025-020 (optional)" style={S.input} />
        </Field>

        <Field label="Notes">
          <textarea value={notes} onChange={e => setNotes(e.target.value)} maxLength={200} placeholder="e.g. Replacement received via courier" style={S.textarea} />
        </Field>
      </div>
    </Modal>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function ReturnsTab({ returns, setReturns, materials, vendors, batches, setBatches, badOrders, toast }) {
  const [search,       setSearch]       = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [showAdd,      setShowAdd]      = useState(false);
  const [receiveTarget,setReceiveTarget]= useState(null);

  const filtered = useMemo(() => {
    let list = [...(returns || [])].sort((a,b) => new Date(b.date) - new Date(a.date));
    if (statusFilter !== 'All') list = list.filter(r => r.status === statusFilter.toLowerCase());
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(r => r.matName?.toLowerCase().includes(q) || r.vendorName?.toLowerCase().includes(q));
    }
    return list;
  }, [returns, statusFilter, search]);

  const { slice, page, perPage, total, setPage, setPerPage } = usePagination(filtered);

  const pending   = (returns || []).filter(r => r.status === 'pending').length;
  const completed = (returns || []).filter(r => r.status === 'completed').length;
  const totalVal  = (returns || []).reduce((s, r) => s + r.totalValue, 0);
  const pendingVal= (returns || []).filter(r => r.status === 'pending').reduce((s, r) => s + r.totalValue, 0);

  const handleSave = (data) => {
    setReturns(prev => [...prev, { id: uid('ret'), ...data }]);
    toast?.('Return logged successfully.', 'success');
    setShowAdd(false);
  };

  const handleReceiveReplacement = ({ qty, invoiceNo, notes }) => {
    const ret = receiveTarget;
    const vendor = vendors.find(v => v.id === ret.vendorId);

    const newBatch = {
      id:          uid('bt'),
      matId:       ret.matId,
      invoiceNo:   invoiceNo || `REPL-${ret.id.slice(-6).toUpperCase()}`,
      date:        new Date().toISOString().split('T')[0],
      vendorId:    ret.vendorId,
      vendorName:  vendor?.name || ret.vendorName,
      qtyReceived: qty,
      unitCost:    ret.unitCost,
      remainingQty:qty,
      notes:       notes || `Replacement for return`,
    };

    setBatches(prev => [...prev, newBatch]);
    setReturns(prev => prev.map(r => r.id === ret.id
      ? { ...r, replacementQty: (r.replacementQty || 0) + qty, status:'completed', resolvedDate: new Date().toISOString().split('T')[0] }
      : r
    ));
    toast?.(`${qty} ${materials.find(m => m.id === ret.matId)?.unit || 'units'} added to stock as replacement.`, 'success');
    setReceiveTarget(null);
  };

  const markCredit = (ret) => {
    setReturns(prev => prev.map(r => r.id === ret.id
      ? { ...r, status:'completed', resolvedDate: new Date().toISOString().split('T')[0] }
      : r
    ));
    toast?.('Credit return marked as completed.', 'success');
  };

  return (
    <div style={S.col}>
      {/* summary */}
      <div style={{ display:'flex', gap:'12px', flexWrap:'wrap' }}>
        <SummaryCard label="Pending"       value={pending}                 color="#e65100" accent />
        <SummaryCard label="Completed"     value={completed}               color="#2e7d32" />
        <SummaryCard label="Pending Value" value={formatCurrency(pendingVal)} color="#c62828" />
        <SummaryCard label="Total Value"   value={formatCurrency(totalVal)} />
      </div>

      {/* toolbar */}
      <div style={{ ...S.card, ...S.rowBetween }}>
        <div style={{ display:'flex', gap:'8px', flexWrap:'wrap' }}>
          <SearchBar value={search} onChange={setSearch} placeholder="Search material or vendor…" style={{ width:'240px' }} />
          <CustomSelect value={statusFilter} onChange={setStatusFilter}
            options={['All','Pending','Completed']}
            style={{ width:'140px' }} />
        </div>
        <button onClick={() => setShowAdd(true)} style={S.btnPrimary}>{ICONS.plus} Log Return</button>
      </div>

      {/* table */}
      <div style={{ ...S.card, padding:0, overflow:'hidden' }}>
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr>
                {[
                  {l:'Date'},{l:'Material'},{l:'Vendor'},
                  {l:'Qty',r:true},{l:'Unit Cost',r:true},{l:'Total Value',r:true},
                  {l:'Reason'},{l:'Resolution'},{l:'Status'},{l:'Actions',r:true},
                ].map(h => (
                  <th key={h.l} style={{ ...S.th, textAlign: h.r ? 'right' : undefined }}>{h.l}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {slice.length === 0 ? (
                <tr><td colSpan={10}><EmptyState message="No returns logged" sub="Log a return to vendor to track it here." /></td></tr>
              ) : slice.map(r => {
                const mat = materials.find(m => m.id === r.matId);
                return (
                  <tr key={r.id} style={S.tr} onMouseEnter={e => e.currentTarget.style.background='#fafbfc'} onMouseLeave={e => e.currentTarget.style.background=''}>
                    <td style={{ ...S.td, whiteSpace:'nowrap' }}>{formatDate(r.date)}</td>
                    <td style={{ ...S.td, fontWeight:500 }}>{r.matName}</td>
                    <td style={{ ...S.td, fontSize:'12px', color:'#6b7280' }}>{r.vendorName}</td>
                    <td style={{ ...S.td, textAlign:'right', fontWeight:600 }}>{r.qty} {mat?.unit}</td>
                    <td style={{ ...S.td, textAlign:'right' }}>{formatCurrency(r.unitCost)}</td>
                    <td style={{ ...S.td, textAlign:'right', fontWeight:600, color:'#c62828' }}>{formatCurrency(r.totalValue)}</td>
                    <td style={{ ...S.td, fontSize:'12px', color:'#6b7280', maxWidth:'160px' }}>{r.reason}</td>
                    <td style={S.td}><StatusBadge status={r.resolutionType} /></td>
                    <td style={S.td}><StatusBadge status={r.status} /></td>
                    <td style={{ ...S.td, textAlign:'right' }}>
                      {r.status === 'pending' && r.resolutionType === 'replacement' && (
                        <button onClick={() => setReceiveTarget(r)} style={S.btnSm}>{ICONS.truck} Receive</button>
                      )}
                      {r.status === 'pending' && r.resolutionType === 'credit' && (
                        <button onClick={() => markCredit(r)} style={S.btnSmGhost}>{ICONS.check} Mark Credit Done</button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div style={{ padding:'12px 16px', borderTop:'1px solid #f0f1f2' }}>
          <PaginationBar total={total} page={page} perPage={perPage} onPage={setPage} onPerPage={setPerPage} />
        </div>
      </div>

      <ReturnModal
        open={showAdd}
        onClose={() => setShowAdd(false)}
        materials={materials}
        vendors={vendors}
        badOrders={badOrders}
        onSave={handleSave}
      />

      <ReceiveReplacementModal
        open={!!receiveTarget}
        onClose={() => setReceiveTarget(null)}
        returnRecord={receiveTarget}
        material={materials.find(m => m.id === receiveTarget?.matId)}
        onConfirm={handleReceiveReplacement}
      />
    </div>
  );
}
