'use client';
import { useState, useMemo } from 'react';
import { S, ICONS, Field, Modal, ConfirmModal, PaginationBar, SearchBar, StatusBadge, Note, EmptyState, SummaryCard, usePagination, formatCurrency, formatDate, CustomSelect } from './shared';
import { resolveReturn } from './api';

const STATUS_OPTIONS = ['All','Pending','Replaced','Written Off'];
const TYPE_OPTIONS   = ['All','Damaged','Defective','Shortage','Wrong Item','Expired'];

function ResolveModal({ open, onClose, badOrder, material, onResolve }) {
  const [resolution, setResolution]= useState('replaced');
  const [notes,      setNotes]     = useState('');
  const [errors,     setErrors]    = useState({});

  const reset = () => { setResolution('replaced'); setNotes(''); setErrors({}); };
  const handleClose = () => { reset(); onClose(); };

  const submit = () => {
    const e = {};
    if (!notes.trim()) e.notes = 'Please provide resolution notes.';
    if (Object.keys(e).length) { setErrors(e); return; }
    onResolve({ resolution, notes: notes.trim() });
    reset();
  };

  if (!open) return null;
  return (
    <Modal open={open} onClose={handleClose} title="Resolve Bad Order" width={460}
      footer={
        <>
          <button onClick={handleClose} style={S.btnGhost}>Cancel</button>
          <button onClick={submit} style={S.btnPrimary}>{ICONS.check} Resolve</button>
        </>
      }
    >
      <div style={S.col}>
        <div style={{ ...S.cardSm, background:'var(--dark2)' }}>
          <div style={{ fontSize:'12px', color:'var(--gray)', marginBottom:'6px' }}>Bad Order Summary</div>
          <div style={{ fontWeight:600, fontSize:'14px' }}>{material?.name}</div>
          <div style={{ fontSize:'12px', color:'var(--gray)', marginTop:'4px' }}>
            Qty: <b>{badOrder?.qty}</b> · Type: <b>{badOrder?.type?.replace('_',' ')}</b> · Invoice: <b>{badOrder?.invoiceNo}</b>
          </div>
          {badOrder?.notes && <div style={{ fontSize:'12px', color:'var(--gray)', marginTop:'4px' }}>{badOrder.notes}</div>}
        </div>

        <Field label="Resolution">
          <div style={{ display:'flex', gap:'8px', flexWrap:'wrap' }}>
            {[
              {val:'replaced',   label:'Replaced by Vendor'},
              {val:'refunded',   label:'Refunded'},
              {val:'written_off',label:'Written Off'},
            ].map(o => (
              <label key={o.val} style={{ flex:1, minWidth:'120px', display:'flex', alignItems:'center', gap:'8px', padding:'10px 12px', border:`1px solid ${resolution === o.val ? 'var(--gold)' : 'var(--border)'}`, borderRadius:'7px', cursor:'pointer', background: resolution === o.val ? 'var(--gold-subtle)' : 'var(--dark)', transition:'all .12s' }}>
                <input type="radio" name="resolution" value={o.val} checked={resolution === o.val} onChange={() => setResolution(o.val)} style={{ accentColor:'var(--gold)' }} />
                <span style={{ fontSize:'13px', fontWeight: resolution === o.val ? 600 : 400 }}>{o.label}</span>
              </label>
            ))}
          </div>
        </Field>

        {resolution === 'replaced' && (
          <Note type="info">A return entry will be auto-created so you can track and receive the replacement from the Returns tab.</Note>
        )}
        {resolution === 'refunded' && (
          <Note type="info">Mark this when the vendor has issued a monetary refund or credit note for the bad items.</Note>
        )}
        {resolution === 'written_off' && (
          <Note>Writing off means the cost is recorded as a loss. This cannot be undone.</Note>
        )}

        <Field label="Resolution Notes" required error={errors.notes}>
          <textarea value={notes} onChange={e => { setNotes(e.target.value); setErrors(p => ({...p, notes:''})); }}
            maxLength={300} placeholder="Describe how this was resolved…" style={S.textarea} />
        </Field>
      </div>
    </Modal>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function BadOrdersTab({ badOrders, setBadOrders, materials, batches, vendors, toast, token, onRefresh }) {
  const [search,        setSearch]       = useState('');
  const [statusFilter,  setStatusFilter] = useState('All');
  const [typeFilter,    setTypeFilter]   = useState('All');
  const [resolveTarget, setResolveTarget]= useState(null);
  const [confirmWrite,  setConfirmWrite] = useState(null);

  const filtered = useMemo(() => {
    let list = [...(badOrders || [])].sort((a,b) => new Date(b.date) - new Date(a.date));
    if (statusFilter !== 'All') list = list.filter(b => b.status === statusFilter.toLowerCase().replace(/ /g,'_'));
    if (typeFilter !== 'All')   list = list.filter(b => b.type === typeFilter.toLowerCase().replace(/ /g,'_'));
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(b => b.matName?.toLowerCase().includes(q) || b.invoiceNo?.toLowerCase().includes(q));
    }
    return list;
  }, [badOrders, statusFilter, typeFilter, search]);

  const { slice, page, perPage, total, setPage, setPerPage } = usePagination(filtered);

  const pending     = (badOrders || []).filter(b => b.status === 'pending').length;
  const replaced    = (badOrders || []).filter(b => b.status === 'replaced').length;
  const writtenOff  = (badOrders || []).filter(b => b.status === 'written_off').length;
  const totalLoss   = (badOrders || []).filter(b => b.status === 'written_off').reduce((s, b) => {
    const batch = (batches || []).find(bt => bt.id === b.batchId);
    return s + (batch?.unitCost || 0) * b.qty;
  }, 0);

  const handleResolve = async ({ resolution, notes }) => {
    const bo = resolveTarget;
    try {
      await resolveReturn(token, bo.id, { status: resolution, resolvedNotes: notes });
      await onRefresh(['badOrders', 'materials']);
      if (resolution === 'replaced') {
        toast?.('Resolved as replaced. Follow up with the vendor for the replacement delivery.', 'info');
      } else if (resolution === 'refunded') {
        toast?.('Bad order marked as refunded.', 'success');
      } else {
        toast?.('Bad order written off. Cost recorded as a loss.', 'warn');
      }
    } catch (err) {
      toast?.(err.message ?? 'Failed to resolve bad order.', 'error');
    }
    setResolveTarget(null);
  };

  return (
    <div style={S.col}>
      {/* summary */}
      <div style={{ display:'flex', gap:'12px', flexWrap:'wrap' }}>
        <SummaryCard label="Pending"     value={pending}    color="#e65100" accent />
        <SummaryCard label="Replaced"    value={replaced}   color="#2e7d32" />
        <SummaryCard label="Written Off" value={writtenOff} color="var(--gray)" />
        <SummaryCard label="Total Loss"  value={formatCurrency(totalLoss)} color="#c62828" />
      </div>

      {/* toolbar */}
      <div style={{ ...S.card, ...S.rowBetween }}>
        <div style={{ display:'flex', gap:'8px', flexWrap:'wrap' }}>
          <SearchBar value={search} onChange={setSearch} placeholder="Search material or invoice…" style={{ width:'220px' }} />
          <CustomSelect value={statusFilter} onChange={setStatusFilter}
            options={STATUS_OPTIONS} style={{ width:'140px' }} />
          <CustomSelect value={typeFilter} onChange={setTypeFilter}
            options={TYPE_OPTIONS} style={{ width:'140px' }} />
        </div>
      </div>

      {/* table */}
      <div style={{ ...S.card, padding:0, overflow:'hidden' }}>
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr>
                {[
                  {l:'Date'},{l:'Invoice'},{l:'Material'},
                  {l:'Qty',r:true},{l:'Type'},{l:'Notes'},{l:'Status'},{l:'Resolved Date'},
                  {l:'Actions',c:true},
                ].map(h => (
                  <th key={h.l} style={{ ...S.th, textAlign: h.r ? 'right' : h.c ? 'center' : 'left' }}>{h.l}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {slice.length === 0 ? (
                <tr><td colSpan={9}><EmptyState message="No bad orders found" sub="Bad orders are logged during stock receiving." /></td></tr>
              ) : slice.map(b => {
                const mat = materials.find(m => m.id === b.matId);
                return (
                  <tr key={b.id} style={S.tr} onMouseEnter={e => e.currentTarget.style.background='var(--dark2)'} onMouseLeave={e => e.currentTarget.style.background=''}>
                    <td style={{ ...S.td, whiteSpace:'nowrap' }}>{formatDate(b.date)}</td>
                    <td style={{ ...S.td, fontFamily:'monospace', fontSize:'12px', color:'var(--gray)' }}>{b.invoiceNo}</td>
                    <td style={{ ...S.td, fontWeight:500 }}>{b.matName}</td>
                    <td style={{ ...S.td, textAlign:'right', fontWeight:600, color:'#c62828' }}>{b.qty} {mat?.unit}</td>
                    <td style={S.td}><StatusBadge status={b.type} /></td>
                    <td style={{ ...S.td, fontSize:'12px', color:'var(--gray)', maxWidth:'180px' }}>{b.notes}</td>
                    <td style={S.td}><StatusBadge status={b.status} /></td>
                    <td style={{ ...S.td, fontSize:'12px', color:'var(--gray)' }}>
                      {b.resolvedDate ? formatDate(b.resolvedDate) : ''}
                      {b.resolvedNotes && <div style={{ color:'var(--gray)', marginTop:'2px' }}>{b.resolvedNotes}</div>}
                    </td>
                    <td style={{ ...S.td, textAlign:'center' }}>
                      {b.status === 'pending' && (
                        <button onClick={() => setResolveTarget(b)} style={S.btnSm}>{ICONS.check} Resolve</button>
                      )}
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

      <ResolveModal
        open={!!resolveTarget}
        onClose={() => setResolveTarget(null)}
        badOrder={resolveTarget}
        material={materials.find(m => m.id === resolveTarget?.matId)}
        onResolve={handleResolve}
      />
    </div>
  );
}
