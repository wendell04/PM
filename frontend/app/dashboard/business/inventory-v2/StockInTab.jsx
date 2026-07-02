'use client';
import { useState, useMemo } from 'react';
import { S, ICONS, Field, IntegerInput, DecimalInput, Modal, PaginationBar, SearchBar, StatusBadge, Note, EmptyState, SummaryCard, usePagination, formatCurrency, formatDate, uid, CustomSelect } from './shared';
import { adjustStock, createReturn } from './api';

const BO_TYPES = ['damaged','defective','shortage','wrong_item','expired'];

function StepIndicator({ step }) {
  const steps = ['Select Materials','Enter Details','Confirm'];
  return (
    <div style={{ display:'flex', alignItems:'center', gap:'0', marginBottom:'18px' }}>
      {steps.map((label, i) => {
        const idx = i + 1;
        const done   = step > idx;
        const active = step === idx;
        return (
          <div key={idx} style={{ display:'flex', alignItems:'center', flex: i < steps.length - 1 ? 1 : undefined }}>
            <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:'4px' }}>
              <div style={{
                width:'28px', height:'28px', borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center',
                background: done ? '#2e7d32' : active ? 'var(--gold)' : 'var(--border)',
                color:      done || active ? 'var(--dark)' : 'var(--gray)',
                fontWeight: 700, fontSize:'12px',
              }}>
                {done ? ICONS.check : idx}
              </div>
              <span style={{ fontSize:'11px', fontWeight: active ? 600 : 400, color: active ? 'var(--gold)' : done ? '#2e7d32' : 'var(--gray)', whiteSpace:'nowrap' }}>{label}</span>
            </div>
            {i < steps.length - 1 && (
              <div style={{ flex:1, height:'2px', background: done ? '#2e7d32' : 'var(--border)', margin:'0 8px', marginBottom:'16px' }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function CategoryCard({ group, expanded, onToggle, selectedIds, onToggleMat }) {
  const selectedCount = group.materials.filter(m => selectedIds.includes(m.id)).length;
  return (
    <div style={{ border:'1px solid var(--border)', borderRadius:'8px', overflow:'hidden', marginBottom:'6px' }}>
      <button type="button" onClick={onToggle} style={{
        width:'100%', display:'flex', alignItems:'center', justifyContent:'space-between',
        padding:'10px 14px', background: expanded ? 'var(--gold-subtle)' : 'var(--dark2)',
        border:'none', borderBottom: expanded ? '1px solid var(--border)' : 'none',
        cursor:'pointer', textAlign:'left',
      }}>
        <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
          <span style={{ display:'inline-flex', color:'var(--gray)', transition:'transform .15s', transform: expanded ? 'rotate(90deg)' : 'none' }}>{ICONS.chevR}</span>
          <div>
            <div style={{ fontWeight:600, fontSize:'13px', color:'var(--white)' }}>{group.category}</div>
            <div style={{ fontSize:'11px', color:'var(--gray)' }}>{group.materials.length} material{group.materials.length !== 1 ? 's' : ''}</div>
          </div>
        </div>
        {selectedCount > 0 && (
          <span style={{ background:'var(--gold)', color:'var(--dark)', borderRadius:'12px', padding:'2px 9px', fontSize:'11px', fontWeight:600 }}>{selectedCount} selected</span>
        )}
      </button>
      {expanded && group.materials.map((m, idx) => {
        const isSel = selectedIds.includes(m.id);
        return (
          <button key={m.id} type="button" onClick={() => onToggleMat(m.id)}
            style={{
              width:'100%', display:'flex', alignItems:'center', gap:'12px',
              padding:'9px 14px 9px 28px',
              background: isSel ? 'var(--gold-subtle)' : idx % 2 === 0 ? 'var(--dark)' : 'var(--dark2)',
              border:'none', borderBottom:'1px solid var(--border)', cursor:'pointer', textAlign:'left',
            }}>
            <div style={{ width:'18px', height:'18px', borderRadius:'50%', flexShrink:0,
              background: isSel ? 'var(--gold)' : 'var(--border)',
              display:'flex', alignItems:'center', justifyContent:'center' }}>
              {isSel && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--dark)" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>}
            </div>
            <div style={{ flex:1 }}>
              <div style={{ fontWeight:500, fontSize:'13px', color: isSel ? 'var(--gold)' : 'var(--white)' }}>{m.name}</div>
              <div style={{ fontSize:'11px', color:'var(--gray)' }}>{m.sku} · {m.unit}</div>
            </div>
            <span style={{ fontSize:'11px', color:'var(--gray)', flexShrink:0 }}>Base: {formatCurrency(m.baseCost)}</span>
          </button>
        );
      })}
    </div>
  );
}

export default function StockInTab({ materials, vendors, batches, setBatches, badOrders, setBadOrders, toast, token, onRefresh }) {
  const [open,  setOpen] = useState(false);
  const [step,  setStep] = useState(1);

  // Step 1
  const [selectedIds, setSelectedIds] = useState([]);
  const [search1,     setSearch1]     = useState('');
  const [expanded,    setExpanded]    = useState({});

  // Step 2
  const [invoiceNo,      setInvoiceNo]      = useState('');
  const [date,           setDate]           = useState(new Date().toISOString().split('T')[0]);
  const [vendorId,       setVendorId]       = useState('');
  const [sharedNotes,    setSharedNotes]    = useState('');
  const [showAllVendors, setShowAllVendors] = useState(false);
  const [rows,           setRows]           = useState([]);
  const [errors2,        setErr2]           = useState({});

  const [histSearch, setHistSearch] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const openModal = () => {
    setStep(1); setSelectedIds([]); setSearch1(''); setExpanded({});
    setInvoiceNo(''); setDate(new Date().toISOString().split('T')[0]);
    setVendorId(''); setSharedNotes(''); setShowAllVendors(false); setRows([]); setErr2({});
    setOpen(true);
  };
  const closeModal = () => setOpen(false);

  // Group materials by category for Step 1
  const groupedByCategory = useMemo(() => {
    const groups = {};
    materials.forEach(m => {
      const cat = m.category || 'Uncategorized';
      if (!groups[cat]) groups[cat] = { category: cat, materials: [] };
      groups[cat].materials.push(m);
    });
    return Object.values(groups);
  }, [materials]);

  const step1Groups = useMemo(() => {
    if (!search1.trim()) return groupedByCategory;
    const q = search1.toLowerCase();
    return groupedByCategory
      .map(g => ({ ...g, materials: g.materials.filter(m => m.name.toLowerCase().includes(q) || m.sku?.toLowerCase().includes(q)) }))
      .filter(g => g.materials.length > 0);
  }, [groupedByCategory, search1]);

  const toggleExpanded = (cat) => setExpanded(p => ({ ...p, [cat]: !p[cat] }));
  const toggleSelect   = (id)  => setSelectedIds(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);

  // Vendor filter: only vendors that supply the categories of selected materials
  const selectedCategories = useMemo(() => {
    const cats = new Set(selectedIds.map(id => materials.find(m => m.id === id)?.category).filter(Boolean));
    return [...cats];
  }, [selectedIds, materials]);

  const relevantVendors = useMemo(() => {
    if (!selectedCategories.length) return vendors;
    return vendors.filter(v => (v.itemsSupplied || []).some(cat => selectedCategories.includes(cat)));
  }, [selectedCategories, vendors]);

  const vendorList = showAllVendors ? vendors : relevantVendors;

  const goStep2 = () => {
    if (!selectedIds.length) return;
    setRows(selectedIds.map(id => ({ matId:id, qty:'', unitCost:'', bos:[] })));

    // Auto-detect preferred vendor: if all selected materials share exactly one vendor
    const selectedMats = materials.filter(m => selectedIds.includes(m.id));
    const vendorCounts = {};
    selectedMats.forEach(m => { if (m.vendorId) vendorCounts[m.vendorId] = (vendorCounts[m.vendorId] || 0) + 1; });
    const entries = Object.entries(vendorCounts);
    setVendorId(entries.length === 1 && entries[0][1] === selectedMats.length ? entries[0][0] : '');

    setErr2({});
    setStep(2);
  };

  const validateStep2 = () => {
    const e = {};
    if (!invoiceNo.trim()) e.invoiceNo = 'Invoice / OR number is required.';
    if (!date)             e.date      = 'Date is required.';
    if (!vendorId)         e.vendorId  = 'Select a vendor.';
    rows.forEach((r, i) => {
      if (!r.qty || Number(r.qty) < 1)                     e[`qty_${i}`]      = 'Qty ≥ 1 required.';
      if (r.unitCost === '' || Number(r.unitCost) <= 0)    e[`cost_${i}`]     = 'Unit cost > 0 required.';
      const totalBO = r.bos.reduce((s, b) => s + (Number(b.qty) || 0), 0);
      if (totalBO > Number(r.qty))                         e[`boTotal_${i}`]  = 'Total BO qty cannot exceed received qty.';
      r.bos.forEach((b, j) => {
        if (!b.qty || Number(b.qty) < 1)                   e[`boQty_${i}_${j}`] = 'BO qty ≥ 1 required.';
      });
    });
    return e;
  };

  const goStep3 = () => {
    const e = validateStep2();
    if (Object.keys(e).length) { setErr2(e); return; }
    setErr2({});
    setStep(3);
  };

  const vendor = vendors.find(v => v.id === vendorId);

  const confirmReceive = async () => {
    setSubmitting(true);
    try {
      const batchResults = await Promise.all(rows.map(r =>
        adjustStock(token, r.matId, {
          quantity:       Number(r.qty),
          reason:         'restock',
          adjustmentType: 'add',
          supplierId:     vendorId || null,
          supplierName:   vendor?.name || null,
          unitCost:       Number(r.unitCost),
          invoiceNumber:  invoiceNo.trim(),
          deliveryDate:   date,
          remarks:        sharedNotes.trim() || null,
        })
      ));

      const boPromises = [];
      rows.forEach((r, i) => {
        const mat      = materials.find(m => m.id === r.matId);
        const newBatches = batchResults[i]?.batches ?? [];
        const lastBatch  = newBatches[newBatches.length - 1];
        r.bos.forEach(bo => {
          if (Number(bo.qty) > 0) {
            boPromises.push(createReturn(token, {
              materialId:   r.matId,
              materialName: mat?.name ?? '',
              batchId:      lastBatch?.batchId ?? null,
              vendorId:     vendorId || null,
              vendorName:   vendor?.name || null,
              invoiceNo:    invoiceNo.trim(),
              damageType:   bo.type,
              quantity:     Number(bo.qty),
              notes:        bo.notes.trim(),
            }));
          }
        });
      });

      if (boPromises.length) await Promise.all(boPromises);

      await onRefresh(['materials', 'badOrders']);
      toast?.('Stock received successfully.', 'success');
      closeModal();
    } catch (err) {
      toast?.(err.message ?? 'Failed to receive stock.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const setRow = (i, k, v) => {
    setRows(p => { const r=[...p]; r[i]={...r[i],[k]:v}; return r; });
    setErr2(p => ({ ...p, [`${k}_${i}`]:'' }));
  };

  const addBO    = (i)       => setRows(p => { const r=[...p]; r[i]={...r[i], bos:[...r[i].bos,{qty:'',type:'damaged',notes:''}]}; return r; });
  const removeBO = (i, j)    => setRows(p => { const r=[...p]; r[i]={...r[i], bos:r[i].bos.filter((_,idx)=>idx!==j)}; return r; });
  const setBO    = (i, j, k, v) => {
    setRows(p => { const r=[...p]; const bos=[...r[i].bos]; bos[j]={...bos[j],[k]:v}; r[i]={...r[i],bos}; return r; });
    if (k==='qty') setErr2(p => ({ ...p, [`boQty_${i}_${j}`]:'' }));
  };

  const sortedBatches = useMemo(() => [...batches].sort((a,b) => {
    const dateDiff = new Date(b.date) - new Date(a.date);
    if (dateDiff !== 0) return dateDiff;
    return b.id > a.id ? -1 : b.id < a.id ? 1 : 0;
  }), [batches]);
  const histFiltered  = useMemo(() => {
    if (!histSearch.trim()) return sortedBatches;
    const q = histSearch.toLowerCase();
    return sortedBatches.filter(b => {
      const mat = materials.find(m => m.id === b.matId);
      return b.invoiceNo?.toLowerCase().includes(q) || mat?.name?.toLowerCase().includes(q) || b.vendorName?.toLowerCase().includes(q);
    });
  }, [sortedBatches, histSearch, materials]);

  const { slice: hSlice, page: hPage, perPage: hPerPage, total: hTotal, setPage: setHPage, setPerPage: setHPerPage } = usePagination(histFiltered);

  const totalReceived = batches.reduce((s, b) => s + b.qtyReceived, 0);
  const totalValue    = batches.reduce((s, b) => s + b.qtyReceived * b.unitCost, 0);

  return (
    <div style={S.col}>
      <div style={{ display:'flex', gap:'12px', flexWrap:'wrap' }}>
        <SummaryCard label="Total Batches"  value={batches.length}                accent />
        <SummaryCard label="Total Qty In"   value={totalReceived.toLocaleString()} />
        <SummaryCard label="Total Value In" value={formatCurrency(totalValue)}     />
      </div>

      <div style={{ ...S.card, ...S.rowBetween }}>
        <SearchBar value={histSearch} onChange={setHistSearch} placeholder="Search invoice, material, vendor…" style={{ width:'280px' }} />
        <button onClick={openModal} style={S.btnPrimary}>{ICONS.truck} Receive Stock</button>
      </div>

      {/* History table */}
      <div style={{ ...S.card, padding:0, overflow:'hidden' }}>
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr>
                {[
                  {l:'Date'},{l:'Invoice / OR'},{l:'Material'},{l:'Vendor'},
                  {l:'Qty Received',r:true},{l:'Unit Cost',r:true},{l:'Total Value',r:true},{l:'Remaining',r:true},
                  {l:'Notes'},
                ].map(h => (
                  <th key={h.l} style={{ ...S.th, textAlign: h.r ? 'right' : 'left' }}>{h.l}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {hSlice.length === 0 ? (
                <tr><td colSpan={9}><EmptyState message="No stock-in records" sub="Receive stock to see records here." /></td></tr>
              ) : hSlice.map(b => {
                const mat = materials.find(m => m.id === b.matId);
                return (
                  <tr key={b.id} style={S.tr} onMouseEnter={e => e.currentTarget.style.background='var(--dark2)'} onMouseLeave={e => e.currentTarget.style.background=''}>
                    <td style={{ ...S.td, whiteSpace:'nowrap' }}>{formatDate(b.date)}</td>
                    <td style={{ ...S.td, fontFamily:'monospace', fontSize:'12px', color:'var(--gray)' }}>{b.invoiceNo}</td>
                    <td style={{ ...S.td, fontWeight:500 }}>{mat?.name || b.matId}</td>
                    <td style={{ ...S.td, fontSize:'12px', color:'var(--gray)' }}>{b.vendorName}</td>
                    <td style={{ ...S.td, textAlign:'right' }}>{b.qtyReceived} {mat?.unit}</td>
                    <td style={{ ...S.td, textAlign:'right' }}>{formatCurrency(b.unitCost)}</td>
                    <td style={{ ...S.td, textAlign:'right', fontWeight:600 }}>{formatCurrency(b.qtyReceived * b.unitCost)}</td>
                    <td style={{ ...S.td, textAlign:'right', color: b.remainingQty < b.qtyReceived ? '#b45309' : '#2e7d32', fontWeight:600 }}>{b.remainingQty} {mat?.unit}</td>
                    <td style={{ ...S.td, fontSize:'12px', color:'var(--gray)', maxWidth:'180px' }}>{b.notes}</td>
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

      {/* Wizard modal */}
      <Modal
        open={open}
        onClose={closeModal}
        title="Receive Stock"
        width={step === 1 ? 560 : step === 2 ? 700 : 620}
        footer={
          step === 1 ? (
            <>
              <button onClick={closeModal} style={S.btnGhost}>Cancel</button>
              <button onClick={goStep2} disabled={!selectedIds.length} style={{ ...S.btnPrimary, opacity: selectedIds.length ? 1 : .5 }}>
                Next {ICONS.chevR}
              </button>
            </>
          ) : step === 2 ? (
            <>
              <button onClick={() => setStep(1)} style={S.btnGhost}>{ICONS.chevL} Back</button>
              <button onClick={closeModal} style={S.btnGhost}>Cancel</button>
              <button onClick={goStep3} style={S.btnPrimary}>Review {ICONS.chevR}</button>
            </>
          ) : (
            <>
              <button onClick={() => setStep(2)} style={S.btnGhost}>{ICONS.chevL} Back</button>
              <button onClick={closeModal} style={S.btnGhost}>Cancel</button>
              <button onClick={confirmReceive} disabled={submitting} style={{ ...S.btnPrimary, background:'#2e7d32', opacity: submitting ? .6 : 1 }}>{ICONS.check} {submitting ? 'Saving…' : 'Confirm Receive'}</button>
            </>
          )
        }
      >
        <StepIndicator step={step} />

        {/* ── Step 1: Category card picker ─────────────────────────────────── */}
        {step === 1 && (
          <div style={S.col}>
            <SearchBar
              value={search1}
              onChange={setSearch1}
              placeholder="Search material name or SKU…"
              style={{ width:'100%' }}
            />
            {selectedIds.length > 0 && (
              <Note type="info">{selectedIds.length} material(s) selected. Click Next to proceed.</Note>
            )}
            <div style={{ maxHeight:'360px', overflowY:'auto' }}>
              {step1Groups.length === 0 ? (
                <EmptyState message="No materials found" />
              ) : step1Groups.map(g => (
                <CategoryCard
                  key={g.category}
                  group={g}
                  expanded={search1.trim() ? true : !!expanded[g.category]}
                  onToggle={() => toggleExpanded(g.category)}
                  selectedIds={selectedIds}
                  onToggleMat={toggleSelect}
                />
              ))}
            </div>
          </div>
        )}

        {/* ── Step 2: Delivery details + per-material quantities ────────────── */}
        {step === 2 && (
          <div style={S.col}>
            <div style={{ ...S.cardSm, background:'var(--dark2)' }}>
              <div style={{ fontSize:'12px', fontWeight:700, color:'var(--gray)', textTransform:'uppercase', marginBottom:'10px' }}>Delivery Details</div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px' }}>
                <Field label="Invoice / OR No." required error={errors2.invoiceNo}>
                  <input value={invoiceNo} onChange={e => { setInvoiceNo(e.target.value); setErr2(p=>({...p,invoiceNo:''})); }}
                    placeholder="e.g. OR-2025-015" maxLength={50} style={errors2.invoiceNo ? S.inputErr : S.input} />
                </Field>
                <Field label="Received Date" required error={errors2.date}>
                  <input type="date" value={date} onChange={e => { setDate(e.target.value); setErr2(p=>({...p,date:''})); }}
                    max={new Date().toISOString().split('T')[0]} style={errors2.date ? S.inputErr : S.input} />
                </Field>
                <Field label="Vendor" required error={errors2.vendorId} style={{ gridColumn:'1 / -1' }}>
                  <div style={{ display:'flex', gap:'8px', alignItems:'flex-start' }}>
                    <CustomSelect value={vendorId}
                      onChange={v => { setVendorId(v); setErr2(p=>({...p,vendorId:''})); }}
                      options={vendorList.map(v => ({ value:v.id, label:v.name }))}
                      placeholder="Select vendor"
                      error={errors2.vendorId}
                      style={{ flex:1 }} />
                    {relevantVendors.length < vendors.length && (
                      <button type="button" onClick={() => setShowAllVendors(p => !p)}
                        style={{ ...S.btnGhost, whiteSpace:'nowrap', fontSize:'12px' }}>
                        {showAllVendors ? 'Show preferred' : 'Show all'}
                      </button>
                    )}
                  </div>
                  {relevantVendors.length < vendors.length && !showAllVendors && (
                    <div style={{ fontSize:'11px', color:'var(--gray)', marginTop:'3px' }}>Showing vendors that supply selected material categories.</div>
                  )}
                </Field>
              </div>
              <div style={{ marginTop:'10px' }}>
                <Field label="Notes">
                  <textarea value={sharedNotes} onChange={e => setSharedNotes(e.target.value)} maxLength={300} placeholder="Optional notes for this delivery…" style={S.textarea} />
                </Field>
              </div>
            </div>

            <div style={{ fontSize:'13px', fontWeight:600, color:'var(--gray-light)', marginTop:'4px' }}>Per-Material Quantities</div>
            {rows.map((r, i) => {
              const mat    = materials.find(m => m.id === r.matId);
              const totalBO = r.bos.reduce((s, b) => s + (Number(b.qty) || 0), 0);
              return (
                <div key={r.matId} style={{ border:'1px solid var(--border)', borderRadius:'9px', padding:'14px', background:'var(--dark)' }}>
                  <div style={{ fontWeight:600, marginBottom:'10px', fontSize:'13px' }}>
                    {mat?.name} <span style={{ fontWeight:400, color:'var(--gray)', fontSize:'12px' }}>({mat?.unit})</span>
                  </div>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px' }}>
                    <Field label={`Qty Received (${mat?.unit})`} required error={errors2[`qty_${i}`]}>
                      <IntegerInput value={r.qty} onChange={v => setRow(i,'qty',v)} style={errors2[`qty_${i}`] ? S.inputErr : undefined} />
                    </Field>
                    <Field label="Unit Cost (₱)" required error={errors2[`cost_${i}`]}>
                      <DecimalInput value={r.unitCost} onChange={v => setRow(i,'unitCost',v)} style={errors2[`cost_${i}`] ? S.inputErr : undefined} />
                    </Field>
                  </div>

                  {r.qty && totalBO > Number(r.qty) && (
                    <div style={{ color:'#e05252', fontSize:'12px', marginTop:'8px' }}>
                      Total BO qty ({totalBO}) cannot exceed received qty ({r.qty}).
                    </div>
                  )}

                  {r.bos.length > 0 && (
                    <div style={{ marginTop:'10px', display:'flex', flexDirection:'column', gap:'8px' }}>
                      {r.bos.map((bo, j) => (
                        <div key={j} style={{ background:'#fff5f5', border:'1px solid #fca5a5', borderRadius:'7px', padding:'10px 12px' }}>
                          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'8px' }}>
                            <span style={{ fontSize:'12px', fontWeight:600, color:'#c62828' }}>Bad Order #{j + 1}</span>
                            <button type="button" onClick={() => removeBO(i, j)}
                              style={{ background:'none', border:'none', cursor:'pointer', color:'var(--gray)', fontSize:'16px', lineHeight:1 }}>×</button>
                          </div>
                          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px', marginBottom:'8px' }}>
                            <Field label="BO Qty" required error={errors2[`boQty_${i}_${j}`]}>
                              <IntegerInput value={bo.qty} onChange={v => setBO(i,j,'qty',v)}
                                max={Math.max(0, (Number(r.qty)||0) - r.bos.reduce((s,b,idx) => idx!==j ? s+(Number(b.qty)||0) : s, 0))}
                                style={errors2[`boQty_${i}_${j}`] ? S.inputErr : undefined} />
                            </Field>
                            <Field label="BO Type">
                              <CustomSelect value={bo.type}
                                onChange={v => setBO(i,j,'type',v)}
                                options={BO_TYPES.map(t => ({ value:t, label:t.charAt(0).toUpperCase()+t.slice(1).replace('_',' ') }))} />
                            </Field>
                          </div>
                          <Field label="Notes">
                            <input value={bo.notes} onChange={e => setBO(i,j,'notes',e.target.value)} maxLength={200} placeholder="Describe the issue…" style={S.input} />
                          </Field>
                        </div>
                      ))}
                    </div>
                  )}

                  <button type="button" onClick={() => addBO(i)}
                    style={{ ...S.btnGhost, marginTop:'10px', fontSize:'12px', color:'#e05252', borderColor:'#fca5a5' }}>
                    + Add BO Issue
                    {totalBO > 0 && r.qty && <span style={{ marginLeft:'6px', color:'var(--gray)' }}>({totalBO}/{r.qty} flagged)</span>}
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* ── Step 3: Review ───────────────────────────────────────────────── */}
        {step === 3 && (
          <div style={S.col}>
            <Note type="info">Review the details before confirming. Stock will be updated immediately.</Note>

            <div style={{ ...S.cardSm, background:'var(--dark2)' }}>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'6px 16px', fontSize:'13px' }}>
                <div><span style={{ color:'var(--gray)' }}>Invoice: </span><b>{invoiceNo}</b></div>
                <div><span style={{ color:'var(--gray)' }}>Date: </span><b>{formatDate(date)}</b></div>
                <div style={{ gridColumn:'1 / -1' }}><span style={{ color:'var(--gray)' }}>Vendor: </span><b>{vendor?.name}</b></div>
                {sharedNotes && <div style={{ gridColumn:'1 / -1' }}><span style={{ color:'var(--gray)' }}>Notes: </span>{sharedNotes}</div>}
              </div>
            </div>

            <table style={{ width:'100%', borderCollapse:'collapse', border:'1px solid var(--border)', borderRadius:'8px', overflow:'hidden' }}>
              <thead>
                <tr>
                  {[{l:'Material'},{l:'Qty',r:true},{l:'Unit Cost',r:true},{l:'Total',r:true},{l:'Bad Orders'}].map(h => (
                    <th key={h.l} style={{ ...S.th, padding:'9px 12px', textAlign: h.r ? 'right' : 'left' }}>{h.l}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(r => {
                  const mat = materials.find(m => m.id === r.matId);
                  return (
                    <tr key={r.matId}>
                      <td style={{ ...S.td, padding:'9px 12px', fontWeight:500 }}>{mat?.name}</td>
                      <td style={{ ...S.td, padding:'9px 12px', textAlign:'right' }}>{r.qty} {mat?.unit}</td>
                      <td style={{ ...S.td, padding:'9px 12px', textAlign:'right' }}>{formatCurrency(r.unitCost)}</td>
                      <td style={{ ...S.td, padding:'9px 12px', textAlign:'right', fontWeight:600 }}>{formatCurrency(Number(r.qty) * Number(r.unitCost))}</td>
                      <td style={{ ...S.td, padding:'9px 12px' }}>
                        {r.bos.length === 0
                          ? <span style={{ color:'var(--gray)', fontSize:'12px' }}>None</span>
                          : <div style={{ display:'flex', flexDirection:'column', gap:'3px' }}>
                              {r.bos.map((bo, j) => (
                                <StatusBadge key={j} status={bo.type} label={`${bo.qty} ${mat?.unit} · ${bo.type.replace('_',' ')}`} />
                              ))}
                            </div>
                        }
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr style={{ background:'var(--dark2)' }}>
                  <td colSpan={3} style={{ ...S.td, padding:'10px 12px', fontWeight:700, textAlign:'right' }}>Total</td>
                  <td style={{ ...S.td, padding:'10px 12px', fontWeight:700, color:'var(--gold)' }}>
                    {formatCurrency(rows.reduce((s,r) => s + Number(r.qty) * Number(r.unitCost), 0))}
                  </td>
                  <td style={S.td}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Modal>
    </div>
  );
}
