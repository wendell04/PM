'use client';

// Settling a job order that was cancelled after work began.
//
// The order is cancelled in Orders, by whoever talks to the customer. What is physically left at the
// bench is only known on the shop floor, so the material is not settled there: it stays held, and the
// job order carries "settle materials" until production counts it here. What is still usable goes
// back on the shelf; the rest is written off as spoilage against this job. It is done once.

import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { fetchSettlePreview, settleMaterials } from '@/lib/jobOrderApi';
import { joDocId, fmtJODate } from '@/components/dashboard/JobOrderBits';
import { S, Modal, ConfirmModal } from '../../app/dashboard/business/inventory-v2/shared';

const STAGE_WORDS = {
  'In Progress': 'while it was being made',
  'QC_Pending':  'while it was waiting for QC',
  'QC_Failed':   'after it was sent back from QC',
};

const peso = (n) => `P${Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** The small chip a list shows on a cancelled job order that still owes a count, or has one. */
export function SettleChip({ jo, block = false }) {
  if (jo?.joStatus !== 'Cancelled') return null;
  const owed = !!jo.materialsToSettle;
  if (!owed && !jo.materialsSettledAt) return null;
  return (
    <span style={{
      ...S.badge, fontSize: 10, fontWeight: 700, marginTop: block ? 4 : 0, marginLeft: block ? 0 : 6,
      display: block ? 'inline-block' : undefined,
      background: owed ? 'var(--st-orange-bg, var(--gold-subtle))' : 'var(--dark2)',
      color: owed ? 'var(--st-orange-fg, var(--gold))' : 'var(--gray)',
      border: `1px solid ${owed ? 'color-mix(in srgb, var(--st-orange-fg, var(--gold)) 35%, transparent)' : 'var(--border)'}`,
    }}>
      {owed ? 'Settle materials' : 'Materials settled'}
    </span>
  );
}

export default function SettleMaterialsModal({ jo, open, onClose, onSettled, mayWork = true }) {
  const { token } = useAuth();
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr]         = useState('');
  const [usable, setUsable]   = useState({});
  const [missing, setMissing] = useState([]);
  const [confirm, setConfirm] = useState(false);
  const [saving, setSaving]   = useState(false);

  useEffect(() => {
    if (!open || !jo) return;
    let live = true;
    setLoading(true); setErr(''); setData(null); setUsable({}); setMissing([]); setConfirm(false);
    fetchSettlePreview(token, joDocId(jo))
      .then(d => { if (live) setData(d); })
      .catch(e => { if (live) setErr(e.message || 'Could not load the materials.'); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [open, jo, token]);

  if (!open || !jo) return null;

  const rows    = data?.materials ?? [];
  const settled = data && !data.toSettle && Array.isArray(data.settlement);
  const val     = (m) => usable[m.inventoryId];
  const usedOf  = (m) => (val(m) === '' || val(m) == null) ? null : Math.max(0, m.qty - Number(val(m)));
  const back    = rows.reduce((s, m) => s + (usedOf(m) == null ? 0 : m.qty - usedOf(m)), 0);
  const used    = rows.reduce((s, m) => s + (usedOf(m) ?? 0), 0);
  const value   = rows.reduce((s, m) => s + (usedOf(m) ?? 0) * Number(m.unitCost || 0), 0);

  const set = (m, v) => {
    const clean = v === '' ? '' : String(Math.max(0, Math.min(m.qty, parseInt(String(v).replace(/\D/g, ''), 10) || 0)));
    setUsable(p => ({ ...p, [m.inventoryId]: clean }));
    setMissing(p => p.filter(id => id !== m.inventoryId));
  };

  const review = () => {
    const gaps = rows.filter(m => val(m) === '' || val(m) == null).map(m => m.inventoryId);
    if (gaps.length) {
      setMissing(gaps);
      document.getElementById(`settle-${gaps[0]}`)?.focus();
      return;
    }
    setConfirm(true);
  };

  const submit = async () => {
    setSaving(true); setErr('');
    try {
      const body = Object.fromEntries(rows.map(m => [m.inventoryId, Number(val(m))]));
      await settleMaterials(token, joDocId(jo), body);
      setConfirm(false);
      onSettled?.();
      onClose?.();
    } catch (e) { setErr(e.message || 'Could not settle the materials.'); setConfirm(false); }
    finally { setSaving(false); }
  };

  const title = `${settled ? 'Materials settled' : 'Settle materials'} - ${jo.joId || ''}`;
  const item  = data ? `${data.itemName}${data.variantName ? ` - ${data.variantName}` : ''}${data.qty ? `, ${data.qty} pcs` : ''}` : '';

  return (
    <>
      <Modal open={open && !confirm} onClose={onClose} title={title} width={560}
        footer={settled || !mayWork || !rows.length
          ? <button onClick={onClose} style={S.btnGhost}>Close</button>
          : <>
              <button onClick={onClose} style={S.btnGhost} disabled={saving}>Not now</button>
              <button onClick={review} style={S.btnPrimary} disabled={saving || loading}>Review</button>
            </>}>
        {loading ? (
          <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--gray)', fontSize: 13 }}>Loading the materials</div>
        ) : err && !data ? (
          <div style={{ ...S.note, background: 'var(--st-red-bg)', borderColor: 'rgba(239,68,68,0.35)', color: 'var(--st-red-fg)' }}>{err}</div>
        ) : data && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ fontSize: 13, color: 'var(--gray-light)', lineHeight: 1.55 }}>
              <div style={{ fontWeight: 700, color: 'var(--white)', marginBottom: 4 }}>{item}</div>
              {settled ? (
                <>Settled by {jo.materialsSettledBy || 'staff'}{jo.materialsSettledAt ? ` on ${fmtJODate(jo.materialsSettledAt)}` : ''}.</>
              ) : (
                <>The order was cancelled {STAGE_WORDS[data.stage] ?? 'after work began'}. Count what is left at the bench:
                  what is <strong style={{ color: 'var(--white)' }}>still usable</strong> goes back on the shelf, the rest is recorded as used up against this job.</>
              )}
            </div>

            {!rows.length && <div style={S.note}>This job used no tracked materials. Nothing to count.</div>}

            {settled ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {data.settlement.map(r => (
                  <div key={r.inventoryId} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 13, padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 6 }}>
                    <span style={{ color: 'var(--white)', fontWeight: 600, minWidth: 0 }}>{r.name}</span>
                    <span style={{ color: 'var(--gray)', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{r.usable} back · {r.used} used up</span>
                  </div>
                ))}
              </div>
            ) : rows.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {rows.map(m => {
                  const u = usedOf(m);
                  const miss = missing.includes(m.inventoryId);
                  return (
                    <div key={m.inventoryId} style={{ border: `1px solid ${miss ? 'var(--st-red-fg)' : 'var(--border)'}`, borderRadius: 8, padding: '10px 12px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px 12px' }}>
                      <div style={{ flex: '1 1 180px', minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--white)' }}>{m.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--gray)', marginTop: 2 }}>
                          {m.costOnly ? `${m.qty} ${m.uom || ''} needed · cost only, taken from the shelf as used` : `${m.qty} ${m.uom || ''} held for this job`}
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <label htmlFor={`settle-${m.inventoryId}`} style={{ fontSize: 11, color: 'var(--gray)', whiteSpace: 'nowrap' }}>Still usable</label>
                        <input id={`settle-${m.inventoryId}`} inputMode="numeric" maxLength={7} value={val(m) ?? ''}
                          onChange={e => set(m, e.target.value)} disabled={!mayWork}
                          style={{ ...S.input, width: 70, textAlign: 'right', fontVariantNumeric: 'tabular-nums', ...(miss ? { borderColor: 'var(--st-red-fg)' } : {}) }} />
                        <button type="button" onClick={() => set(m, m.qty)} disabled={!mayWork} style={S.btnSmGhost}>All</button>
                        <button type="button" onClick={() => set(m, 0)} disabled={!mayWork} style={S.btnSmGhost}>None</button>
                      </div>
                      <div style={{ flexBasis: '100%', fontSize: 11, color: u ? 'var(--st-red-fg)' : 'var(--gray)', fontVariantNumeric: 'tabular-nums' }}>
                        {u == null ? (miss ? 'Enter how many are still usable (0 if none).' : 'Not counted yet') : u === 0 ? 'Nothing used up' : `${u} used up${Number(m.unitCost) ? ` (${peso(u * m.unitCost)})` : ''}`}
                      </div>
                    </div>
                  );
                })}
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', fontSize: 12, color: 'var(--gray-light)', paddingTop: 4, fontVariantNumeric: 'tabular-nums' }}>
                  <span>Back on the shelf: <strong style={{ color: 'var(--white)' }}>{back}</strong></span>
                  <span>Used up: <strong style={{ color: used ? 'var(--st-red-fg)' : 'var(--white)' }}>{used}</strong>{value ? ` · ${peso(value)}` : ''}</span>
                </div>
                {!mayWork && <div style={{ fontSize: 12, color: 'var(--gray)' }}>Production settles this. You can see it but not count it.</div>}
              </div>
            )}
            {err && data && <div style={{ ...S.note, background: 'var(--st-red-bg)', borderColor: 'rgba(239,68,68,0.35)', color: 'var(--st-red-fg)' }}>{err}</div>}
          </div>
        )}
      </Modal>

      <ConfirmModal open={confirm} onClose={() => setConfirm(false)} onConfirm={submit} loading={saving}
        confirmStyle="primary" confirmLabel="Settle" title={`Settle ${jo.joId || 'this job'}?`}
        message={[
          ...rows.map(m => `${m.name}: ${m.qty - (usedOf(m) ?? 0)} back, ${usedOf(m) ?? 0} used up`),
          '',
          `Used up: ${used}${value ? ` (${peso(value)})` : ''}, recorded as spoilage on this job and against your name.`,
          'This is done once and cannot be changed.',
        ].join('\n')} />
    </>
  );
}
