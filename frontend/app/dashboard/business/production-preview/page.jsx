'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import ErrorBoundary from '@/components/ErrorBoundary';
import { fetchJobOrders, updateJobOrder, reportSpoilage } from '@/lib/jobOrderApi';
import { orderNo } from '@/lib/orderNumber';
import ImageLightbox from '@/components/shop/ImageLightbox';
import { joRisk, RISK_STYLE } from '@/lib/deliveryRisk';
import { JobOrderStatusBadge, RushBadge, DesignPreview, designUrl, joDocId, fmtJODate, TableSkeleton } from '@/components/dashboard/JobOrderBits';
import { S, ICONS, SearchBar, SummaryCard, PaginationBar, EmptyState, usePagination, CustomSelect, ConfirmModal } from '../inventory-v2/shared';

// Production staff worklist - the Queued / In Progress / For QC stages of a Job Order.
// One Job Order moves: Queued -> In Progress -> For QC (then QC staff inspect it).
// A mixed order produces one Job Order per printable item, so two rows here can share an order number.

const STATUS_TABS = [
  { value: 'all',         label: 'All Active' },
  { value: 'Queued',      label: 'Queued' },
  { value: 'In Progress', label: 'In Progress' },
  { value: 'QC_Pending',  label: 'For QC' },
  { value: 'QC_Failed',   label: 'Rework' },
];

