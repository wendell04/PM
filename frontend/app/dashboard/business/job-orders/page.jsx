'use client';

import React from 'react';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import ProofGallery from '@/components/shop/ProofGallery';
import ImageLightbox from '@/components/shop/ImageLightbox';
import ErrorBoundary from '@/components/ErrorBoundary';
import {
  fetchJobOrders,
  createJobOrdersBatch,
  uploadProductionFiles,
  deleteProductionFile,
  updateJobOrder,
  deleteJobOrder,
} from '@/lib/jobOrderApi';
import { fetchAllOrders } from '@/lib/ordersApi';
import { normalizeStatus } from '@/lib/orderStatus';
import { orderNo } from '@/lib/orderNumber';
import { joRisk, RISK_STYLE } from '@/lib/deliveryRisk';
import { JO_BADGE, JO_STATUSES, JobOrderStatusBadge as StatusBadge, RushBadge, DesignPreview, designUrl, joDocId, fmtJODate, TableSkeleton } from '@/components/dashboard/JobOrderBits';
import { S, ICONS, SearchBar, SummaryCard, PaginationBar, EmptyState, usePagination, CustomSelect } from '../inventory-v2/shared';

// Backward-scheduling buffers: the JO must FINISH before the delivery promise, leaving room to QC,
// pack, and ship. Target = (customer need-by || delivery promise) - shipping transit - QC/pack.
// Sensible e-commerce defaults; wire to Settings later if the owner wants to tune them.
const SHIP_BUFFER_DAYS = 2;   // courier transit
const QC_PACK_DAYS     = 1;   // QC + packing slack before hand-off

// Manager hub for Job Orders - create (from a paid + design-approved order), schedule, oversee.
// Production staff work them in Production; QC staff inspect them in Quality Control.
// The status map, date formatter and artwork preview are shared with those two screens.

const EMPTY_FORM = {
  orderId: '',
  targetCompletion: '', isRush: false, notes: '',
};

const fmtDate = fmtJODate;

const toYmd = (d) => {
  const z = new Date(d);
  if (isNaN(z)) return '';
  return `${z.getFullYear()}-${String(z.getMonth() + 1).padStart(2, '0')}-${String(z.getDate()).padStart(2, '0')}`;
};
// Walk back N business days (skip Sundays; Saturday is a work day here - mirrors OrderController).
const subtractBizDays = (from, days) => {
  const d = new Date(from);
  let left = days;
  while (left > 0) { d.setDate(d.getDate() - 1); if (d.getDay() !== 0) left--; }
  return d;
};
const addBizDays = (from, days) => {
  const d = new Date(from);
  let left = days;
  while (left > 0) { d.setDate(d.getDate() + 1); if (d.getDay() !== 0) left--; }
  return d;
};
// Backward-schedule the production deadline from the order's delivery promise (or the customer's
// need-by date, which wins). Returns the ymd date plus a human breakdown for the modal.
function deriveTarget(order) {
  const anchorRaw = order?.needByDate || order?.estimatedDeliveryMax || null;
  const anchorLabel = order?.needByDate ? 'Customer need-by' : (order?.estimatedDeliveryMax ? 'Delivery promise' : null);
  const anchor = anchorRaw ? new Date(anchorRaw) : null;
  if (!anchor || isNaN(anchor)) {
    return { date: toYmd(addBizDays(new Date(), 3)), anchor: null, anchorLabel: null, fallback: true };
  }
  const target = subtractBizDays(anchor, SHIP_BUFFER_DAYS + QC_PACK_DAYS);
  return { date: toYmd(target), anchor: toYmd(anchor), anchorLabel, fallback: false };
}

// ─── Order-item classification (what needs a Job Order) ───
const itmName    = (it) => it?.productName ?? it?.product_name ?? it?.name ?? 'Item';
const itmVariant = (it) => it?.variantName ?? it?.variant ?? null;
const itmQty     = (it) => Number(it?.qty ?? it?.quantity ?? 1);
const itmProductId = (it) => it?.productId ?? it?.product_id ?? null;
const itmVariantId = (it) => it?.variantId ?? it?.variant_id ?? null;
const isPrintable  = (it) => !!(it?.isCustom || it?.isMadeToOrder);       // needs a production run
const itmNeedsDesign = (it) => !!it?.isCustom && !!(it?.designRequested || it?.designFiles?.length || it?.designUrl);
const itmType = (it) => it?.designRequested ? 'REQUEST'
  : ((it?.designFiles?.length || it?.designUrl) ? 'UPLOAD'
  : (it?.isMadeToOrder ? 'MADE-TO-ORDER' : 'READY-MADE'));
// Producible only when THIS item's artwork is approved. If per-item design tracking is active
// (the item carries its own designStatus), it must read 'approved' - an item still being designed
// can never be selected even if the order-level aggregate says approved (defends against a stale or
// wrongly-aggregated order designStatus). Legacy items with no per-item field fall back to the
// order-level status; items that need no design (plain made-to-order) are always producible.
const itmApproved = (it, order) => {
  if (!itmNeedsDesign(it)) return true;
  if (it?.designStatus) return it.designStatus === 'approved';
  return order?.designStatus === 'approved';
};
// The artwork the shop floor prints for THIS item: owner proof wins, else the customer's file.
function itmDesignFiles(it, order, idx) {
  const proof = it?.adminDesignUrl ? [it.adminDesignUrl]
    : (order?.adminDesignUrls?.[idx] ? [order.adminDesignUrls[idx]]
    : (order?.adminDesignUrl && idx === 0 ? [order.adminDesignUrl] : []));
  const cust = it?.designFiles?.length ? it.designFiles.map(f => f.url)
    : (it?.designUrl ? [it.designUrl] : []);
  return (proof.length ? proof : cust).filter(Boolean);
}

