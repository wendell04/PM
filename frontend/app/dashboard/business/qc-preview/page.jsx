'use client';

import { useState, useEffect, useCallback, useRef} from 'react';
import { useAuth } from '@/contexts/AuthContext';
import ErrorBoundary from '@/components/ErrorBoundary';
import { fetchJobOrders } from '@/lib/jobOrderApi';
import { submitJobOrderQC } from '@/lib/ordersApi';
import { orderNo } from '@/lib/orderNumber';
import { joRisk, RISK_STYLE } from '@/lib/deliveryRisk';
import useLockBodyScroll from '@/lib/useLockBodyScroll';
import ImageLightbox from '@/components/shop/ImageLightbox';
import { JobOrderStatusBadge, RushBadge, DesignPreview, joDocId, fmtJODate, TableSkeleton } from '@/components/dashboard/JobOrderBits';
import { S, ICONS, SearchBar, SummaryCard, PaginationBar, EmptyState, usePagination } from '../inventory-v2/shared';

// QC staff worklist - Job Orders at the For QC stage. Inspect the finished piece against the approved
// artwork, then Pass or Fail.
//   Pass -> materials are consumed and, once EVERY job order of that order has passed, the order
//           becomes Ready for Delivery (a mixed order has one job order per item).
//   Fail -> back to production for reprint; materials stay reserved.
// Passing consumes stock and cannot be undone from here, so it asks for confirmation first.