export default function ProductionPage() {
  const { token } = useAuth();
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [preview, setPreview] = useState(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true); setError('');
    try {
      const data = await fetchJobOrders(token);
      setJobs(Array.isArray(data) ? data : []);
    } catch (e) { setError(e.message || 'Failed to load job orders'); }
    finally { setLoading(false); }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const idOf = (j) => joDocId(j);
  const prodName = (j) => {
    const p = j.product || {};
    return `${p.name ?? 'Item'}${p.variant ? ` - ${p.variant}` : ''}`;
  };

  // Starting a job commits material and sending it on hands work to the next station. Both are
  // awkward to walk back, and both used to happen on a single stray click in a dense table where the
  // row itself opens a detail panel.
  const [confirmAct, setConfirmAct] = useState(null);
  const advancing = useRef(false);

  const ADVANCE_COPY = {
    'In Progress': {
      title: 'Start this job?',
      body: 'Production begins and the reserved material is committed to it.',
      label: 'Start',
    },
    'QC_Pending': {
      title: 'Send to quality control?',
      body: 'The batch leaves the bench and QC decides what passes. Anything rejected comes back here to be remade.',
      label: 'Send to QC',
    },
  };

  const advance = async (j, joStatus) => {
    if (advancing.current) return;
    advancing.current = true;
    setBusyId(idOf(j)); setError('');
    try {
      await updateJobOrder(token, idOf(j), { joStatus });
      setConfirmAct(null);
      await load();
    } catch (e) { setError(e.message || 'Update failed'); }
    finally { advancing.current = false; setBusyId(null); }
  };

  const active = jobs.filter(j => !['Completed', 'Cancelled', 'QC_Passed'].includes(j.joStatus));
  const counts = {
    queued:     jobs.filter(j => j.joStatus === 'Queued').length,
    inProgress: jobs.filter(j => j.joStatus === 'In Progress').length,
    forQc:      jobs.filter(j => j.joStatus === 'QC_Pending').length,
    rework:     jobs.filter(j => j.joStatus === 'QC_Failed').length,
    late:       active.filter(j => joRisk(j)?.level === 'overdue').length,
  };

  const filtered = active.filter(j => {
    const mS = statusFilter === 'all' || j.joStatus === statusFilter;
    const q = search.toLowerCase();
    const mQ = !q || prodName(j).toLowerCase().includes(q) || (j.joId || '').toLowerCase().includes(q) || (j.orderId || '').toLowerCase().includes(q);
    return mS && mQ;
  });

  const { slice, page, perPage, total, setPage, setPerPage } = usePagination(filtered);

  return (
    <ErrorBoundary>
      <div style={S.page}>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '16px' }}>
          <SummaryCard label="Queued" value={counts.queued} accent />
          <SummaryCard label="In Progress" value={counts.inProgress} color="var(--gold)" />
          <SummaryCard label="For QC" value={counts.forQc} color="var(--st-purple-fg)" />
          <SummaryCard label="Rework" value={counts.rework} color="var(--st-red-fg)" />
          <SummaryCard label="Past Due" value={counts.late} color={counts.late > 0 ? 'var(--st-red-fg)' : undefined} />
        </div>

        <div style={{ ...S.card, ...S.rowBetween, marginBottom: '10px', padding: '12px 16px' }}>
          <div style={{ ...S.row, gap: '8px', flex: 1 }}>
            <SearchBar value={search} onChange={v => { setSearch(v); setPage(1); }} placeholder="Search JO, product, order…" style={{ width: '260px' }} />
            <CustomSelect value={statusFilter} onChange={v => { setStatusFilter(v); setPage(1); }} options={STATUS_TABS} style={{ width: '160px' }} />
          </div>
          <button onClick={load} style={S.btnGhost}>{ICONS.reload} Refresh</button>
        </div>

        {error && <div style={{ ...S.note, background: 'var(--st-red-bg)', borderColor: 'rgba(239,68,68,0.35)', color: 'var(--st-red-fg)', marginBottom: '10px' }}>{error}</div>}

        <div style={{ ...S.card, padding: 0, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>
              <th style={S.th}>JO</th><th style={S.th}>Design</th><th style={S.th}>Product</th><th style={S.th}>To make</th>
              <th style={S.th}>Order</th><th style={S.th}>Target</th><th style={S.th}>Status</th>
              <th style={{ ...S.th, textAlign: 'right' }}>Action</th>
            </tr></thead>
            <tbody>
              {loading ? (
                <TableSkeleton cols={8} rows={4} />
              ) : slice.length === 0 ? (
                <tr><td colSpan={8} style={{ padding: 0 }}><EmptyState message="No active job orders" sub="Create one from a paid, design-approved order in Job Orders." /></td></tr>
              ) : slice.map(j => {
                const id = idOf(j); const busy = busyId === id;
                const risk = joRisk(j);
                return (
                  <tr key={id} style={{ ...S.tr, cursor: 'pointer' }} onClick={() => setDetail(j)}
                    title="Open this job order">
                    <td style={{ ...S.td, fontFamily: 'monospace', fontWeight: 600 }}>
                      {j.joId || '-'}
                      <RushBadge isRush={j.isRush} />
                    </td>
                    <td style={{ ...S.td, width: 60 }}>
                      <DesignPreview path={j.product?.thumbnail || j.designFilePath} />
                    </td>
                    <td style={S.td}>
                      {prodName(j)}
                      {Number(j.acceptedQty ?? 0) > 0 && j.qcResult?.defects && (
                        <div style={{ fontSize: 11, color: 'var(--st-red-fg)', marginTop: 3, fontWeight: 600 }}>
                          Back from QC: {j.qcResult.defects}
                        </div>
                      )}
                      {j.designNotes && <div style={{ fontSize: 11, color: 'var(--gold)', marginTop: 2 }}>Note: {j.designNotes}</div>}
                      {j.bomSnapshot?.length > 0 && (() => {
                        const ordered = Number(j.product?.quantity ?? 0) || 1;
                        const left    = Math.max(0, ordered - Number(j.acceptedQty ?? 0));
                        return (
                          <div style={{ fontSize: 11, color: 'var(--gray)', marginTop: 2 }}>
                            Materials: {j.bomSnapshot.map(m => {
                              const per = Number(m.qtyPerUnit ?? 0) || (Number(m.totalQty ?? 0) / ordered);
                              const need = Math.round(per * left);
                              return `${m.name} x${need}${m.unit ? ' ' + m.unit : ''}`;
                            }).join(', ')}
                          </div>
                        );
                      })()}
                    </td>
                    <td style={S.td}>
                      {(() => {
                        const ordered = Number(j.product?.quantity ?? 0);
                        const done    = Number(j.acceptedQty ?? 0);
                        const left    = Math.max(0, ordered - done);
                        if (!ordered) return '-';
                        return (
                          <>
                            <span style={{ fontWeight: 700, color: done > 0 ? 'var(--gold)' : 'var(--white)' }}>{left}</span>
                            {done > 0 && (
                              <div style={{ fontSize: 11, color: 'var(--gray)', marginTop: 2 }}>
                                {done} of {ordered} already passed
                              </div>
                            )}
                          </>
                        );
                      })()}
                    </td>
                    <td style={{ ...S.td, fontFamily: 'monospace' }}>{j.orderId ? orderNo(j.orderId) : '-'}</td>
                    <td style={S.td}>
                      {fmtJODate(j.targetCompletion)}
                      {risk && <div style={{ marginTop: 3 }}><span style={{ ...S.badge, ...RISK_STYLE[risk.color], fontSize: 9, fontWeight: 700 }}>{risk.label}</span></div>}
                    </td>
                    <td style={S.td}><JobOrderStatusBadge status={j.joStatus} /></td>
                    <td style={{ ...S.td, textAlign: 'right' }} onClick={e => e.stopPropagation()}>
                      {j.joStatus === 'Queued' && <button disabled={busy} onClick={e => { e.stopPropagation(); setConfirmAct({ jo: j, to: 'In Progress' }); }} style={S.btnSm}>{busy ? 'Saving…' : 'Start'}</button>}
                      {j.joStatus === 'In Progress' && <button disabled={busy} onClick={e => { e.stopPropagation(); setConfirmAct({ jo: j, to: 'QC_Pending' }); }} style={S.btnSm}>{busy ? 'Saving…' : 'Send to QC'}</button>}
                      {j.joStatus === 'QC_Pending' && <span style={{ fontSize: '12px', color: 'var(--gray)' }}>Awaiting QC</span>}
                      {j.joStatus === 'QC_Failed' && <button disabled={busy} onClick={e => { e.stopPropagation(); setConfirmAct({ jo: j, to: 'In Progress' }); }} style={S.btnSm}>{busy ? 'Saving…' : 'Redo'}</button>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <PaginationBar total={total} page={page} perPage={perPage} onPage={setPage} onPerPage={setPerPage} />
      </div>

      {detail && (
        <JobDetail
          jo={detail}
          onClose={() => setDetail(null)}
          onPreview={(u) => {
            const kind = /\.(mp4|webm|mov|m4v|ogg)(\?|$)/i.test(u) ? 'video'
              : /\.(jpe?g|png|webp|gif|avif|svg)(\?|$)/i.test(u) ? 'image' : null;
            if (!kind) { window.open(u, '_blank', 'noopener'); return; }
            setPreview({ url: u, kind });
          }}
          onChanged={(updated) => { setDetail(updated); load(); }}
        />
      )}
      {preview && <ImageLightbox url={preview.url} kind={preview.kind} onClose={() => setPreview(null)} />}
      <ConfirmModal
        open={!!confirmAct}
        onClose={() => setConfirmAct(null)}
        onConfirm={() => confirmAct && advance(confirmAct.jo, confirmAct.to)}
        loading={!!busyId}
        confirmStyle="primary"
        title={confirmAct ? ADVANCE_COPY[confirmAct.to]?.title : ''}
        confirmLabel={confirmAct ? ADVANCE_COPY[confirmAct.to]?.label : 'Confirm'}
        message={confirmAct
          ? `${confirmAct.jo.joId} - ${prodName(confirmAct.jo)}. ${ADVANCE_COPY[confirmAct.to]?.body ?? ''}`
          : ''}
      />

    </ErrorBoundary>
  );
}


/**
 * One job order as a workstation rather than a row in a queue.
 *
 * The list can say a job exists; it cannot tell an operator how to run it. Everything needed to
 * actually do the work - what it should look like, what to print, the settings for this item, what to
 * pull from the shelf - belongs in one place, along with somewhere to say when something went wrong.
 */
function JobDetail({ jo, onClose, onPreview, onChanged }) {
  const { token } = useAuth();
  const [qty, setQty]       = useState('1');
  const [kind, setKind]     = useState('abnormal');
  const [reason, setReason] = useState('');
  const [busy, setBusy]     = useState(false);
  const [err, setErr]       = useState('');
  const [open, setOpen]     = useState(false);

  const ordered  = Number(jo?.product?.quantity ?? 0);
  // What is still owed. A job that came back from QC owing 1 kept showing the original 10 here and on
  // its pull list, so the bench would have pulled ten mugs to remake one.
  const accepted = Number(jo?.acceptedQty ?? 0);
  const toMake   = Math.max(0, ordered - accepted);
  const proofs   = (jo?.designFilePaths?.length ? jo.designFilePaths : [jo?.designFilePath]).filter(Boolean);
  const prod     = jo?.productionFiles ?? [];
  const bom      = jo?.bomSnapshot?.components ?? jo?.bomSnapshot ?? [];
  const spoiled  = (jo?.spoilage ?? []).reduce((t, sp) => t + (Number(sp.quantity) || 0), 0);

  // Saved on every tick. Ticking a box that forgets when the panel closes looks like a record and is
  // not one - the next person to open the job would have no idea what had already been pulled.
  const [pulled, setPulled]   = useState(jo?.materialsPulled ?? []);
  // Which materials this spoilage actually destroyed. Everything is ticked to begin with because that
  // is the worst case, but a mug that breaks before printing costs a mug and nothing else - untick the
  // rest rather than write off paper that is still on the shelf.
  const [lost, setLost] = useState([]);
  const [pulling, setPulling] = useState(false);

  // The recipe is stored for the WHOLE job, so scale it to what is actually left to make.
  const need = (m) => {
    const per = Number(m.qtyPerUnit ?? 0) || (Number(m.totalQty ?? m.qty ?? 0) / (ordered || 1));
    return Math.round(per * toMake);
  };
  const togglePulled = async (key) => {
    const next = pulled.includes(key) ? pulled.filter(k => k !== key) : [...pulled, key];
    setPulled(next);
    setPulling(true);
    try {
      const updated = await updateJobOrder(token, joDocId(jo), { materialsPulled: next });
      // Push it back up as well. The modal is handed a row from the page's `jobs` array, so without
      // this the tick was saved but the next open re-read the stale row and showed it unticked.
      onChanged?.(updated ?? { ...jo, materialsPulled: next });
    }
    catch { setPulled(pulled); }   // put it back rather than show a tick that did not save
    finally { setPulling(false); }
  };

  const submit = async () => {
    const n = parseInt(qty, 10);
    if (!n || n < 1) { setErr('Enter how many were spoiled.'); return; }
    if (n > ordered) { setErr(`This job is only producing ${ordered}.`); return; }
    if (reason.trim().length < 3) { setErr('Say what happened - a bare count tells nobody how to prevent it.'); return; }
    if (lost.length === 0) { setErr('Tick at least one material that was actually lost.'); return; }
    setBusy(true); setErr('');
    try {
      const updated = await reportSpoilage(token, joDocId(jo), { quantity: n, kind, reason: reason.trim(), materials: lost });
      setQty('1'); setReason(''); setOpen(false);
      onChanged?.(updated);
    } catch (e) { setErr(e.message || 'Could not record it.'); }
    finally { setBusy(false); }
  };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={e => e.stopPropagation()} style={{ ...S.card, width: '100%', maxWidth: 640, maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
          <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: 'var(--white)' }}>
            {jo.joId} - {jo.product?.name}{jo.product?.variant ? ` · ${jo.product.variant}` : ''}
          </h2>
          <JobOrderStatusBadge status={jo.joStatus} />
          <RushBadge isRush={jo.isRush} />
          <button onClick={onClose} style={{ marginLeft: 'auto', ...S.btnSmGhost }}>Close</button>
        </div>

        <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'var(--gray)', marginBottom: 14, flexWrap: 'wrap' }}>
          <span>To make <strong style={{ color: 'var(--gold)' }}>{toMake}</strong></span>
          {accepted > 0 && <span>{accepted} of {ordered} already passed</span>}
          <span>Due <strong style={{ color: 'var(--white)' }}>{fmtJODate(jo.targetCompletion)}</strong></span>
          {jo.orderId && <span>Order <strong style={{ color: 'var(--white)' }}>{orderNo(jo.orderId)}</strong></span>}
          {spoiled > 0 && <span style={{ color: 'var(--st-red-fg)' }}>Spoiled so far <strong>{spoiled}</strong></span>}
        </div>

        {proofs.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ ...S.label }}>Approved proof - the result should match this</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
              {proofs.map((u, n) => (
                <DesignPreview key={n} path={u} size={54} onOpen={(full) => onPreview?.(full)} />
              ))}
            </div>
          </div>
        )}

        <div style={{ marginBottom: 12 }}>
          <div style={{ ...S.label }}>Production artwork - print this</div>
          {prod.length === 0 ? (
            <div style={{ ...S.note, background: 'var(--st-red-bg)', borderColor: 'rgba(239,68,68,0.35)', color: 'var(--st-red-fg)', marginTop: 6, fontSize: 12 }}>
              No print-ready file on this job. The proof is a mockup - do not start until the real file is attached.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 }}>
              {prod.map((f, i) => (
                <button key={i} type="button" onClick={() => onPreview?.(f.url)}
                  style={{ textAlign: 'left', background: 'var(--dark2)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 8px', cursor: 'pointer' }}>
                  <span style={{ color: 'var(--gold)', fontSize: 12, fontWeight: 600 }}>{f.name || `File ${i + 1}`}</span>
                  {f.note && <span style={{ color: 'var(--gray)', fontSize: 11 }}> · {f.note}</span>}
                </button>
              ))}
            </div>
          )}
        </div>

        {jo.notes && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ ...S.label }}>Notes for this job</div>
            <div style={{ ...S.note, marginTop: 6, fontSize: 12 }}>{jo.notes}</div>
          </div>
        )}

        {bom.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ ...S.label }}>
              Pull from the shelf
              {pulled.length > 0 && <span style={{ color: 'var(--gray)', fontWeight: 400 }}> - {pulled.length} of {bom.length} taken</span>}
            </div>
            <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {bom.map((m, i) => {
                const key = String(m.inventoryId ?? m.name ?? i);
                const done = pulled.includes(key);
                return (
                  <label key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: done ? 'var(--gray)' : 'var(--gray-light)' }}>
                    <input type="checkbox" checked={done} disabled={pulling}
                      onChange={() => togglePulled(key)}
                      style={{ accentColor: 'var(--gold)' }} />
                    <span style={{ textDecoration: done ? 'line-through' : 'none' }}>
                      {m.name} <span style={{ color: 'var(--gray)' }}>x{need(m)}{m.unit ? ` ${m.unit}` : ''}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        )}

        {/* Reported against the JOB, not as a bare stock adjustment: a stock-out with reason "damaged"
            never says WHICH job, and that link is the only way to find the machine or material costing
            you money. */}
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
          {!open ? (
            <button type="button"
              onClick={() => { setLost(bom.map(m => String(m.inventoryId ?? ''))); setOpen(true); }}
              style={{ ...S.btnSmGhost, color: 'var(--st-red-fg)', borderColor: 'rgba(239,68,68,0.35)' }}>
              Report spoilage
            </button>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ ...S.label }}>Report spoilage</div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <input type="text" inputMode="numeric" maxLength={4} value={qty}
                  onChange={e => { setQty(e.target.value.replace(/[^0-9]/g, '')); setErr(''); }}
                  style={{ ...S.input, width: 70, textAlign: 'center' }} />
                <span style={{ fontSize: 12, color: 'var(--gray)' }}>of {ordered} ruined</span>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {[['abnormal', 'Abnormal - a mistake'], ['normal', 'Normal - expected loss']].map(([v, label]) => (
                  <button key={v} type="button" onClick={() => setKind(v)}
                    style={{ ...S.btnSmGhost, borderColor: kind === v ? 'var(--gold)' : 'var(--border)', color: kind === v ? 'var(--gold)' : 'var(--gray)' }}>
                    {label}
                  </button>
                ))}
              </div>
              <span style={{ fontSize: 11, color: 'var(--gray)' }}>
                {kind === 'normal'
                  ? 'Counted in the cost of this job - an expected rate you already price for.'
                  : 'Kept out of job cost on purpose. Burying a mistake in the job is how it stays invisible.'}
              </span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 11, color: 'var(--gray)' }}>What was actually lost?</span>
                {bom.map((m, i) => {
                  const key = String(m.inventoryId ?? '');
                  const on = lost.includes(key);
                  const per = Number(m.qty ?? 0) || (Number(m.totalPerUnit ?? 0));
                  const willTake = per > 0 ? Math.round(per * (parseInt(qty, 10) || 0)) : null;
                  return (
                    <label key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: on ? 'var(--gray-light)' : 'var(--gray)' }}>
                      <input type="checkbox" checked={on} disabled={busy}
                        onChange={() => setLost(p => p.includes(key) ? p.filter(k => k !== key) : [...p, key])}
                        style={{ accentColor: 'var(--gold)' }} />
                      {m.name}
                      {on && willTake ? <span style={{ color: 'var(--st-red-fg)' }}>-{willTake}{m.unit ? ` ${m.unit}` : ''}</span> : null}
                    </label>
                  );
                })}
              </div>
              <input type="text" maxLength={500} value={reason}
                onChange={e => { setReason(e.target.value); setErr(''); }}
                placeholder="What happened? e.g. dropped while transferring"
                style={{ ...S.input, fontSize: 12 }} />
              <span style={{ fontSize: 11, color: 'var(--gray)' }}>
                Only the ticked materials come out of stock. The order still owes {ordered}, so the replacement stays reserved.
              </span>
              {err && <span style={{ fontSize: 11, color: 'var(--st-red-fg)' }}>{err}</span>}
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" onClick={submit} disabled={busy} style={S.btnSm}>{busy ? 'Recording…' : 'Record spoilage'}</button>
                <button type="button" onClick={() => { setOpen(false); setErr(''); }} style={S.btnSmGhost}>Cancel</button>
              </div>
            </div>
          )}

          {(jo.spoilage ?? []).length > 0 && (
            <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {jo.spoilage.map((sp, i) => (
                <div key={i} style={{ fontSize: 11, color: 'var(--gray)' }}>
                  <strong style={{ color: sp.kind === 'abnormal' ? 'var(--st-red-fg)' : 'var(--gray-light)' }}>
                    {sp.quantity} {sp.kind}
                  </strong>
                  {' - '}{sp.reason}
                  {sp.reportedBy ? ` (${sp.reportedBy})` : ''}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