const PREVIEWABLE_IMG = /\.(jpe?g|png|webp|gif|avif|svg)(\?|$)/i;
const PREVIEWABLE_VID = /\.(mp4|webm|mov|m4v|ogg)(\?|$)/i;

/** null when the browser has nothing useful to show inline - the caller should open a new tab. */
function previewKind(url) {
  if (!url) return null;
  if (PREVIEWABLE_VID.test(url)) return 'video';
  if (PREVIEWABLE_IMG.test(url)) return 'image';
  return null;
}

const TYPE_BADGE = {
  'REQUEST':       { bg: 'var(--st-purple-bg)', fg: 'var(--st-purple-fg)' },
  'UPLOAD':        { bg: 'var(--st-blue-bg)',   fg: 'var(--st-blue-fg)' },
  'MADE-TO-ORDER': { bg: 'var(--gold-subtle)',  fg: 'var(--gold)' },
  'READY-MADE':    { bg: 'var(--dark2)',        fg: 'var(--gray)' },
};

// Small pill used in the order-context header.
function Pill({ label, value, tone = 'gray' }) {
  const map = {
    green: { bg: 'var(--st-green-bg)', fg: 'var(--st-green-fg)' },
    gold:  { bg: 'var(--gold-subtle)', fg: 'var(--gold)' },
    blue:  { bg: 'var(--st-blue-bg)',  fg: 'var(--st-blue-fg)' },
    red:   { bg: 'var(--st-red-bg)',   fg: 'var(--st-red-fg)' },
    gray:  { bg: 'var(--dark2)',       fg: 'var(--gray)' },
  }[tone] || {};
  return (
    <span style={{ display: 'inline-flex', gap: 6, alignItems: 'baseline', padding: '4px 10px', borderRadius: 999, background: map.bg, fontSize: 11 }}>
      <span style={{ color: 'var(--gray)', textTransform: 'uppercase', letterSpacing: '.4px', fontWeight: 700, fontSize: 9 }}>{label}</span>
      <span style={{ color: map.fg, fontWeight: 700 }}>{value}</span>
    </span>
  );
}