export default function QualityControlPage() {
  const { token, currentUser } = useAuth();
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState(null);
  // setBusyId only disables the button on the NEXT render, so a fast double-press fired the request
  // twice. The first one recorded the inspection; the second found the job already QC_Passed and came
  // back 422, which is why an inspection that had actually worked reported a failure.
  const submitting = useRef(false);
  const [inspect, setInspect] = useState(null);
  const [preview, setPreview] = useState(null);
  const showPreview = (u) => {
    const kind = /\.(mp4|webm|mov|m4v|ogg)(\?|$)/i.test(u) ? 'video'
      : /\.(jpe?g|png|webp|gif|avif|svg)(\?|$)/i.test(u) ? 'image' : null;
    if (!kind) { window.open(u, '_blank', 'noopener'); return; }
    setPreview({ url: u, kind });
  };
  const [accepted, setAccepted] = useState('');
  const [rejected, setRejected] = useState('');
  const [disposition, setDisposition] = useState('rework');
  const [scrapped, setScrapped] = useState([]);
  const [defects, setDefects] = useState('');

  // The recipe behind the job, so a scrap can name what was really destroyed.
  const bomOf = (j) => (j?.bomSnapshot?.components ?? j?.bomSnapshot ?? []).filter(c => c?.inventoryId);

  useLockBodyScroll(!!inspect);

  const checkedBy = (`${currentUser?.firstName ?? ''} ${currentUser?.lastName ?? ''}`.trim()) || currentUser?.email || 'QC';

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

  const queue = jobs.filter(j => ['QC_Pending', 'QC_Failed'].includes(j.joStatus));
  const counts = {
    pending: jobs.filter(j => j.joStatus === 'QC_Pending').length,
    rework:  jobs.filter(j => j.joStatus === 'QC_Failed').length,
    passed:  jobs.filter(j => j.joStatus === 'QC_Passed').length,
  };

  // One inspection, not two buttons. A batch is rarely all good or all bad, and the old pair could
  // only say "all 10 passed" or "all 10 failed" - the first ships a defect, the second sends nine good
  // units back through production.
  const submitInspection = async (jo, { accepted, rejected, disposition, defects: dfx, materials }) => {
    if (submitting.current) return;
    submitting.current = true;
    setBusyId(idOf(jo)); setError('');
    try {
      await submitJobOrderQC(idOf(jo), {
        accepted, rejected,
        disposition: rejected > 0 ? disposition : null,
        materials:   rejected > 0 && disposition === 'scrap' ? materials : null,
        defects: (dfx || '').trim() || null,
        checkedBy,
      }, token);
      setInspect(null);
      setScrapped([]);
      await load();
    } catch (e) {
      // The job moving out of an inspectable state means someone already recorded this - a second
      // press, or another station. That is not a failure worth alarming anyone about; just resync.
      if (/Current status:|already/i.test(e.message || '')) {
        setInspect(null); setScrapped([]);
        await load();
      } else {
        setError(e.message || 'QC submission failed');
      }
    }
    finally { submitting.current = false; setBusyId(null); }
  };


  const filtered = queue.filter(j => {
    const q = search.toLowerCase();
    return !q || prodName(j).toLowerCase().includes(q) || (j.joId || '').toLowerCase().includes(q) || (j.orderId || '').toLowerCase().includes(q);
  });

  const { slice, page, perPage, total, setPage, setPerPage } = usePagination(filtered);

  // How many job orders the same order still has open. Tells QC whether passing this one actually
  // releases the order or whether its sibling items are still being made.
  const siblingsOpen = (j) => jobs.filter(x =>
    String(x.orderId) === String(j.orderId) &&
    idOf(x) !== idOf(j) &&
    !['QC_Passed', 'Completed', 'Cancelled'].includes(x.joStatus)
  ).length;

  return (
    <ErrorBoundary>
      <div style={S.page}>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '16px' }}>
          <SummaryCard label="Pending QC" value={counts.pending} accent />
          <SummaryCard label="Rework (Failed)" value={counts.rework} color="var(--st-red-fg)" />
          <SummaryCard label="Passed" value={counts.passed} color="var(--st-green-fg)" />
        </div>

        <div style={{ ...S.card, ...S.rowBetween, marginBottom: '10px', padding: '12px 16px' }}>
          <div style={{ ...S.row, gap: '8px', flex: 1 }}>
            <SearchBar value={search} onChange={v => { setSearch(v); setPage(1); }} placeholder="Search JO, product, order…" style={{ width: '260px' }} />
          </div>
          <button onClick={load} style={S.btnGhost}>{ICONS.reload} Refresh</button>
        </div>

        {error && <div style={{ ...S.note, background: 'var(--st-red-bg)', borderColor: 'rgba(239,68,68,0.35)', color: 'var(--st-red-fg)', marginBottom: '10px' }}>{error}</div>}

        <div style={{ ...S.card, padding: 0, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>
              <th style={S.th}>JO</th><th style={S.th}>Approved Design</th><th style={S.th}>Product</th><th style={S.th}>Qty</th>
              <th style={S.th}>Order</th><th style={S.th}>Target</th><th style={S.th}>Status</th><th style={S.th}>Last Defect</th>
              <th style={{ ...S.th, textAlign: 'right' }}>QC Action</th>
            </tr></thead>
            <tbody>
              {loading ? (
                <TableSkeleton cols={9} rows={4} />
              ) : slice.length === 0 ? (
                <tr><td colSpan={9} style={{ padding: 0 }}><EmptyState message="Nothing to inspect" sub="Job orders appear here once production sends them For QC." /></td></tr>
              ) : slice.map(j => {
                const id = idOf(j); const busy = busyId === id;
                const risk = joRisk(j);
                return (
                  <tr key={id} style={S.tr}>
                    <td style={{ ...S.td, fontFamily: 'monospace', fontWeight: 600 }}>
                      {j.joId || '—'}
                      <RushBadge isRush={j.isRush} />
                    </td>
                    <td style={{ ...S.td, width: 60 }}>
                      <DesignPreview path={j.product?.thumbnail || j.designFilePath} />
                    </td>
                    <td style={S.td}>
                      {prodName(j)}
                      {j.designNotes && <div style={{ fontSize: 11, color: 'var(--gold)', marginTop: 2 }}>Note: {j.designNotes}</div>}
                    </td>
                    <td style={S.td}>{j.product?.quantity ?? '—'}</td>
                    <td style={{ ...S.td, fontFamily: 'monospace' }}>{j.orderId ? orderNo(j.orderId) : '—'}</td>
                    <td style={S.td}>
                      {fmtJODate(j.targetCompletion)}
                      {risk && <div style={{ marginTop: 3 }}><span style={{ ...S.badge, ...RISK_STYLE[risk.color], fontSize: 9, fontWeight: 700 }}>{risk.label}</span></div>}
                    </td>
                    <td style={S.td}><JobOrderStatusBadge status={j.joStatus} /></td>
                    <td style={{ ...S.td, color: 'var(--gray)', maxWidth: 220 }}>{j.qcResult?.defects || '—'}</td>
                    <td style={{ ...S.td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button disabled={busy}
                        onClick={() => {
                          const left = Math.max(0, (j.product?.quantity ?? 1) - (j.acceptedQty ?? 0));
                          setInspect(j); setAccepted(String(left)); setRejected('0'); setDisposition('rework'); setDefects('');
                          setScrapped(bomOf(j).map(c => String(c.inventoryId)));
                        }}
                        style={{ ...S.btnSm, background: 'var(--gold)' }}>
                        {busy ? 'Saving…' : 'Inspect'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <PaginationBar total={total} page={page} perPage={perPage} onPage={setPage} onPerPage={setPerPage} />

        {inspect && (() => {
          const ordered = inspect.product?.quantity ?? 1;
          const done    = inspect.acceptedQty ?? 0;
          const left    = Math.max(0, ordered - done);
          const acc     = parseInt(accepted, 10) || 0;
          const rej     = parseInt(rejected, 10) || 0;
          const over    = acc + rej > left;
          const nothing = acc + rej === 0;
          const needWhy = rej > 0 && defects.trim().length < 3;
          const proofs  = (inspect.designFilePaths?.length ? inspect.designFilePaths : [inspect.designFilePath]).filter(Boolean);
          const prodF   = inspect.productionFiles ?? [];
          const willPass = done + acc >= ordered;
          const noScrapPicked = rej > 0 && disposition === 'scrap' && scrapped.length === 0;
          const unaccounted   = Math.max(0, left - acc - rej);

          return (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 16 }}
              onClick={e => e.stopPropagation()}>
              <div style={{ ...S.card, width: 520, maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
                <h3 style={{ margin: '0 0 4px', fontSize: '15px', fontWeight: 700, color: 'var(--white)' }}>
                  Inspect {inspect.joId}
                </h3>
                <p style={{ margin: '0 0 12px', fontSize: '12px', color: 'var(--gray)' }}>
                  <strong style={{ color: 'var(--white)', fontSize: '13px' }}>{prodName(inspect)}</strong>
                  <br />{left} of {ordered} still to inspect
                  {done > 0 ? ` (${done} already accepted)` : ''}
                </p>

                {/* QC judges the output against what the customer approved, so both have to be here.
                    Sending an inspector to another screen to find them means they will not look. */}
                {proofs.length > 0 && (
                  <div style={{ marginBottom: 10 }}>
                    <div style={S.label}>Approved proof</div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                      {proofs.map((u, n) => <DesignPreview key={n} path={u} size={54} onOpen={showPreview} />)}
                    </div>
                  </div>
                )}
                {prodF.length > 0 && (
                  <div style={{ marginBottom: 10, fontSize: 11, color: 'var(--gray)' }}>
                    Printed from: {prodF.map(f => f.name).filter(Boolean).join(', ')}
                  </div>
                )}

                {/* Clamped as you type, not merely validated afterwards. `maxLength` counts characters,
                    so it happily allowed 1313 of a batch of 10 - and a field that lets you enter an
                    impossible number and then scolds you is worse than one that cannot. Each side is
                    capped by what the OTHER side leaves, so the pair can never exceed the batch. */}
                {/* Label above the field, not beside it. Inline, "PASSED" ran straight into its box
                    and read as one word; the counts are the thing being decided here, so they get the
                    room to be read at a glance. */}
                <div style={{ display: 'flex', gap: 14, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 8 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <label style={{ ...S.label, margin: 0 }}>Passed</label>
                    <input type="text" inputMode="numeric" placeholder="0" value={accepted}
                      onChange={e => {
                        const v = e.target.value.replace(/[^0-9]/g, '');
                        if (v === '') { setAccepted(''); return; }
                        const n = Math.min(parseInt(v, 10), left);
                        setAccepted(String(n)); setRejected(String(left - n));
                      }}
                      style={{ ...S.input, width: 96, textAlign: 'center', fontSize: 15, fontWeight: 700,
                        color: acc > 0 ? 'var(--st-green-fg)' : 'var(--white)' }} />
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <label style={{ ...S.label, margin: 0 }}>Rejected</label>
                    <input type="text" inputMode="numeric" placeholder="0" value={rejected}
                      onChange={e => {
                        const v = e.target.value.replace(/[^0-9]/g, '');
                        if (v === '') { setRejected(''); return; }
                        const n = Math.min(parseInt(v, 10), left);
                        setRejected(String(n)); setAccepted(String(left - n));
                      }}
                      style={{ ...S.input, width: 96, textAlign: 'center', fontSize: 15, fontWeight: 700,
                        color: rej > 0 ? 'var(--st-red-fg)' : 'var(--white)' }} />
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span style={{ ...S.label, margin: 0, visibility: 'hidden' }}>.</span>
                    <button type="button"
                      onClick={() => { setAccepted(String(left)); setRejected('0'); }}
                      style={{ ...S.btnSmGhost, height: 38 }}>
                      All {left} passed
                    </button>
                  </div>
                </div>

                <div style={{ fontSize: 11, color: unaccounted === 0 ? 'var(--st-green-fg)' : 'var(--st-red-fg)', marginBottom: 12 }}>
                  {unaccounted === 0
                    ? 'All outstanding units accounted for.'
                    : `${unaccounted} of ${left} unaccounted for - every unit must be passed or rejected.`}
                </div>

                {/* Restored: a layout edit of mine deleted this block, which left disposition stuck on
                    'rework' with no way to scrap. What happens to a reject decides what happens to the
                    material, so it cannot be inferred. */}
                {rej > 0 && (
                  <div style={{ marginBottom: 12, padding: 10, borderRadius: 8, border: '1px solid var(--border)' }}>
                    <label style={{ ...S.label, marginBottom: 6 }}>What happens to the {rej} reject{rej > 1 ? 's' : ''}?</label>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {[['rework', 'Rework'], ['scrap', 'Scrap']].map(([v, lbl]) => (
                        <button key={v} type="button" onClick={() => setDisposition(v)}
                          style={{ ...S.btnSmGhost,
                            borderColor: disposition === v ? 'var(--gold)' : 'var(--border)',
                            color: disposition === v ? 'var(--gold)' : 'var(--gray)',
                            fontWeight: disposition === v ? 700 : 500 }}>
                          {lbl}
                        </button>
                      ))}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--gray)', marginTop: 6, lineHeight: 1.5 }}>
                      {disposition === 'rework'
                        ? 'The item survives and is fixed - a smudge to clean, an edge to trim. Nothing leaves stock. A sublimation misprint is NOT reworkable: the ink is in the coating for good.'
                        : 'The item is ruined. Tick only what was actually destroyed - a misprinted mug loses the blank and the paper, but its box was never opened.'}
                    </div>

                    {disposition === 'scrap' && (
                      <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {bomOf(inspect).map(c => {
                          const id = String(c.inventoryId);
                          const on = scrapped.includes(id);
                          return (
                            <label key={id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: on ? 'var(--white)' : 'var(--gray)', cursor: 'pointer' }}>
                              <input type="checkbox" checked={on}
                                onChange={() => setScrapped(p => on ? p.filter(x => x !== id) : [...p, id])} />
                              <span style={{ flex: 1 }}>{c.name}</span>
                              <span style={{ color: on ? 'var(--st-red-fg)' : 'var(--border)', fontWeight: 700 }}>
                                -{Math.round((Number(c.qtyPerUnit) || 0) * rej)} {c.unit || ''}
                              </span>
                            </label>
                          );
                        })}
                        {scrapped.length === 0 && (
                          <div style={{ fontSize: 11, color: 'var(--st-red-fg)' }}>Tick at least one material that was lost.</div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                <label style={S.label}>{rej > 0 ? 'Defect details' : 'Notes (optional)'}</label>
                <textarea style={S.textarea} value={defects} maxLength={500}
                  onChange={e => setDefects(e.target.value.slice(0, 500))}
                  placeholder="What went wrong? (misprint, colour, alignment, smudge...)" />
                <div style={{ fontSize: 10.5, color: 'var(--gray)', textAlign: 'right', marginTop: 2 }}>
                  {defects.length}/500
                </div>

                {willPass && siblingsOpen(inspect).length > 0 && (
                  <div style={{ ...S.note, marginTop: 8, fontSize: 11 }}>
                    This job will be done, but the order still has {siblingsOpen(inspect).length} other job order(s)
                    open. It is only released for delivery once every one of them passes.
                  </div>
                )}

                <div style={{ fontSize: 11, color: 'var(--gray)', marginTop: 8 }}>
                  {willPass
                    ? `This completes the job. Material for ${acc} unit(s) is consumed.`
                    : `${acc} accepted, ${rej} rejected. The job goes back to Production to remake ${rej} unit(s), and comes back here when they are done.`}
                </div>

                {needWhy && <div style={{ fontSize: 11, color: 'var(--st-red-fg)', marginTop: 6 }}>Describe the defect - a count on its own cannot be acted on.</div>}

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
                  <button onClick={() => setInspect(null)} disabled={!!busyId} style={S.btnGhost}>Cancel</button>
                  <button
                    onClick={() => submitInspection(inspect, { accepted: acc, rejected: rej, disposition, defects, materials: scrapped })}
                    disabled={!!busyId || over || nothing || needWhy || noScrapPicked || unaccounted > 0}
                    style={{ ...S.btnSm, background: 'var(--gold)', color: '#1a1a1a', opacity: (over || nothing || needWhy || noScrapPicked || unaccounted > 0) ? 0.5 : 1 }}>
                    {busyId ? 'Submitting…' : 'Record inspection'}
                  </button>
                </div>
              </div>
            </div>
          );
        })()}
        {preview && <ImageLightbox url={preview.url} kind={preview.kind} onClose={() => setPreview(null)} />}
      </div>
    </ErrorBoundary>
  );
}
