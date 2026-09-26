'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import {
  fetchOrderRequests,
  updateOrderRequestStatus,
} from '@/lib/orderRequestApi';
import { useIsPhone, KpiStrip, PhoneFilterBar, PhoneList, PhoneRow } from '@/components/dashboard/phone';
import ErrorBoundary from '@/components/ErrorBoundary';
import { loadInventory } from '../inventory-v2/api';
import { S, EmptyState, SummaryCard, SearchBar, CustomSelect, ConfirmModal } from '../inventory-v2/shared';
import QuotationModal from '@/components/chat/QuotationModal';
import QuotationView from '@/components/quotations/QuotationView';

// Same base the request helpers use - the picker calls one endpoint directly.
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';
import { createAdminQuotation } from '@/lib/orderRequestApi';
import { useAccess } from '@/contexts/AccessContext';
// One rule for where a quotation has got to, shared so the list and the counts cannot drift.
import { stageOf } from '@/lib/askStage';

const STATUS_LABELS = {
  pending_review: 'Pending Review',
  confirmed: 'Confirmed',
  processing: 'Processing',
  ready: 'Ready for Pickup',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

const STATUS_COLORS = {
  pending_review: { bg: 'var(--gold)',       color: 'var(--black)' },
  confirmed:      { bg: 'var(--gold-dark)',  color: 'var(--white)' },
  processing:     { bg: 'var(--gold-light)', color: 'var(--black)' },
  ready:          { bg: 'var(--green)',      color: 'var(--black)' },
  delivered:      { bg: 'var(--gray)',       color: 'var(--black)' },
  cancelled:      { bg: 'var(--red)',        color: 'var(--white)' },
};

const PAYMENT_STATUS_STYLES = {
  unpaid:  {
    background: 'rgba(196,30,58,0.15)',
    color:      'var(--red)',
    border:     '1px solid rgba(196,30,58,0.3)',
    label:      'Unpaid',
  },
  downpayment_paid: {
    background: 'rgba(212,168,67,0.12)',
    color:      'var(--gold)',
    border:     '1px solid rgba(212,168,67,0.35)',
    label:      '50% Downpayment Paid',
  },
  partial: {
    background: 'var(--gold-subtle)',
    color:      'var(--gold)',
    border:     '1px solid rgba(212,168,67,0.3)',
    label:      'Partially Paid',
  },
  paid: {
    background: 'var(--color-background-success)',
    color:      'var(--color-text-success)',
    border:     '1px solid var(--color-border-success)',
    label:      'Paid',
  },
};

// A request answers two questions: has the shop priced it, and has the customer paid it. The
// old statuses (confirmed / processing / ready / delivered) were a second order pipeline living
// inside this screen; after payment the ORDER carries the state. So here a request is only ever
// one of these five, and thirteen unpriced asks stop looking like thirteen quotations.
const STAGES = {
  ask:       { label: 'Ask',       hint: 'Waiting on you',          bg: 'var(--gold)',              color: 'var(--black)' },
  quoted:    { label: 'Quoted',    hint: 'Waiting on the customer', bg: 'rgba(59,130,246,0.18)',    color: 'color-mix(in srgb, var(--st-blue-fg) 35%, transparent)' },
  accepted:  { label: 'Accepted',  hint: 'Paid - now an order',     bg: 'rgba(34,197,94,0.18)',     color: 'var(--green)' },
  expired:   { label: 'Expired',   hint: 'Ran out unpaid',          bg: 'rgba(120,120,120,0.22)',   color: 'var(--gray-light)' },
  cancelled: { label: 'Cancelled', hint: 'Closed',                  bg: 'rgba(196,30,58,0.18)',     color: 'var(--red)' },
  answered:  { label: 'Answered',  hint: 'Replaced by a quotation', bg: 'rgba(120,120,120,0.22)',   color: 'var(--gray-light)' },
};


// Whole days until a quotation runs out. Negative once it has.
function daysLeft(req) {
  if (!req?.expiresAt) return null;
  const t = new Date(req.expiresAt);
  if (isNaN(t)) return null;
  return Math.ceil((t.getTime() - Date.now()) / 86400000);
}

// What the shop has SENT, plus the asks still waiting for a price. Asks are answered in Messages,
// but a count with no list behind it ("12 asks") could never be checked or cleared - stale
// enquiries from weeks ago sat in it for good. They are listed under their own filter.
const FILTER_OPTIONS = [
  { key: 'ask',       label: 'Asks - waiting for a price' },
  { key: 'quoted',    label: 'Sent' },
  { key: 'accepted',  label: 'Accepted' },
  { key: 'expired',   label: 'Expired' },
  { key: 'cancelled', label: 'Cancelled' },
  { key: 'all',       label: 'All sent' },
];

function formatPeso(n) {
  if (n == null) return '-';
  return `₱${Number(n).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatTimestamp(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function isExpiredQuote(req) {
  if (!req?.expiresAt) return false;
  if (req.paymentStatus === 'paid' || req.convertedOrderId) return false;
  if (!['confirmed', 'pending_review'].includes(req.status)) return false;
  const t = new Date(req.expiresAt);
  return !isNaN(t) && t < new Date();
}

function StageBadge({ stage, size = 'sm' }) {
  const st = STAGES[stage] || STAGES.ask;
  return (
    <span style={{
      display: 'inline-block',
      background: st.bg,
      color: st.color,
      borderRadius: '999px',
      padding: size === 'lg' ? '0.375rem 1rem' : '0.25rem 0.75rem',
      fontSize: size === 'lg' ? '0.875rem' : '0.75rem',
      fontWeight: 700,
      whiteSpace: 'nowrap',
    }}>
      {st.label}
    </span>
  );
}

// History entries still carry the raw status words; shown as they were written.
function StatusBadge({ status, size = 'sm', expired = false }) {
  const colors = expired
    ? { bg: 'rgba(120,120,120,0.22)', color: 'var(--gray-light)' }
    : (STATUS_COLORS[status] || { bg: 'var(--gray)', color: 'var(--black)' });
  const label = expired ? 'Expired' : (STATUS_LABELS[status] || status);
  return (
    <span style={{
      display: 'inline-block',
      background: colors.bg,
      color: colors.color,
      borderRadius: '999px',
      padding: size === 'lg' ? '0.375rem 1rem' : '0.25rem 0.75rem',
      fontSize: size === 'lg' ? '0.875rem' : '0.75rem',
      fontWeight: 700,
      whiteSpace: 'nowrap',
    }}>
      {label}
    </span>
  );
}

export default function OrderRequestsPage() {
  // Quotations Work sends and re-prices; closing or declining one is its own tick. See only reads.
  const { can, owner } = useAccess();
  const mayQuote = can('orderRequests.create');
  const mayClose = can('orderRequests.approve');
  const [confirmClose, setConfirmClose] = useState(false);
  const { token } = useAuth();
  const [requests, setRequests] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeFilter, setActiveFilter] = useState('quoted');
  const isPhone = useIsPhone();
  const [searchQuery, setSearchQuery] = useState('');
  // Raising a quotation from its own module rather than only from inside a chat thread.
  const [pickCustomer, setPickCustomer] = useState(false);
  const [quoteFor,     setQuoteFor]     = useState(null);
  const [quoteSending, setQuoteSending] = useState(false);
  // The ask a new quotation answers, when it came with a filled order form (the form rides along).
  const [quoteAskId,   setQuoteAskId]   = useState(null);

  const openNewQuote = () => { setQuoteAskId(null); setPickCustomer(true); };

  const sendQuotation = async (payload) => {
    setQuoteSending(true);
    try {
      await createAdminQuotation(token, { recipientId: quoteFor.id, ...payload });
      setQuoteFor(null);
      const result = await fetchOrderRequests(token);
      setRequests(result.data);
    } catch (err) {
      // The modal shows nothing of its own on failure, so this has to reach the page.
      setError(err.message || 'Could not send the quotation.');
    } finally {
      setQuoteSending(false);
    }
  };
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [modalLoading, setModalLoading] = useState(false);
  const [modalError, setModalError] = useState(null);
  const [modalSuccess, setModalSuccess] = useState(null);
  const [updatePrice, setUpdatePrice] = useState('');
  const [updateDownPayment, setUpdateDownPayment] = useState('');
  const [updateValidDays, setUpdateValidDays] = useState('7');
  const [updateNote, setUpdateNote] = useState('');
  const [updateAdminComment, setUpdateAdminComment] = useState('');
  const [updateMockupUrl, setUpdateMockupUrl] = useState('');
  const [materialsList, setMaterialsList] = useState([]);
  const [updateMaterials, setUpdateMaterials] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);

  // Fetch on mount
  useEffect(() => {
    if (!token) {
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    const load = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const result = await fetchOrderRequests(token);
        if (!cancelled) setRequests(result.data);
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [token]);

  // Load the materials list once so the admin can assemble a per-order BOM on a quote.
  useEffect(() => {
    if (!token) return;
    loadInventory(token).then(({ mats }) => setMaterialsList(mats || [])).catch(() => {});
  }, [token]);

  // Auto-refresh every 30s - skipped when a modal is active or submitting
  const pollRef = useRef(null);
  useEffect(() => {
    if (!token) return;
    pollRef.current = setInterval(async () => {
      if (submitting || selectedRequest != null) return;
      try {
        const result = await fetchOrderRequests(token);
        setRequests(result.data);
      } catch {
        // silent - do not overwrite existing error state on poll failure
      }
    }, 30000);
    return () => clearInterval(pollRef.current);
  }, [token, submitting, selectedRequest]);

  // Filtered requests
  const filtered = useCallback(() => {
    // Asks show only under their own filter; "All sent" means quotations, not enquiries.
    let list = activeFilter === 'ask'
      ? requests.filter(r => stageOf(r) === 'ask')
      : requests.filter(r => stageOf(r) !== 'ask');
    if (activeFilter !== 'all' && activeFilter !== 'ask') list = list.filter(r => stageOf(r) === activeFilter);
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter(r =>
        (r.customerName || '').toLowerCase().includes(q) ||
        (r.customerEmail || '').toLowerCase().includes(q) ||
        (r.productName || '').toLowerCase().includes(q)
      );
    }
    // Asks first, the one who has waited longest at the top. Then quotations by soonest expiry,
    // because that is the one about to be lost. Everything finished goes newest first.
    const rank = { ask: 0, quoted: 1, expired: 2, accepted: 3, cancelled: 4 };
    return [...list].sort((a, b) => {
      const sa = stageOf(a), sb = stageOf(b);
      if (rank[sa] !== rank[sb]) return rank[sa] - rank[sb];
      const ta = new Date(a.createdAt ?? 0).getTime(), tb = new Date(b.createdAt ?? 0).getTime();
      if (sa === 'ask') return ta - tb;
      if (sa === 'quoted') return (daysLeft(a) ?? 999) - (daysLeft(b) ?? 999);
      return tb - ta;
    });
  }, [requests, activeFilter, searchQuery]);

  // Counts for summary cards
  const counts = useCallback(() => {
    const c = { all: 0 };
    Object.keys(STAGES).forEach(k => { c[k] = 0; });
    requests.forEach(r => {
      const st = stageOf(r);
      c[st]++;
      if (st !== 'ask') c.all++;
    });
    return c;
  }, [requests]);

  // Open review modal
  function openReview(req) {
    setSelectedRequest(req);
    setUpdatePrice(req.finalPrice != null ? String(req.finalPrice) : '');
    setUpdateDownPayment(req.downPayment != null ? String(req.downPayment) : '');
    setUpdateValidDays('7');
    setUpdateNote('');
    setUpdateAdminComment(req.adminComment || '');
    setUpdateMockupUrl(req.mockupUrl || '');
    setUpdateMaterials(Array.isArray(req.materials)
      ? req.materials.map(m => ({ inventoryId: m.inventoryId ?? '', materialName: m.materialName ?? '', qty: m.qty != null ? String(m.qty) : '', unitCost: Number(m.unitCost) || 0 }))
      : []);
    setModalError(null);
    setModalSuccess(null);
  }

  // Close review modal
  function closeReview() {
    setSelectedRequest(null);
    setUpdatePrice('');
    setUpdateDownPayment('');
    setUpdateValidDays('7');
    setUpdateNote('');
    setUpdateAdminComment('');
    setUpdateMockupUrl('');
    setUpdateMaterials([]);
    setModalError(null);
    setModalSuccess(null);
  }

  // Two things can happen to a request here: it gets a price and goes to the customer, or it
  // is closed. Everything after "paid" happens on the order, not here.
  async function handleSubmitUpdate(action) {
    if (!selectedRequest || !token) return;
    const nextStatus = action === 'close' ? 'cancelled' : 'confirmed';
    if (nextStatus === 'confirmed' && (!updatePrice || Number(updatePrice) <= 0)) {
      setModalError('Put a price on it first.');
      return;
    }
    const validDays = Math.min(60, Math.max(1, parseInt(updateValidDays, 10) || 7));

    setSubmitting(true);
    setModalError(null);
    setModalSuccess(null);
    try {
      const payload = {
        status: nextStatus,
        finalPrice: nextStatus === 'confirmed' && updatePrice ? Number(updatePrice) : undefined,
        expiresInDays: nextStatus === 'confirmed' ? validDays : undefined,
        note: updateNote.trim() || undefined,
        downPayment: updateDownPayment !== '' ? Number(updateDownPayment) : undefined,
        adminComment: updateAdminComment.trim() || undefined,
        mockupUrl: updateMockupUrl.trim() || undefined,
        materials: updateMaterials
          .filter(m => m.inventoryId && Number(m.qty) > 0)
          .map(m => ({ inventoryId: m.inventoryId, materialName: m.materialName, qty: Number(m.qty), unitCost: Number(m.unitCost) || 0 })),
      };
      const updated = await updateOrderRequestStatus(token, selectedRequest.id, payload);
      // Update local state
      setRequests(prev => prev.map(r => r.id === updated.id ? updated : r));
      setSelectedRequest(updated);
      setModalSuccess(nextStatus === 'confirmed'
        ? `Quotation sent. The customer has ${validDays} day${validDays === 1 ? '' : 's'} to pay it.`
        : 'Request closed.');
      setUpdateNote('');
    } catch (err) {
      setModalError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  // More time on a quotation that is still waiting: same price, same lines, a new pay-by date.
  async function extendQuote(days) {
    if (!selectedRequest || !token) return;
    setSubmitting(true); setModalError(null); setModalSuccess(null);
    try {
      const updated = await updateOrderRequestStatus(token, selectedRequest.id, {
        status: 'confirmed',
        expiresInDays: days,
        note: `Pay-by date moved to ${days} day${days === 1 ? '' : 's'} from today.`,
      });
      setRequests(prev => prev.map(r => (r.id === updated.id ? updated : r)));
      setSelectedRequest(updated);
      setModalSuccess(`Done - the customer can pay until ${formatDate(updated.expiresAt)}.`);
    } catch (err) {
      setModalError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  // ── Per-order BOM (materials) helpers - assembled at quote time, drives COGS ──
  const materialsCostTotal = updateMaterials.reduce((s, m) => s + (Number(m.qty) || 0) * (Number(m.unitCost) || 0), 0);
  const addMaterialRow = () => setUpdateMaterials(prev => [...prev, { inventoryId: '', materialName: '', qty: '', unitCost: 0 }]);
  const removeMaterialRow = (i) => setUpdateMaterials(prev => prev.filter((_, j) => j !== i));
  const setMaterialQty = (i, v) => setUpdateMaterials(prev => prev.map((m, j) => (j === i ? { ...m, qty: v } : m)));
  const setMaterialRow = (i, invId) => setUpdateMaterials(prev => prev.map((m, j) => {
    if (j !== i) return m;
    const mat = materialsList.find(x => String(x.id) === String(invId));
    return { ...m, inventoryId: invId, materialName: mat?.name ?? '', unitCost: mat ? Number(mat.baseCost) || 0 : 0 };
  }));


  const filteredRequests = filtered();
  const cardCounts = counts();

  if (isLoading) {
    return (
      <div style={{ ...S.page, padding: '24px' }}>
        <style>{`
          @keyframes pmPulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.45; } }
        `}</style>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxWidth: '960px' }}>
          {[...Array(5)].map((_, i) => (
            <div
              key={i}
              style={{
                height: '56px',
                borderRadius: '8px',
                background: 'rgba(255,255,255,0.04)',
                animation: 'pmPulse 1.5s ease-in-out infinite',
              }}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
    <div style={{ ...S.page, padding: '24px' }}>
      {pickCustomer && (
        <CustomerPicker
          token={token}
          onClose={() => setPickCustomer(false)}
          onPick={(c) => { setQuoteFor(c); setPickCustomer(false); }} />
      )}
      {quoteFor && (
        <QuotationModal
          onClose={() => { setQuoteFor(null); setQuoteAskId(null); }}
          onSubmit={sendQuotation}
          isSending={quoteSending}
          token={token}
          customerId={quoteFor.id}
          customerName={quoteFor.name}
          initialAskId={quoteAskId} />
      )}
      {/* Asks are answered in Messages, not here. But a count that lives only in Messages is a
          count nobody sees until they open Messages, so it is repeated where quotations live. */}
      {owner && (cardCounts.ask ?? 0) > 0 && activeFilter !== 'ask' && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
          margin: '0 0 1rem', padding: '0.75rem 1rem', borderRadius: 10,
          background: 'rgba(212,168,67,0.08)', border: '1px solid rgba(212,168,67,0.35)' }}>
          <span style={{ fontSize: '0.85rem', color: 'var(--white)' }}>
            <strong style={{ color: 'var(--gold)' }}>{cardCounts.ask} ask{cardCounts.ask === 1 ? '' : 's'}</strong> waiting for a price.
            Quote them, or decline the ones that went quiet.
          </span>
          <button type="button" onClick={() => setActiveFilter('ask')}
            style={{ background: 'none', border: 'none', padding: 0, fontSize: '0.8rem', fontWeight: 700, color: 'var(--gold)', whiteSpace: 'nowrap', cursor: 'pointer', fontFamily: 'inherit' }}>
            See them
          </button>
        </div>
      )}

      {isPhone ? (
        <>
          <KpiStrip items={[
            { key: 'quoted',   label: 'Sent' },
            { key: 'accepted', label: 'Accepted' },
            { key: 'expired',  label: 'Expired' },
          ].map(k => ({ ...k, value: cardCounts[k.key] ?? 0, active: activeFilter === k.key, onClick: () => setActiveFilter(activeFilter === k.key ? 'all' : k.key) }))} />
          <PhoneFilterBar search={searchQuery} onSearch={setSearchQuery} placeholder="Search customer or product"
            filters={[{ key: 'status', label: 'Show', value: activeFilter, defaultValue: 'quoted', onChange: setActiveFilter,
              options: FILTER_OPTIONS.map(o => ({ value: o.key, label: o.label })) }]}
            actions={mayQuote ? <button onClick={openNewQuote} style={{ ...S.btnPrimary, minHeight: 36, whiteSpace: 'nowrap' }}>+ New quotation</button> : null}
            note={`${filteredRequests.length} quotation${filteredRequests.length === 1 ? '' : 's'}`} />
        </>
      ) : (<>
      {/* Same grammar as every other module: the numbers, then one filter card with the
          primary action on its right, then the table. */}
      <div className="pmp-stat-row" style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '16px' }}>
        <SummaryCard label="Sent" value={cardCounts.quoted ?? 0} accent sub="Waiting on the customer" color={(cardCounts.quoted ?? 0) > 0 ? 'var(--gold)' : 'var(--white)'} />
        <SummaryCard label="Accepted" value={cardCounts.accepted ?? 0} sub="Paid - now an order" color={(cardCounts.accepted ?? 0) > 0 ? 'var(--st-green-fg, #2e7d32)' : 'var(--white)'} />
        <SummaryCard label="Expired" value={cardCounts.expired ?? 0} sub="Ran out unpaid" color={(cardCounts.expired ?? 0) > 0 ? 'var(--st-red-fg, #dc2626)' : 'var(--white)'} />
        <SummaryCard label="All sent" value={cardCounts.all ?? 0} sub="Every quotation ever sent" />
      </div>

      <div style={{ ...S.card, ...S.rowBetween, marginBottom: '10px', padding: '12px 16px', flexWrap: 'wrap', gap: 10 }}>
        <div className="pmp-filters" style={{ ...S.row, gap: '8px', flex: 1, flexWrap: 'wrap' }}>
          <SearchBar value={searchQuery} onChange={setSearchQuery} placeholder="Search customer or product..." style={{ width: '260px' }} />
          <CustomSelect value={activeFilter} onChange={setActiveFilter} style={{ width: '230px' }}
            options={FILTER_OPTIONS.map(o => ({ value: o.key, label: o.label }))} />
        </div>
        {mayQuote && (<button onClick={openNewQuote} style={{ ...S.btnPrimary, whiteSpace: 'nowrap' }}>+ New quotation</button>)}
      </div>

      </>)}

      {/* Error State */}
      {error && (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--red)' }}>
          <p style={{ marginBottom: '1rem' }}>{error}</p>
          <button
            disabled={isRetrying}
            onClick={async () => {
              if (isRetrying) return;
              setIsRetrying(true);
              setIsLoading(true);
              setError(null);
              try {
                const r = await fetchOrderRequests(token);
                setRequests(r.data);
              } catch (e) {
                setError(e.message);
              } finally {
                setIsLoading(false);
                setIsRetrying(false);
              }
            }}
            style={{
              background: isRetrying ? 'var(--dark3)' : 'var(--gold)',
              color: isRetrying ? 'var(--gray)' : 'var(--black)',
              border: 'none',
              borderRadius: '8px',
              padding: '0.625rem 1.25rem',
              fontWeight: 700,
              cursor: isRetrying ? 'not-allowed' : 'pointer',
              opacity: isRetrying ? 0.6 : 1,
            }}
          >
            {isRetrying ? 'Retrying...' : 'Retry'}
          </button>
        </div>
      )}

      {/* Table */}
      {!error && (
        <>
          {filteredRequests.length === 0 ? (
            <div style={{ ...S.card, padding: 0 }}>
              <EmptyState
                message={activeFilter === 'quoted' ? 'No quotation is waiting on a customer' : activeFilter === 'all' ? 'No quotations sent yet' : `Nothing under ${FILTER_OPTIONS.find(f => f.key === activeFilter)?.label?.toLowerCase() || activeFilter}`}
                sub={activeFilter === 'quoted' ? 'Quotations you send from Messages or with + New quotation appear here until the customer pays.' : undefined} />
            </div>
          ) : (
            isPhone ? (
              <PhoneList>
                {filteredRequests.map((req, i) => (
                  <PhoneRow key={req.id} first={i === 0} mono={false} onClick={() => openReview(req)}
                    title={req.customerName || '-'}
                    chip={<StageBadge stage={stageOf(req)} />}
                    meta={[req.productName || '-', req.quantity != null ? `\u00d7${req.quantity}` : null].filter(Boolean).join(' ')}
                    sub={[
                      stageOf(req) === 'ask' ? 'no price yet' : formatPeso(req.finalPrice),
                      stageOf(req) === 'quoted' ? `${daysLeft(req)}d left` : formatDate(req.createdAt),
                    ].filter(Boolean).join(' \u00b7 ')} />
                ))}
              </PhoneList>
            ) : (
            <div style={{ overflowX: 'auto', borderRadius: '10px', border: '1px solid var(--border)' }}>
              <table className="pmp-rt" style={{ width: '100%', borderCollapse: 'collapse', minWidth: '900px' }}>
                <thead>
                  <tr style={{ background: 'var(--dark2)', borderBottom: '1px solid var(--border)' }}>
                    {['Customer', 'Request', 'Qty', 'Asked', 'Price', 'Expires', 'Stage', ''].map((h, i) => (
                      <th key={i} style={{ padding: '0.75rem 1rem', textAlign: 'left', fontSize: '0.75rem', fontWeight: 700, color: 'var(--gray)', textTransform: 'uppercase', letterSpacing: '0.5px', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredRequests.map((req) => {
                    const stage = stageOf(req);
                    const left  = daysLeft(req);
                    const action = stage === 'ask' ? 'Quote' : stage === 'expired' ? 'Re-quote' : stage === 'accepted' ? 'Open order' : 'View';
                    return (
                    <tr key={req.id} style={{ borderBottom: '1px solid var(--border)', background: 'var(--dark)' }}>
                      <td data-rt="head" style={{ padding: '0.75rem 1rem' }}>
                        <div style={{ fontSize: '0.875rem', color: 'var(--white)', fontWeight: 600 }}>{req.customerName || '-'}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--gray)' }}>{req.customerEmail || '-'}</div>
                      </td>
                      <td data-label="Request" style={{ padding: '0.75rem 1rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          {req.productThumbnail ? (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img src={req.productThumbnail} alt="" style={{ width: '40px', height: '40px', borderRadius: '6px', objectFit: 'cover', flexShrink: 0 }} />
                          ) : (
                            <div style={{ width: '40px', height: '40px', borderRadius: '6px', background: 'var(--dark2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--gray)" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                            </div>
                          )}
                          <div>
                            <div style={{ fontSize: '0.85rem', color: 'var(--white)', fontWeight: 600 }}>{req.productName || '-'}</div>
                            {req.category && (
                              <span style={{ fontSize: '0.65rem', background: 'rgba(255,255,255,0.08)', color: 'var(--gray)', padding: '0.125rem 0.5rem', borderRadius: '999px', marginTop: '0.25rem', display: 'inline-block' }}>{req.category}</span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td data-label="Qty" style={{ padding: '0.75rem 1rem', fontSize: '0.85rem', color: 'var(--white)', fontWeight: 600 }}>{req.quantity ?? '-'}</td>
                      <td data-label="Asked" style={{ padding: '0.75rem 1rem', fontSize: '0.8rem', color: 'var(--gray)', whiteSpace: 'nowrap' }}>{formatDate(req.createdAt)}</td>
                      <td data-label="Price" style={{ padding: '0.75rem 1rem', fontSize: '0.85rem', fontWeight: 600, whiteSpace: 'nowrap', color: stage === 'ask' ? 'var(--gray)' : 'var(--gold)' }}>
                        {stage === 'ask' ? 'not yet' : formatPeso(req.finalPrice)}
                      </td>
                      <td data-label="Expires" style={{ padding: '0.75rem 1rem', fontSize: '0.8rem', whiteSpace: 'nowrap',
                        color: stage === 'quoted' && left != null && left <= 2 ? 'var(--red)' : 'var(--gray)' }}>
                        {stage === 'quoted' && left != null ? (left <= 0 ? 'today' : `in ${left}d`)
                          : stage === 'expired' ? formatDate(req.expiresAt)
                          : stage === 'accepted' && req.convertedOrderId ? 'paid' : '-'}
                      </td>
                      <td data-label="Stage" style={{ padding: '0.75rem 1rem' }}><StageBadge stage={stage} /></td>
                      <td data-rt="actions" style={{ padding: '0.75rem 1rem', whiteSpace: 'nowrap' }}>
                        {stage === 'accepted' && req.convertedOrderId && can('orders') ? (
                          <a href={`/dashboard/business/orders?order=${req.convertedOrderId}`}
                            style={{ display: 'inline-block', background: 'var(--dark2)', color: 'var(--white)', border: '1px solid var(--border)', borderRadius: '6px', padding: '0.375rem 0.75rem', fontSize: '0.75rem', fontWeight: 700, textDecoration: 'none' }}>
                            {action}
                          </a>
                        ) : (
                          <button
                            onClick={() => openReview(req)}
                            style={{ background: stage === 'ask' || stage === 'expired' ? 'var(--gold)' : 'var(--dark2)', color: stage === 'ask' || stage === 'expired' ? 'var(--black)' : 'var(--white)',
                              border: stage === 'ask' || stage === 'expired' ? 'none' : '1px solid var(--border)', borderRadius: '6px', padding: '0.375rem 0.75rem', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}
                          >
                            {action}
                          </button>
                        )}
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            )
          )}
        </>
      )}

      {/* One quotation, as the customer was sent it - same frame as Create Quotation. */}
      {selectedRequest && (
        <QuotationView
          req={selectedRequest}
          stage={stageOf(selectedRequest)}
          left={daysLeft(selectedRequest)}
          onClose={closeReview}
          mayQuote={mayQuote}
          mayClose={mayClose}
          canOrders={can('orders')}
          busy={submitting}
          error={modalError}
          success={modalSuccess}
          onExtend={extendQuote}
          onNewQuote={() => {
            const r = selectedRequest;
            // A filled order form rides along; a plain enquiry is answered by any quotation.
            const hasForm = r.orderFormAnswers && Object.keys(r.orderFormAnswers).length > 0;
            closeReview();
            setQuoteAskId(hasForm ? (r.id ?? r._id) : null);
            setQuoteFor({ id: r.customerId, name: r.customerName });
          }}
          onDecline={() => setConfirmClose(true)} />
      )}

      {/* The shop's own confirmation, over the quotation - not the browser's alert box. */}
      <ConfirmModal
        open={confirmClose && !!selectedRequest}
        onClose={() => setConfirmClose(false)}
        onConfirm={() => { setConfirmClose(false); handleSubmitUpdate('close'); }}
        title={selectedRequest && stageOf(selectedRequest) === 'ask' ? 'Decline this request?' : 'Cancel this quotation?'}
        message="The customer will not be able to pay it."
        confirmLabel={selectedRequest && stageOf(selectedRequest) === 'ask' ? 'Decline' : 'Cancel quotation'}
      />
    </div>
    </ErrorBoundary>
  );
}


/**
 * Who is this quotation for?
 *
 * Raising one from a chat thread already knows the customer. Raising one from the module does
 * not, so this is the one extra step - and it is a search box, not a form, because the shop
 * already knows the name before they open this.
 */
function CustomerPicker({ token, onClose, onPick }) {
  const isPhone = useIsPhone();
  const [q, setQ] = useState('');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        const res = await fetch(`${API_URL}/api/admin/customers`, {
          headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        });
        const d = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(d.message || 'Could not load customers.');
        if (!dead) setRows(Array.isArray(d.data) ? d.data : (d.data?.customers ?? []));
      } catch (e) {
        if (!dead) setErr(e.message);
      } finally {
        if (!dead) setLoading(false);
      }
    })();
    return () => { dead = true; };
  }, [token]);

  const shown = rows.filter(r => {
    const t = `${r.firstName ?? ''} ${r.lastName ?? ''} ${r.email ?? ''} ${r.phoneNumber ?? ''}`.toLowerCase();
    return !q.trim() || t.includes(q.trim().toLowerCase());
  }).slice(0, 40);

  return (
    <div onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 1200,
        display: 'flex', alignItems: isPhone ? 'flex-end' : 'center', justifyContent: 'center', padding: isPhone ? 0 : 16 }}>
      <div onClick={e => e.stopPropagation()}
        style={{ background: 'var(--dark)', border: '1px solid var(--border)',
          width: '100%', display: 'flex', flexDirection: 'column',
          ...(isPhone ? { borderRadius: '14px 14px 0 0', maxWidth: '100%', maxHeight: '90vh' } : { borderRadius: 10, maxWidth: 520, maxHeight: '80vh' }) }}>
        <div style={{ padding: '16px 18px 10px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>Who is this quotation for?</div>
          <div style={{ fontSize: 12, color: 'var(--gray)', marginTop: 3 }}>
            They get it in their chat with you, and can pay it from there.
          </div>
          <input autoFocus value={q} onChange={e => setQ(e.target.value)}
            placeholder="Search name, email or phone"
            style={{ ...S.input, marginTop: 10, width: '100%' }}  maxLength={160}/>
        </div>
        <div style={{ overflowY: 'auto', padding: '6px 0' }}>
          {loading ? (
            <div style={{ padding: 20, fontSize: 13, color: 'var(--gray)' }}>Loading...</div>
          ) : err ? (
            <div style={{ padding: 20, fontSize: 13, color: 'var(--st-red-fg)' }}>{err}</div>
          ) : shown.length === 0 ? (
            <div style={{ padding: 20, fontSize: 13, color: 'var(--gray)' }}>
              {q ? 'Nobody matches that.' : 'No customers yet.'}
            </div>
          ) : shown.map(c => {
            const id = String(c._id ?? c.id ?? '');
            const name = `${c.firstName ?? ''} ${c.lastName ?? ''}`.trim() || c.email;
            return (
              <button key={id} onClick={() => onPick({ id, name })}
                style={{ display: 'block', width: '100%', textAlign: 'left', background: 'transparent',
                  border: 'none', borderBottom: '1px solid var(--border)', padding: '10px 18px', cursor: 'pointer' }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--white)' }}>{name}</div>
                <div style={{ fontSize: 11.5, color: 'var(--gray)' }}>{c.email}{c.phoneNumber ? ` · ${c.phoneNumber}` : ''}</div>
              </button>
            );
          })}
        </div>
        <div style={{ padding: '10px 18px', borderTop: '1px solid var(--border)', textAlign: 'right' }}>
          <button onClick={onClose} style={S.btnGhost}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