// ─── Create / Edit form ───────────────────────────────────
function JobOrderForm({ initial = EMPTY_FORM, isEdit = false, orders = [], ordersLoading = false, onSubmit, onCancel, isSubmitting, submitError, editingJo = null, onArtworkChanged, onPreview }) {
  const [form, setForm] = useState(initial);
  const [errors, setErrors] = useState({});
  const [selected, setSelected] = useState({});   // create only: { [itemIndex]: bool }
  // Print-ready artwork staged per item, attached right after the job orders are created. Making the
  // owner create first and then re-open each job order to attach was two extra steps for something
  // they already have in hand at this point - and the checklist is the only place where which file
  // belongs to which product is unambiguous.
  const [artworkByItem, setArtworkByItem] = useState({});   // { [itemIndex]: File[] }
  const [notesByItem, setNotesByItem]     = useState({});   // { [itemIndex]: string }
  const [override, setOverride] = useState(false); // create only: manual date override

  useEffect(() => { setForm(initial); setErrors({}); setSelected({}); setOverride(false); }, [initial]);

  const set = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }));
    setErrors(prev => ({ ...prev, [field]: '' }));
  };

  const selectedOrder = orders.find(o => String(o.id ?? o._id) === String(form.orderId));
  const orderItems = selectedOrder?.items ?? [];
  const derived = selectedOrder ? deriveTarget(selectedOrder) : null;

  // When an order is picked: auto-fill the backward-scheduled date + rush flag, and pre-select
  // every item that can actually be produced (printable + design approved).
  useEffect(() => {
    if (isEdit || !selectedOrder) return;
    const d = deriveTarget(selectedOrder);
    const rush = !!(selectedOrder.isRush || selectedOrder.rushStatus === 'accepted' || selectedOrder.rushStatus === 'requested');
    setForm(prev => ({ ...prev, targetCompletion: d.date, isRush: rush }));
    setOverride(false);
    const pre = {};
    orderItems.forEach((it, i) => { if (isPrintable(it) && itmApproved(it, selectedOrder)) pre[i] = true; });
    setSelected(pre);
    setErrors({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.orderId]);

  const chosenIdxs = Object.keys(selected).filter(k => selected[k]).map(Number);

  // The approved proof set for the order. A grouped design request puts the same files on every line
  // it covers, so this is one set for the order rather than one per item - dedupe and show it once.
  const approvedProofs = (() => {
    const out = [];
    const seen = new Set();
    (selectedOrder?.items ?? []).forEach((it, i) => {
      const urls = it?.adminDesignUrls?.length ? it.adminDesignUrls
        : (selectedOrder?.adminDesignUrls?.length ? selectedOrder.adminDesignUrls
        : (it?.adminDesignUrl ? [it.adminDesignUrl] : []));
      urls.filter(Boolean).forEach(u => { if (!seen.has(u)) { seen.add(u); out.push(u); } });
    });
    return out;
  })();

  const validate = () => {
    const e = {};
    if (isEdit) {
      if (!form.joStatus) e.joStatus = 'Status is required.';
      // Target date is optional on edit - a status-only change (e.g. mark In Progress) must not be
      // blocked just because a legacy JO never had a date.
      return e;
    }
    if (!form.orderId) e.orderId = 'Please select an order.';
    else if (chosenIdxs.length === 0) e.items = 'Select at least one item to produce.';
    if (!form.targetCompletion) e.targetCompletion = 'Target completion date is required.';
    return e;
  };

  const handleSubmit = () => {
    const e = validate();
    if (Object.keys(e).length > 0) { setErrors(e); return; }
    if (isEdit) {
      onSubmit({ joStatus: form.joStatus, isRush: form.isRush, notes: form.notes || '',
        ...(form.targetCompletion ? { targetCompletion: form.targetCompletion } : {}) });
      return;
    }
    const items = chosenIdxs.map(i => {
      const it = orderItems[i];
      return { itemIndex: i, notes: (notesByItem[i] ?? '').trim() || undefined, product: { name: itmName(it), variant: itmVariant(it), quantity: itmQty(it), productId: itmProductId(it), variantId: itmVariantId(it) } };
    });
    // The files travel separately from the payload: they can only be uploaded once each job order has
    // an id, so the page attaches them immediately after the batch is created.
    const artwork = {};
    chosenIdxs.forEach(i => { if (artworkByItem[i]?.length) artwork[i] = artworkByItem[i]; });
    onSubmit({ orderId: form.orderId, items, targetCompletion: form.targetCompletion, isRush: form.isRush, notes: form.notes || '' }, artwork);
  };

  // ── Order context header (gates at a glance) ──
  const isCOD = (selectedOrder?.paymentMethod || '').toLowerCase() === 'cod';
  const payTone = isCOD ? 'gold' : (selectedOrder?.paymentStatus === 'paid' ? 'green' : 'gold');
  const payLabel = isCOD ? 'COD'
    : selectedOrder?.paymentStatus === 'paid' ? 'FULLY PAID'
    : (Number(selectedOrder?.downPayment) > 0 || selectedOrder?.paymentStatus === 'partial') ? 'DP PAID' : 'UNPAID';
  const designApproved = selectedOrder?.designStatus === 'approved' || !selectedOrder?.isCustomOrder;

  return (
    <div style={{ display: 'grid', gap: '14px' }}>
      {isEdit ? (
        <>
          <div>
            <label style={S.label}>Status *</label>
            <CustomSelect value={form.joStatus || ''} onChange={v => set('joStatus', v)} disabled={isSubmitting} error={!!errors.joStatus} style={{ width: '100%' }}
              options={JO_STATUSES.map(s => ({ value: s, label: JO_BADGE[s]?.label ?? s }))} />
            {errors.joStatus && <span style={S.errText}>{errors.joStatus}</span>}
          </div>
          <div>
            <label style={S.label}>Target completion *</label>
            <input style={errors.targetCompletion ? S.inputErr : S.input} type="date" value={form.targetCompletion} onChange={e => set('targetCompletion', e.target.value)} disabled={isSubmitting} />
            {errors.targetCompletion && <span style={S.errText}>{errors.targetCompletion}</span>}
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '13px', fontWeight: 600, color: 'var(--white)', cursor: 'pointer' }}>
            <input type="checkbox" checked={form.isRush} onChange={e => set('isRush', e.target.checked)} disabled={isSubmitting} style={{ width: 16, height: 16, accentColor: 'var(--gold)' }} />
            Rush order
            {form.isRush && <span style={{ ...S.badge, background: 'var(--st-red-bg)', color: 'var(--st-red-fg)', border: '1px solid #fecaca', fontSize: '10px' }}>RUSH</span>}
          </label>
        </>
      ) : (
        <>
          {/* 1 - pick the order */}
          <div>
            <label style={S.label}>Order *</label>
            <CustomSelect
              value={form.orderId}
              onChange={v => set('orderId', v)}
              disabled={isSubmitting || ordersLoading}
              error={!!errors.orderId}
              placeholder={ordersLoading ? 'Loading orders…' : '- Select a paid, approved order -'}
              style={{ width: '100%' }}
              emptyLabel={ordersLoading ? 'Loading orders…' : 'No paid, design-approved orders are waiting for production yet.'}
              options={orders.map(o => ({ value: o.id ?? o._id, label: `${orderNo(o)}${o.customerName ? ` - ${o.customerName}` : ''}` }))}
            />
            {errors.orderId && <span style={S.errText}>{errors.orderId}</span>}
          </div>

          {selectedOrder && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: '10px 12px', background: 'var(--dark2)', borderRadius: 8, border: '1px solid var(--border)' }}>
              <Pill label="Payment" value={payLabel} tone={payTone} />
              <Pill label="Design" value={designApproved ? 'APPROVED' : (selectedOrder?.designStatus || 'PENDING').toUpperCase()} tone={designApproved ? 'green' : 'red'} />
              <Pill label="Delivery" value={fmtDate(selectedOrder.needByDate || selectedOrder.estimatedDeliveryMax)} tone="blue" />
              {(selectedOrder.isRush || selectedOrder.rushStatus) && <Pill label="Rush" value={(selectedOrder.rushStatus || 'requested').toUpperCase()} tone="red" />}
            </div>
          )}

          {/* 2 - item checklist: one JO per selected item; ready-made greyed out */}
          {selectedOrder && (
            <div>
              <div style={{ ...S.rowBetween, marginBottom: 6 }}>
                <label style={{ ...S.label, margin: 0 }}>Items to produce *</label>
                <span style={{ fontSize: 11, color: 'var(--gray)' }}>one job order per item</span>
              </div>
              {approvedProofs.length > 0 && (
                <div style={{ marginBottom: 10, padding: 10, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--dark2)' }}>
                  <div style={{ fontSize: 11, color: 'var(--gray)', marginBottom: 6 }}>
                    <span style={{ color: 'var(--white)', fontWeight: 600 }}>Approved design</span>
                    {' - what the customer signed off. Click to view full size.'}
                  </div>
                  <ProofGallery urls={approvedProofs} tiles compact onOpen={(u) => onPreview?.(u)} />
                </div>
              )}

              <div style={{ display: 'grid', gap: 8 }}>
                {orderItems.length === 0 && <div style={{ fontSize: 12, color: 'var(--gray)' }}>This order has no items.</div>}
                {orderItems.map((it, i) => {
                  const printable = isPrintable(it);
                  const approved = itmApproved(it, selectedOrder);
                  const disabled = isSubmitting || !printable || !approved;
                  const files = itmDesignFiles(it, selectedOrder, i);
                  const type = itmType(it);
                  const tb = TYPE_BADGE[type] || TYPE_BADGE['READY-MADE'];
                  const checked = !!selected[i];
                  return (
                    <React.Fragment key={i}>
                    <label style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '10px 12px', borderRadius: 8, cursor: disabled ? 'not-allowed' : 'pointer',
                      background: checked ? 'var(--gold-subtle)' : 'var(--dark2)', border: `1px solid ${checked ? 'rgba(212,168,67,0.4)' : 'var(--border)'}`, opacity: printable ? 1 : 0.55 }}>
                      <input type="checkbox" checked={checked} disabled={disabled}
                        onChange={e => { setSelected(p => ({ ...p, [i]: e.target.checked })); setErrors(p => ({ ...p, items: '' })); }}
                        style={{ width: 16, height: 16, accentColor: 'var(--gold)', flexShrink: 0 }} />
                      {/* The PRODUCT, not the proof. A grouped design request puts the same proof on
                          every line it covers, so using it here drew the identical thumbnail beside a
                          mug and a totebag - the one place the rows have to be told apart. */}
                      {it.thumbnail
                        ? <DesignPreview path={it.thumbnail} size={44} />
                        : files.length > 0
                          ? <DesignPreview path={files[0]} size={44} />
                          : <div style={{ width: 44, height: 44, borderRadius: 6, border: '1px dashed var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: 'var(--gray)', flexShrink: 0 }}>no art</div>}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--white)', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          {itmName(it)}{itmVariant(it) ? ` - ${itmVariant(it)}` : ''}
                          <span style={{ ...S.badge, background: tb.bg, color: tb.fg, fontSize: 9, border: 'none' }}>{type}</span>
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--gray)', marginTop: 2 }}>
                          Qty {itmQty(it)}
                          {!printable && ' · from stock, no job order'}
                          {printable && !approved && ' · awaiting design approval'}
                          {printable && approved && files.length > 1 && ` · ${files.length} files`}
                        </div>
                      </div>
                    </label>
                    {checked && printable && approved && (
                      <div style={{ margin: '-4px 0 4px 34px', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <input id={`art_${i}`} type="file" multiple disabled={isSubmitting}
                          onChange={e => {
                            const picked = Array.from(e.target.files ?? []);
                            e.target.value = '';
                            if (picked.length) setArtworkByItem(p => ({ ...p, [i]: [...(p[i] ?? []), ...picked] }));
                          }}
                          style={{ display: 'none' }} />
                        <label htmlFor={`art_${i}`}
                          style={{ ...S.btnSmGhost, cursor: isSubmitting ? 'not-allowed' : 'pointer', fontSize: 11, padding: '3px 8px' }}>
                          {(artworkByItem[i]?.length ?? 0) > 0 ? '+ Add print file' : '+ Print-ready file'}
                        </label>
                        {(artworkByItem[i] ?? []).map((f, fi) => (
                          <span key={`${f.name}_${fi}`} style={{ fontSize: 11, color: 'var(--gray)', display: 'inline-flex', alignItems: 'center', gap: 4, background: 'var(--dark2)', border: '1px solid var(--border)', borderRadius: 5, padding: '2px 6px' }}>
                            {f.name}
                            <button type="button" title="Remove"
                              onClick={() => setArtworkByItem(p => ({ ...p, [i]: p[i].filter((_, x) => x !== fi) }))}
                              style={{ border: 'none', background: 'transparent', color: 'var(--gray)', cursor: 'pointer', fontSize: 12, lineHeight: 1, padding: 0 }}>
                              &times;
                            </button>
                          </span>
                        ))}
                        {(artworkByItem[i]?.length ?? 0) === 0 && (
                          <span style={{ fontSize: 10.5, color: 'var(--gray)' }}>
                            optional now - the proof above is a mockup, production needs the print file
                          </span>
                        )}
                        <input type="text" maxLength={200} disabled={isSubmitting}
                          value={notesByItem[i] ?? ''}
                          onChange={e => setNotesByItem(p => ({ ...p, [i]: e.target.value }))}
                          placeholder={`Note for this job order - e.g. ${itmName(it).toLowerCase().includes('mug') ? 'mirrored, 180C 60s' : 'centre 3in from top seam'}`}
                          style={{ ...S.input, fontSize: 11, padding: '4px 8px', width: '100%' }} />
                      </div>
                    )}
                  </React.Fragment>
                  );
                })}
              </div>
              {errors.items && <span style={S.errText}>{errors.items}</span>}
            </div>
          )}

          {/* 3 - auto-derived target completion (backward-scheduled from the delivery promise) */}
          {selectedOrder && derived && (
            <div style={{ ...S.cardSm, background: 'var(--dark2)' }}>
              <div style={{ ...S.rowBetween, alignItems: 'flex-start' }}>
                <div>
                  <div style={{ ...S.label, marginBottom: 2 }}>Target completion (production deadline)</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--white)' }}>{fmtDate(form.targetCompletion)}</div>
                  <div style={{ fontSize: 11, color: 'var(--gray)', marginTop: 4 }}>
                    {derived.fallback
                      ? 'No delivery date on this order yet - defaulted to 3 business days. Set the date in Orders to schedule from the promise.'
                      : `${derived.anchorLabel} ${fmtDate(derived.anchor)}  -  transit ${SHIP_BUFFER_DAYS}d  -  QC/pack ${QC_PACK_DAYS}d`}
                  </div>
                </div>
                {!derived.fallback && <span style={{ ...S.badge, background: 'var(--st-green-bg)', color: 'var(--st-green-fg)', border: 'none', fontSize: 9 }}>AUTO</span>}
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--gray)', cursor: 'pointer', marginTop: 10 }}>
                <input type="checkbox" checked={override} onChange={e => { setOverride(e.target.checked); if (!e.target.checked && derived) set('targetCompletion', derived.date); }} disabled={isSubmitting} style={{ width: 15, height: 15, accentColor: 'var(--gold)' }} />
                Override date manually
              </label>
              {override && (
                <input style={{ ...S.input, marginTop: 8 }} type="date" value={form.targetCompletion} onChange={e => set('targetCompletion', e.target.value)} disabled={isSubmitting} />
              )}
              {errors.targetCompletion && <span style={S.errText}>{errors.targetCompletion}</span>}
            </div>
          )}

          {/* 4 - rush: read-only, inherited from the order's confirmed rush status */}
          {selectedOrder && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ ...S.label, margin: 0 }}>Rush</span>
              {form.isRush
                ? <span style={{ ...S.badge, background: 'var(--st-red-bg)', color: 'var(--st-red-fg)', border: '1px solid #fecaca', fontSize: 10 }}>RUSH · from order</span>
                : <span style={{ ...S.badge, background: 'var(--dark2)', color: 'var(--gray)', border: '1px solid var(--border)', fontSize: 10 }}>Standard order</span>}
            </div>
          )}
        </>
      )}

      {isEdit && editingJo && (
        <ProductionArtwork jo={editingJo} onChanged={onArtworkChanged} onPreview={onPreview} />
      )}

      <div>
        <label style={S.label}>{isEdit ? 'Notes' : 'Notes for every job order'}</label>
        <textarea style={S.textarea} value={form.notes} onChange={e => set('notes', e.target.value)}
          placeholder={isEdit ? 'Production notes…' : 'Applies to all of them - anything item-specific goes on the item above.'}
          disabled={isSubmitting} />
      </div>

      {submitError && <div style={{ ...S.note, background: 'var(--st-red-bg)', borderColor: 'rgba(239,68,68,0.35)', color: 'var(--st-red-fg)' }}>{submitError}</div>}

      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', alignItems: 'center' }}>
        {!isEdit && chosenIdxs.length > 0 && <span style={{ fontSize: 12, color: 'var(--gray)', marginRight: 'auto' }}>Creating {chosenIdxs.length} job order{chosenIdxs.length > 1 ? 's' : ''}</span>}
        <button onClick={onCancel} disabled={isSubmitting} style={S.btnGhost}>Cancel</button>
        <button onClick={handleSubmit} disabled={isSubmitting} style={S.btnPrimary}>
          {isSubmitting ? 'Saving…' : isEdit ? 'Update' : `Create ${chosenIdxs.length > 1 ? `${chosenIdxs.length} JOs` : 'Job Order'}`}
        </button>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────
export default function JobOrdersPage() {
  const { token } = useAuth();
  const router = useRouter();

  const [jobOrders, setJobOrders] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [rushFilter, setRushFilter] = useState('');
  const [search, setSearch] = useState('');

  const [modal, setModal] = useState(null);
  const [selected, setSelected] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const [orders, setOrders] = useState([]);
  const [ordersLoading, setOrdersLoading] = useState(false);


  const loadJobOrders = useCallback(async () => {
    if (!token) { setIsLoading(false); return; }
    setIsLoading(true); setError(null);
    try {
      const f = {};
      if (statusFilter) f.status = statusFilter;
      if (rushFilter !== '') f.isRush = rushFilter === 'true';
      const data = await fetchJobOrders(token, f);
      setJobOrders(Array.isArray(data) ? data : []);
    } catch (err) {
      if (err.message === 'Unauthorized') { router.push('/'); return; }
      setError(err.message || 'Failed to load job orders.');
    } finally { setIsLoading(false); }
  }, [token, statusFilter, rushFilter, router]);

  useEffect(() => { loadJobOrders(); }, [loadJobOrders]);

  const loadOrders = useCallback(async () => {
    if (!token) return;
    setOrdersLoading(true);
    try {
      const data = await fetchAllOrders(token, { limit: 200 });
      const raw = Array.isArray(data) ? data : (data?.data ?? data?.orders ?? []);
      setOrders(raw);
    } catch { setOrders([]); }
    finally { setOrdersLoading(false); }
  }, [token]);


  // Preview state for the page. Sits here rather than in the form so the create checklist and the
  // production-artwork panel share one viewer.
  const [preview, setPreview] = useState(null);   // { url, kind }
  const showPreview = (url) => {
    const kind = previewKind(url);
    if (!kind) { window.open(url, '_blank', 'noopener'); return; }
    setPreview({ url, kind });
  };

  const openCreate = () => { setSelected(null); setSubmitError(''); loadOrders(); setModal('create'); };
  const openEdit = (jo) => { setSelected(jo); setSubmitError(''); setModal('edit'); };
  const closeModal = () => { setModal(null); setSelected(null); setSubmitError(''); };

  const handleCreate = async (payload, artworkByItem = {}) => {
    setIsSubmitting(true); setSubmitError('');
    try {
      const created = await createJobOrdersBatch(token, payload);

      // Attach each item's print-ready file to ITS job order. Matched on itemIndex - the order of the
      // created rows is not something to rely on. A failure here must not read as "nothing happened":
      // the job orders exist either way, so it reports which ones missed their artwork.
      const list = Array.isArray(created) ? created : (created?.data ?? []);
      const failed = [];
      for (const [idx, files] of Object.entries(artworkByItem)) {
        const jo = list.find(j => String(j.itemIndex) === String(idx));
        if (!jo || !files?.length) continue;
        try { await uploadProductionFiles(token, joDocId(jo), files); }
        catch { failed.push(jo.joId || `item ${idx}`); }
      }

      await loadJobOrders();
      if (failed.length) {
        setSubmitError(`Job orders created, but the print file did not upload for: ${failed.join(', ')}. Attach it from the job order.`);
        return;
      }
      closeModal();
    }
    catch (err) { setSubmitError(err.message || 'Failed to create job orders.'); }
    finally { setIsSubmitting(false); }
  };

  const handleUpdate = async (payload) => {
    if (!selected) return;
    setIsSubmitting(true); setSubmitError('');
    try { await updateJobOrder(token, joDocId(selected), payload); await loadJobOrders(); closeModal(); }
    catch (err) { setSubmitError(err.message || 'Failed to update job order.'); }
    finally { setIsSubmitting(false); }
  };

  // Delete is guarded (server + here) to Queued/Cancelled JOs - test/junk cleanup only. Anything that
  // started production must be Cancelled (soft) to keep its inventory + QC history.
  const [deleting, setDeleting] = useState(null); // the JO pending a delete confirm
  const [deleteErr, setDeleteErr] = useState('');
  const canDelete = (jo) => ['Queued', 'Cancelled'].includes(jo.joStatus);
  const confirmDelete = async () => {
    if (!deleting) return;
    setIsSubmitting(true); setDeleteErr('');
    try { await deleteJobOrder(token, joDocId(deleting)); await loadJobOrders(); setDeleting(null); }
    catch (err) { setDeleteErr(err.message || 'Failed to delete job order.'); }
    finally { setIsSubmitting(false); }
  };

  const prodName = (jo) => `${jo.product?.name ?? 'Item'}${jo.product?.variant ? ` - ${jo.product.variant}` : ''}`;

  // Only orders that can actually be produced: not already job-ordered, not finished/cancelled,
  // paid (DP/partial/paid or COD), and - for custom - past the design-approval stage.
  // (Custom orders carry their design state in orderStatus until Phase 1b separates it.)
  const PRE_APPROVAL = ['pending_review', 'pending_design', 'proof_sent', 'revision_requested', 'rejected'];
  const eligibleOrders = orders.filter(o => {
    if (o.joId) return false;
    const st = normalizeStatus(o.orderStatus);
    if (['delivered', 'cancelled', 'returned'].includes(st)) return false;
    const isCOD = (o.paymentMethod || '').toLowerCase() === 'cod';
    const paid = isCOD || ['partial', 'paid'].includes(o.paymentStatus) || Number(o.downPayment) > 0;
    if (!paid) return false;
    const isCustom = o.isCustomOrder ?? o.isCustom;
    const rawStatus = String(o.orderStatus || '').toLowerCase().replace(/[\s-]+/g, '_');
    if (isCustom && PRE_APPROVAL.includes(rawStatus)) return false;
    // designStatus is the real artwork gate (mirrors JobOrderController Gate 2). Only a custom
    // order whose design is approved may be produced - keeps this list from showing orders that
    // would then fail on Create Job Order.
    if (isCustom && o.designStatus && o.designStatus !== 'approved') return false;
    // Must need a production run: customizable or made-to-order. Ready-made stocked items (e.g. a
    // plain Scrunchie) ship from stock - no Job Order. Material is still deducted at order time.
    if (!(o.items || []).some(it => it.isCustom || it.isMadeToOrder)) return false;
    return true;
  });

  const counts = {
    total:      jobOrders.length,
    queued:     jobOrders.filter(j => j.joStatus === 'Queued').length,
    inProgress: jobOrders.filter(j => j.joStatus === 'In Progress').length,
    forQc:      jobOrders.filter(j => j.joStatus === 'QC_Pending').length,
    completed:  jobOrders.filter(j => ['Completed', 'QC_Passed'].includes(j.joStatus)).length,
  };

  const filtered = jobOrders.filter(jo => {
    const q = search.toLowerCase();
    return !q || prodName(jo).toLowerCase().includes(q) || (jo.joId || '').toLowerCase().includes(q) || (jo.orderId || '').toLowerCase().includes(q);
  });
  const { slice, page, perPage, total, setPage, setPerPage } = usePagination(filtered);

  return (
    <ErrorBoundary>
      <div style={S.page}>
        <div style={{ ...S.rowBetween, marginBottom: '16px' }}>
          <button onClick={openCreate} style={S.btnPrimary}>{ICONS.plus} Create Job Order</button>
        </div>

        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '16px' }}>
          <SummaryCard label="Total" value={counts.total} accent />
          <SummaryCard label="Queued" value={counts.queued} />
          <SummaryCard label="In Progress" value={counts.inProgress} color="var(--gold)" />
          <SummaryCard label="For QC" value={counts.forQc} color="var(--st-purple-fg)" />
          <SummaryCard label="Completed" value={counts.completed} color="var(--st-green-fg)" />
        </div>

            <div style={{ ...S.card, ...S.rowBetween, marginBottom: '10px', padding: '12px 16px' }}>
              <div style={{ ...S.row, gap: '8px', flex: 1 }}>
                <SearchBar value={search} onChange={v => { setSearch(v); setPage(1); }} placeholder="Search JO, product, order…" style={{ width: '240px' }} />
                <CustomSelect value={statusFilter} onChange={setStatusFilter} style={{ width: '150px' }}
                  options={[{ value: '', label: 'All Statuses' }, ...JO_STATUSES.map(s => ({ value: s, label: JO_BADGE[s]?.label ?? s }))]} />
                <CustomSelect value={rushFilter} onChange={setRushFilter} style={{ width: '140px' }}
                  options={[{ value: '', label: 'All Types' }, { value: 'true', label: 'Rush Only' }, { value: 'false', label: 'Standard Only' }]} />
              </div>
              <button onClick={loadJobOrders} style={S.btnGhost}>{ICONS.reload} Refresh</button>
            </div>

            {error && <div style={{ ...S.note, background: 'var(--st-red-bg)', borderColor: 'rgba(239,68,68,0.35)', color: 'var(--st-red-fg)', marginBottom: '10px' }}>{error}</div>}

            <div style={{ ...S.card, padding: 0, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr>
                  {/* Whoever works the JO is whoever opens Production or QC - naming a
                      staff member here just created a field nobody kept current. */}
                  <th style={S.th}>JO</th><th style={S.th}>Product</th><th style={S.th}>Qty</th>
                  <th style={S.th}>Order</th><th style={S.th}>Due</th>
                  <th style={S.th}>Status</th><th style={{ ...S.th, textAlign: 'right' }}>Action</th>
                </tr></thead>
                <tbody>
                  {isLoading ? (
                    <TableSkeleton cols={7} rows={4} />
                  ) : slice.length === 0 ? (
                    <tr><td colSpan={8} style={{ padding: 0 }}><EmptyState message="No job orders found" sub="Create one from a paid, design-approved order." /></td></tr>
                  ) : slice.map(jo => (
                    <tr key={jo.id ?? jo._id} style={S.tr}>
                      <td style={{ ...S.td, fontFamily: 'monospace', fontWeight: 600 }}>
                        {jo.joId || (jo.id ?? jo._id)?.slice(-8).toUpperCase()}
                        <RushBadge isRush={jo.isRush} />
                      </td>
                      <td style={S.td}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          {/* The product, not the proof: a grouped request puts the same proof on every
                              job order, so this column drew the same picture for a mug and a totebag. */}
                          <DesignPreview path={jo.product?.thumbnail || jo.designFilePath} size={36} />
                          <span>{prodName(jo)}</span>
                        </div>
                        {jo.bomSnapshot?.length > 0 && <div style={{ fontSize: 11, color: 'var(--gray)', marginTop: 2 }}>Materials: {jo.bomSnapshot.map(m => `${m.name} ×${m.totalQty}${m.unit ? ' ' + m.unit : ''}`).join(', ')}</div>}
                      </td>
                      <td style={S.td}>{jo.product?.quantity ?? '-'}</td>
                      <td style={{ ...S.td, fontFamily: 'monospace' }}>{jo.orderId ? orderNo(jo.orderId) : '-'}</td>
                      <td style={S.td}>
                        {fmtDate(jo.targetCompletion)}
                        {(() => {
                          const risk = joRisk(jo);
                          if (!risk) return null;
                          return <div style={{ marginTop: 3 }}><span style={{ ...S.badge, ...RISK_STYLE[risk.color], fontSize: 9, fontWeight: 700 }}>{risk.label}</span></div>;
                        })()}
                      </td>
                      <td style={S.td}><StatusBadge status={jo.joStatus} /></td>
                      <td style={{ ...S.td, textAlign: 'right' }}>
                        <button onClick={() => openEdit(jo)} style={S.btnSmGhost}>{ICONS.edit} Edit</button>
                        {canDelete(jo) && <button onClick={() => { setDeleteErr(''); setDeleting(jo); }} style={{ ...S.btnSmGhost, marginLeft: 6, color: 'var(--st-red-fg)' }} title="Delete (test/junk only)">Delete</button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <PaginationBar total={total} page={page} perPage={perPage} onPage={setPage} onPerPage={setPerPage} />
      </div>

      {preview && (
        <ImageLightbox url={preview.url} kind={preview.kind} onClose={() => setPreview(null)} />
      )}

      {(modal === 'create' || (modal === 'edit' && selected)) && (
        <div onClick={closeModal} style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div onClick={e => e.stopPropagation()} style={{ ...S.card, width: '100%', maxWidth: modal === 'create' ? 640 : 520, maxHeight: '90vh', overflowY: 'auto' }}>
            <h2 style={{ margin: '0 0 16px', fontSize: '1.05rem', fontWeight: 700, color: 'var(--white)' }}>
              {modal === 'create' ? 'Create Job Order' : `Edit Job Order - ${selected.joId || ''}`}
            </h2>
            <JobOrderForm
              initial={modal === 'create' ? EMPTY_FORM : {
                joStatus: selected.joStatus || 'Queued',
                targetCompletion: selected.targetCompletion ? String(selected.targetCompletion).split('T')[0] : '',
                isRush: selected.isRush || false,
                assignedTo: selected.assignedTo || '',
                notes: selected.notes || '',
              }}
              isEdit={modal === 'edit'}
              editingJo={modal === 'edit' ? selected : null}
              onPreview={showPreview}
              onArtworkChanged={(updated) => { setSelected(updated); loadJobOrders(); }}
              orders={eligibleOrders}
              ordersLoading={ordersLoading}
              onSubmit={modal === 'create' ? handleCreate : handleUpdate}
              onCancel={closeModal}
              isSubmitting={isSubmitting}
              submitError={submitError}
            />
          </div>
        </div>
      )}

      {deleting && (
        <div onClick={() => !isSubmitting && setDeleting(null)} style={{ position: 'fixed', inset: 0, zIndex: 1001, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div onClick={e => e.stopPropagation()} style={{ ...S.card, width: '100%', maxWidth: 420 }}>
            <h2 style={{ margin: '0 0 8px', fontSize: '1.05rem', fontWeight: 700, color: 'var(--white)' }}>Delete {deleting.joId || 'job order'}?</h2>
            <p style={{ margin: '0 0 14px', fontSize: 13, color: 'var(--gray)', lineHeight: 1.5 }}>
              This permanently removes the job order. Allowed only because it is <strong style={{ color: 'var(--white)' }}>{deleting.joStatus}</strong> (nothing produced yet). If it was the order&apos;s last job order, the order returns to Processing so it can be scheduled again.
            </p>
            {deleteErr && <div style={{ ...S.note, background: 'var(--st-red-bg)', borderColor: 'rgba(239,68,68,0.35)', color: 'var(--st-red-fg)', marginBottom: 12 }}>{deleteErr}</div>}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setDeleting(null)} disabled={isSubmitting} style={S.btnGhost}>Cancel</button>
              <button onClick={confirmDelete} disabled={isSubmitting} style={{ ...S.btnPrimary, background: 'var(--st-red-fg)', borderColor: 'var(--st-red-fg)' }}>{isSubmitting ? 'Deleting…' : 'Delete'}</button>
            </div>
          </div>
        </div>
      )}
    </ErrorBoundary>
  );
}

/**
 * The print-ready artwork for one job order, and the approved proof beside it.
 *
 * These are two different things and the shop floor needs both: the proof says what the result should
 * look like, the production file is what the machine actually consumes. Before this the job order
 * carried only the proof, so production was being handed a mockup it could not print.
 *
 * Files accumulate rather than replace. After a QC failure the reprint gets a new file, and which one
 * the failed run used has to stay visible - overwriting would erase the evidence.
 */
function ProductionArtwork({ jo, onChanged, onPreview }) {
  const { token } = useAuth();
  const [busy, setBusy] = useState(false);
  const [err, setErr]   = useState('');
  const [note, setNote] = useState('');
  const inputRef = useRef(null);

  const files  = jo?.productionFiles ?? [];
  // The whole approved set. A grouped request has no per-item mapping, so showing one file as THIS
  // item's proof would be a claim the data cannot support.
  const proofSet = (jo?.designFilePaths?.length ? jo.designFilePaths : [jo?.designFilePath]).filter(Boolean);
  const joId   = joDocId(jo);
  const locked = ['QC_Passed', 'Completed'].includes(jo?.joStatus);

  const pick = async (e) => {
    const chosen = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (!chosen.length) return;
    setBusy(true); setErr('');
    try {
      const updated = await uploadProductionFiles(token, joId, chosen, note.trim());
      setNote('');
      onChanged?.(updated);
    } catch (ex) { setErr(ex.message || 'Upload failed.'); }
    finally { setBusy(false); }
  };

  const remove = async (i) => {
    setBusy(true); setErr('');
    try { onChanged?.(await deleteProductionFile(token, joId, i)); }
    catch (ex) { setErr(ex.message || 'Could not remove the file.'); }
    finally { setBusy(false); }
  };

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ ...S.label, margin: 0 }}>Production artwork</span>
        <span style={{ fontSize: 11, color: 'var(--gray)' }}>
          what the machine prints - not the customer&apos;s proof
        </span>
      </div>

      {proofSet.length > 0 && (
        <div>
          <div style={{ fontSize: 11, color: 'var(--gray)', marginBottom: 6 }}>
            {proofSet.length > 1
              ? 'Approved proof set - one design covering several products. Find the one for this item.'
              : 'Approved proof - the result should match this.'}
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {proofSet.map((u, n) => (
              <DesignPreview key={`${u}_${n}`} path={u} size={44} onOpen={(full) => onPreview?.(full)} />
            ))}
          </div>
        </div>
      )}

      {files.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {files.map((f, i) => (
            <div key={`${f.url}_${i}`} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--dark2)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 8px' }}>
              <button type="button" onClick={() => onPreview?.(f.url)}
                title={previewKind(f.url) ? 'Click to preview' : 'Opens in a new tab'}
                style={{ flex: 1, minWidth: 0, textAlign: 'left', border: 'none', background: 'transparent', color: 'var(--gold)', fontSize: 12, fontWeight: 600, cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', padding: 0 }}>
                {f.name || `File ${i + 1}`}
              </button>
              <span style={{ fontSize: 10, color: 'var(--gray)', flexShrink: 0 }}>
                {f.sizeKB ? `${f.sizeKB} KB` : ''}{f.note ? ` · ${f.note}` : ''}
              </span>
              {!locked && (
                <button type="button" onClick={() => remove(i)} disabled={busy} title="Remove"
                  style={{ border: 'none', background: 'transparent', color: 'var(--gray)', cursor: 'pointer', fontSize: 14, lineHeight: 1, flexShrink: 0 }}>
                  &times;
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {locked ? (
        <span style={{ fontSize: 11, color: 'var(--gray)' }}>
          This job has passed QC - its artwork is part of the record and can no longer be changed.
        </span>
      ) : (
        <>
          <input type="text" value={note} maxLength={120} onChange={e => setNote(e.target.value)}
            placeholder="Note for this file - e.g. mirrored, 180C 60s, 20x8.5cm"
            style={{ ...S.input, fontSize: 12 }} disabled={busy} />
          <div>
            <input ref={inputRef} type="file" multiple onChange={pick} style={{ display: 'none' }} />
            <button type="button" onClick={() => inputRef.current?.click()} disabled={busy}
              style={{ ...S.btnSmGhost, cursor: busy ? 'wait' : 'pointer' }}>
              {busy ? 'Uploading…' : files.length ? '+ Add another file' : '+ Upload production file'}
            </button>
          </div>
        </>
      )}

      {err && <div style={{ fontSize: 11, color: 'var(--st-red-fg)' }}>{err}</div>}
    </div>
  );
}
