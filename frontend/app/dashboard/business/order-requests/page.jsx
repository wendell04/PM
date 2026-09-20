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
import { S, EmptyState } from '../inventory-v2/shared';
import QuotationModal from '@/components/chat/QuotationModal';

// Same base the request helpers use - the picker calls one endpoint directly.
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';
import { createAdminQuotation } from '@/lib/orderRequestApi';

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
  quoted:    { label: 'Quoted',    hint: 'Waiting on the customer', bg: 'rgba(59,130,246,0.18)',    color: '#93c5fd' },
  accepted:  { label: 'Accepted',  hint: 'Paid - now an order',     bg: 'rgba(34,197,94,0.18)',     color: 'var(--green)' },
  expired:   { label: 'Expired',   hint: 'Ran out unpaid',          bg: 'rgba(120,120,120,0.22)',   color: 'var(--gray-light)' },
  cancelled: { label: 'Cancelled', hint: 'Closed',                  bg: 'rgba(196,30,58,0.18)',     color: 'var(--red)' },
  answered:  { label: 'Answered',  hint: 'Replaced by a quotation', bg: 'rgba(120,120,120,0.22)',   color: 'var(--gray-light)' },
};

function stageOf(req) {
  if (!req) return 'ask';
  if (req.convertedOrderId) return 'accepted';
  if (['downpayment_paid', 'partial', 'paid'].includes(String(req.paymentStatus ?? ''))) return 'accepted';
  const st = String(req.status ?? 'pending_review');
  if (st === 'cancelled') return req.answeredByQuoteId ? 'answered' : 'cancelled';
  if (['processing', 'ready', 'delivered'].includes(st)) return 'accepted';   // legacy pipeline: work happened
  if (st === 'confirmed') {
    const t = req.expiresAt ? new Date(req.expiresAt) : null;
    if (t && !isNaN(t) && t < new Date()) return 'expired';
    return 'quoted';
  }
  return 'ask';
}

// Whole days until a quotation runs out. Negative once it has.
function daysLeft(req) {
  if (!req?.expiresAt) return null;
  const t = new Date(req.expiresAt);
  if (isNaN(t)) return null;
  return Math.ceil((t.getTime() - Date.now()) / 86400000);
}

// Only what the shop has SENT. An ask is a conversation, not a quotation - it arrives in
// Messages and is answered there with the Send quotation button. This screen counts them and
// points at Messages; it does not list them.
const FILTER_OPTIONS = [
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

  const openNewQuote = () => setPickCustomer(true);

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
    // Asks never appear here, whatever the filter - they are answered in Messages.
    let list = requests.filter(r => stageOf(r) !== 'ask');
    if (activeFilter !== 'all') list = list.filter(r => stageOf(r) === activeFilter);
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
          onClose={() => setQuoteFor(null)}
          onSubmit={sendQuotation}
          isSending={quoteSending}
          token={token}
          customerId={quoteFor.id}
          customerName={quoteFor.name} />
      )}
      {/* Page title is shown in the top bar; keep only the descriptive subtitle */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', margin: '0 0 1.5rem' }}>
        <p style={{ margin: 0, color: 'var(--gray)', fontSize: '0.9rem' }}>
          Quotations you have sent, and what became of them. A quotation sets a price for work that
          is not in the catalogue - printing on the customer's own shirt, a bulk job, a service.
        </p>
        <button onClick={openNewQuote} style={{ ...S.btnPrimary, whiteSpace: 'nowrap' }}>+ New quotation</button>
      </div>

      {/* Asks are answered in Messages, not here. But a count that lives only in Messages is a
          count nobody sees until they open Messages, so it is repeated where quotations live. */}
      {(cardCounts.ask ?? 0) > 0 && (
        <a href="/dashboard/business/chat" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
          margin: '0 0 1rem', padding: '0.75rem 1rem', borderRadius: 10, textDecoration: 'none',
          background: 'rgba(212,168,67,0.08)', border: '1px solid rgba(212,168,67,0.35)' }}>
          <span style={{ fontSize: '0.85rem', color: 'var(--white)' }}>
            <strong style={{ color: 'var(--gold)' }}>{cardCounts.ask} ask{cardCounts.ask === 1 ? '' : 's'}</strong> waiting for a price in Messages.
            Open the thread and press <strong>Send quotation</strong>.
          </span>
          <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--gold)', whiteSpace: 'nowrap' }}>Open Messages</span>
        </a>
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
            note={`${filteredRequests.length} request${filteredRequests.length === 1 ? '' : 's'}`} />
        </>
      ) : (<>
      {/* Summary Cards */}
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
        {FILTER_OPTIONS.map(opt => {
          const isActive = activeFilter === opt.key;
          return (
            <button
              key={opt.key}
              onClick={() => setActiveFilter(opt.key)}
              style={{
                flex: '1 1 120px',
                minWidth: '100px',
                padding: '0.75rem 1rem',
                background: isActive ? 'rgba(212,168,67,0.1)' : 'var(--dark2)',
                border: isActive ? '2px solid var(--gold)' : '1px solid var(--border)',
                borderRadius: '10px',
                cursor: 'pointer',
                textAlign: 'center',
                transition: 'all 0.2s',
              }}
            >
              <div style={{ fontSize: '1.25rem', fontWeight: 800, color: isActive ? 'var(--gold)' : 'var(--white)' }}>
                {cardCounts[opt.key] ?? 0}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--gray)', marginTop: '0.25rem' }}>{opt.label}</div>
              {STAGES[opt.key]?.hint && (
                <div style={{ fontSize: '0.65rem', color: 'var(--gray)', opacity: 0.8, marginTop: '0.1rem' }}>{STAGES[opt.key].hint}</div>
              )}
            </button>
          );
        })}
      </div>

      {/* Search */}
      <div style={{ marginBottom: '1.5rem' }}>
        <div style={{ position: 'relative', maxWidth: '400px' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--gray)" strokeWidth="2" style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)' }}>
            <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
          </svg>
          <input
            type="text"
            placeholder="Search customer or product..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '0.625rem 0.875rem 0.625rem 2.5rem',
              background: 'var(--dark2)',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              color: 'var(--white)',
              fontSize: '0.875rem',
              outline: 'none',
              boxSizing: 'border-box',
            }}
           maxLength={100}/>
        </div>
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
                        {stage === 'accepted' && req.convertedOrderId ? (
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

      {/* Review Modal */}
      {selectedRequest && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }} onClick={closeReview}>
          <div style={{ background: 'var(--dark)', border: '1px solid var(--border)', borderRadius: '16px', maxWidth: '860px', width: '100%', maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            {/* Modal Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)' }}>
              <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: 'var(--white)' }}>
                Order Request #{selectedRequest.id?.slice(0, 8).toUpperCase()}
              </h2>
              <button onClick={closeReview} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.25rem', color: 'var(--gray)' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>
            </div>
            <div style={{ display: 'flex', gap: '1.5rem', padding: '1.5rem', flexWrap: 'wrap' }}>
              {/* Left Column - Order Details */}
              <div style={{ flex: '1 1 340px', minWidth: '280px' }}>
                <h3 style={{ margin: '0 0 1rem', fontSize: '0.9rem', fontWeight: 700, color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Order Details</h3>

                {/* Product */}
                <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem', alignItems: 'flex-start' }}>
                  {selectedRequest.productThumbnail ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={selectedRequest.productThumbnail} alt="" style={{ width: '120px', height: '120px', borderRadius: '12px', objectFit: 'cover', flexShrink: 0 }} />
                  ) : (
                    <div style={{ width: '120px', height: '120px', borderRadius: '12px', background: 'var(--dark2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--gray)" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                    </div>
                  )}
                  <div>
                    <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--white)', marginBottom: '0.375rem' }}>{selectedRequest.productName || '-'}</div>
                    {selectedRequest.category && (
                      <span style={{ fontSize: '0.7rem', background: 'rgba(255,255,255,0.08)', color: 'var(--gray)', padding: '0.125rem 0.5rem', borderRadius: '999px' }}>{selectedRequest.category}</span>
                    )}
                    {selectedRequest.isOpenRequest && (
                      <div style={{ marginTop: '0.4rem' }}>
                        <span style={{ fontSize: '0.68rem', fontWeight: 700, letterSpacing: '.3px', textTransform: 'uppercase',
                          background: 'rgba(212,168,67,0.14)', color: 'var(--gold)', border: '1px solid rgba(212,168,67,0.35)',
                          padding: '2px 7px', borderRadius: 4 }}>Not in the catalogue</span>
                        <div style={{ fontSize: '0.72rem', color: 'var(--gray)', marginTop: '0.3rem', maxWidth: 280 }}>
                          Asked for through the quote form. The title above is the customer&apos;s own words,
                          not a product - price it from scratch.
                        </div>
                      </div>
                    )}
                    {(selectedRequest.neededBy || selectedRequest.budget) && (
                      <div style={{ marginTop: '0.5rem', fontSize: '0.78rem', color: 'var(--gray-light)' }}>
                        {selectedRequest.neededBy && <div>Needed by <b>{new Date(selectedRequest.neededBy).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}</b></div>}
                        {selectedRequest.budget > 0 && <div>Their budget <b>{'₱'}{Number(selectedRequest.budget).toLocaleString('en-PH')}</b></div>}
                      </div>
                    )}
                  </div>
                </div>

                {/* Customer */}
                <div style={{ marginBottom: '1rem' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--gray)', marginBottom: '0.25rem' }}>Customer</div>
                  <div style={{ fontSize: '0.9rem', color: 'var(--white)', fontWeight: 600 }}>{selectedRequest.customerName || '-'}</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--gray)' }}>{selectedRequest.customerEmail || '-'}</div>
                </div>

                {/* Quantity */}
                <div style={{ marginBottom: '1rem' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--gray)', marginBottom: '0.25rem' }}>Quantity</div>
                  <div style={{ fontSize: '0.9rem', color: 'var(--white)', fontWeight: 600 }}>{selectedRequest.quantity}</div>
                </div>

                {/* Variants */}
                <div style={{ marginBottom: '1rem' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--gray)', marginBottom: '0.25rem' }}>Selected Variants</div>
                  {selectedRequest.selectedVariants && Object.keys(selectedRequest.selectedVariants).length > 0 ? (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem' }}>
                      {Object.entries(selectedRequest.selectedVariants).map(([key, val]) => (
                        <span key={key} style={{ fontSize: '0.8rem', background: 'var(--dark2)', border: '1px solid var(--border)', borderRadius: '6px', padding: '0.25rem 0.625rem', color: 'var(--white)' }}>
                          {key}: {val}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <div style={{ fontSize: '0.85rem', color: 'var(--gray)' }}>None</div>
                  )}
                </div>

                {/* Suggested Price */}
                <div style={{ marginBottom: '1rem' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--gray)', marginBottom: '0.25rem' }}>Suggested Price</div>
                  <div style={{ fontSize: '0.9rem', color: 'var(--white)', fontWeight: 600 }}>{formatPeso(selectedRequest.suggestedPrice)}</div>
                </div>

                {/* Final Price */}
                <div style={{ marginBottom: '1rem' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--gray)', marginBottom: '0.25rem' }}>Final Price</div>
                  <div style={{ fontSize: '0.9rem', color: 'var(--white)', fontWeight: 600 }}>
                    {selectedRequest.finalPrice != null ? formatPeso(selectedRequest.finalPrice) : '-'}
                  </div>
                </div>

                {/* Est. Completion */}
                <div style={{ marginBottom: '1rem' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--gray-light)', marginBottom: '0.25rem' }}>Est. Completion</div>
                  <div style={{ fontSize: '0.9rem', color: 'var(--white)', fontWeight: 600 }}>
                    {selectedRequest.eta
                      ? new Date(selectedRequest.eta).toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' })
                      : '-'}
                  </div>
                </div>

                {/* Down Payment */}
                <div style={{ marginBottom: '1rem' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--gray)', marginBottom: '0.25rem' }}>Down Payment</div>
                  <div style={{ fontSize: '0.9rem', color: 'var(--white)', fontWeight: 600 }}>
                    {selectedRequest.downPayment != null ? formatPeso(selectedRequest.downPayment) : '-'}
                  </div>
                </div>

                {/* Payment Status */}
                <div style={{ marginBottom: '1rem' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--gray)', marginBottom: '0.25rem' }}>Payment Status</div>
                  {(() => {
                    const s = PAYMENT_STATUS_STYLES[selectedRequest.paymentStatus];
                    if (!s) return <span style={{ color: 'var(--gray)' }}>-</span>;
                    return (
                      <span style={{
                        background:   s.background,
                        color:        s.color,
                        border:       s.border,
                        borderRadius: '999px',
                        padding:      '0.25rem 0.75rem',
                        fontSize:     '0.75rem',
                        fontWeight:   700,
                      }}>
                        {s.label}
                      </span>
                    );
                  })()}
                </div>

                {/* Design File */}
                {selectedRequest.designUrl && (
                  <div style={{ marginBottom: '1rem' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--gray)', marginBottom: '0.25rem' }}>Design File</div>
                    <a href={selectedRequest.designUrl} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.85rem', color: 'var(--gold)', textDecoration: 'none', fontWeight: 600 }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                      View Design File
                    </a>
                  </div>
                )}

                {/* Design Notes */}
                {selectedRequest.designNotes && (
                  <div style={{ marginBottom: '1rem' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--gray)', marginBottom: '0.25rem' }}>Design Notes</div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--white)', background: 'var(--dark2)', border: '1px solid var(--border)', borderRadius: '8px', padding: '0.625rem 0.875rem', lineHeight: 1.5 }}>{selectedRequest.designNotes}</div>
                  </div>
                )}

                {/* Admin Comment */}
                {selectedRequest.adminComment && (
                  <div style={{ marginBottom: '1rem' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--gray)', marginBottom: '0.25rem' }}>Admin Message</div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--white)', background: 'rgba(212,168,67,0.08)', border: '1px solid rgba(212,168,67,0.25)', borderRadius: '8px', padding: '0.625rem 0.875rem', lineHeight: 1.5 }}>
                      {selectedRequest.adminComment}
                    </div>
                  </div>
                )}

                {/* Mockup */}
                {selectedRequest.mockupUrl && (
                  <div style={{ marginBottom: '1rem' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--gray)', marginBottom: '0.25rem' }}>Revised Mockup</div>
                    <a
                      href={selectedRequest.mockupUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.85rem', color: 'var(--gold)', textDecoration: 'none', fontWeight: 600 }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                        <polyline points="15 3 21 3 21 9"/>
                        <line x1="10" y1="14" x2="21" y2="3"/>
                      </svg>
                      View Revised Mockup
                    </a>
                  </div>
                )}

                {/* Submitted Date */}
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--gray)', marginBottom: '0.25rem' }}>Submitted</div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--white)' }}>{formatTimestamp(selectedRequest.createdAt)}</div>
                </div>
              </div>

              {/* Right Column - Status Management */}
              <div style={{ flex: '1 1 300px', minWidth: '280px' }}>
                <h3 style={{ margin: '0 0 1rem', fontSize: '0.9rem', fontWeight: 700, color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Quotation</h3>

                {/* Where it stands */}
                <div style={{ marginBottom: '1.25rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                    <StageBadge stage={stageOf(selectedRequest)} size="lg" />
                    <span style={{ fontSize: '0.78rem', color: 'var(--gray)' }}>
                      {stageOf(selectedRequest) === 'quoted' && daysLeft(selectedRequest) != null
                        ? `${daysLeft(selectedRequest) <= 0 ? 'Runs out today' : `${daysLeft(selectedRequest)} day${daysLeft(selectedRequest) === 1 ? '' : 's'} left to pay`}`
                        : STAGES[stageOf(selectedRequest)]?.hint}
                    </span>
                  </div>
                  {stageOf(selectedRequest) === 'accepted' && selectedRequest.convertedOrderId && (
                    <a href={`/dashboard/business/orders?order=${selectedRequest.convertedOrderId}`}
                      style={{ display: 'inline-block', marginTop: '0.6rem', fontSize: '0.8rem', color: 'var(--gold)', fontWeight: 700 }}>
                      Open the order
                    </a>
                  )}
                  {isExpiredQuote(selectedRequest) && (
                    <div style={{ marginTop: '0.5rem', padding: '0.6rem 0.75rem', borderRadius: 8,
                      background: 'rgba(224,168,82,0.1)', border: '1px solid rgba(224,168,82,0.3)',
                      fontSize: '0.78rem', color: 'var(--gray-light)', lineHeight: 1.55, maxWidth: 420 }}>
                      This quote ran out on{' '}
                      <b>{new Date(selectedRequest.expiresAt).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}</b>.
                      The customer can no longer pay it, so waiting will not bring anything in -
                      send a fresh quotation if they are still interested. Prices and material costs
                      may have moved since it was written.
                    </div>
                  )}
                </div>

                {/* Status History */}
                {selectedRequest.statusHistory && selectedRequest.statusHistory.length > 0 && (
                  <div style={{ marginBottom: '1.25rem' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--gray)', marginBottom: '0.5rem' }}>Status History</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      {[...selectedRequest.statusHistory].reverse().map((entry, i) => (
                        <div key={i} style={{ display: 'flex', gap: '0.625rem', alignItems: 'flex-start' }}>
                          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--gold)', marginTop: '0.375rem', flexShrink: 0 }} />
                          <div style={{ flex: 1 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                              <StatusBadge status={entry.status} />
                              <span style={{ fontSize: '0.75rem', color: 'var(--gray)' }}>{formatTimestamp(entry.timestamp)}</span>
                            </div>
                            {entry.note && (
                              <div style={{ fontSize: '0.8rem', color: 'var(--gray)', marginTop: '0.25rem', fontStyle: 'italic' }}>{entry.note}</div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Divider */}
                <div style={{ borderTop: '1px solid var(--border)', margin: '1.25rem 0' }} />

                {/* The form: price it and send, or close it. Shown while the request is still open
                    in any sense - an expired quote is re-sent from here too. */}
                {['ask', 'quoted', 'expired'].includes(stageOf(selectedRequest)) ? (
                  <div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--white)', marginBottom: '0.75rem' }}>
                      {stageOf(selectedRequest) === 'ask' ? 'Put a price on it' : stageOf(selectedRequest) === 'expired' ? 'Send it again' : 'Change the quotation'}
                    </div>

                    {/* Price */}
                    <div style={{ marginBottom: '0.75rem' }}>
                      <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--gray)', marginBottom: '0.375rem' }}>
                        Price <span style={{ color: 'var(--red)' }}>*</span>
                      </label>
                      <div style={{ position: 'relative' }}>
                        <span style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--gray)', fontSize: '0.875rem' }}>₱</span>
                        <input
                          type="number"
                          value={updatePrice}
                          onChange={e => setUpdatePrice(e.target.value)}
                          placeholder="0.00"
                          min="0"
                          step="0.01"
                          style={{ width: '100%', padding: '0.625rem 0.875rem 0.625rem 1.75rem', background: 'var(--dark2)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--white)', fontSize: '0.875rem', outline: 'none', boxSizing: 'border-box' }}
                        />
                      </div>
                    </div>

                    {/* Down Payment */}
                    <div style={{ marginBottom: '0.75rem' }}>
                      <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--gray)', marginBottom: '0.375rem' }}>
                        Down Payment (optional)
                      </label>
                      <div style={{ position: 'relative' }}>
                        <span style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--gray)', fontSize: '0.875rem' }}>₱</span>
                        <input
                          type="number"
                          value={updateDownPayment}
                          onChange={e => setUpdateDownPayment(e.target.value)}
                          placeholder="0.00"
                          min="0"
                          step="0.01"
                          style={{ width: '100%', padding: '0.625rem 0.875rem 0.625rem 1.75rem', background: 'var(--dark2)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--white)', fontSize: '0.875rem', outline: 'none', boxSizing: 'border-box' }}
                        />
                      </div>
                    </div>

                    {/* Validity. A quotation is an offer with a shelf life; without one the customer
                        could pay a months-old price. */}
                    <div style={{ marginBottom: '0.75rem' }}>
                      <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--gray)', marginBottom: '0.375rem' }}>
                        Valid for
                      </label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <input
                          type="text" inputMode="numeric" maxLength={2}
                          value={updateValidDays}
                          onChange={e => setUpdateValidDays(e.target.value.replace(/[^0-9]/g, ''))}
                          style={{ width: '72px', padding: '0.625rem 0.875rem', background: 'var(--dark2)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--white)', fontSize: '0.875rem', outline: 'none', boxSizing: 'border-box', textAlign: 'center' }}
                        />
                        <span style={{ fontSize: '0.8rem', color: 'var(--gray)' }}>days - the customer pays within this, or it expires</span>
                      </div>
                    </div>

                    {/* Note */}
                    <div style={{ marginBottom: '0.75rem' }}>
                      <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--gray)', marginBottom: '0.375rem' }}>Note (optional)</label>
                      <textarea
                        value={updateNote}
                        onChange={e => setUpdateNote(e.target.value)}
                        placeholder="Add a note about this update..."
                        maxLength={500}
                        rows={3}
                        style={{ width: '100%', padding: '0.625rem 0.875rem', background: 'var(--dark2)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--white)', fontSize: '0.875rem', outline: 'none', resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box' }}
                      />
                    </div>

                    {/* Admin Comment */}
                    <div style={{ marginBottom: '1rem' }}>
                      <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--gray)', marginBottom: '0.375rem' }}>
                        Message to Customer
                      </label>
                      <textarea
                        value={updateAdminComment}
                        onChange={e => setUpdateAdminComment(e.target.value)}
                        placeholder="e.g. We adjusted the background to red as requested. Please confirm."
                        rows={3}
                        style={{
                          width: '100%',
                          padding: '10px 12px',
                          backgroundColor: 'var(--dark)',
                          border: '1px solid var(--border)',
                          borderRadius: '8px',
                          color: 'var(--white)',
                          fontSize: '14px',
                          resize: 'vertical',
                          outline: 'none',
                          boxSizing: 'border-box',
                        }}
                       maxLength={2000}/>
                    </div>

                    {/* Materials (per-order BOM) - assembled at quote time; drives COGS/profit */}
                    <div style={{ marginBottom: '1rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.375rem' }}>
                        <label style={{ fontSize: '0.75rem', color: 'var(--gray)' }}>
                          Materials <span style={{ color: 'var(--gray)', fontWeight: 400 }}>(per-order BOM - sets cost / COGS)</span>
                        </label>
                        <button type="button" onClick={addMaterialRow}
                          style={{ fontSize: '0.72rem', color: 'var(--gold)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
                          + Add material
                        </button>
                      </div>
                      {updateMaterials.length === 0 && (
                        <div style={{ fontSize: '0.72rem', color: 'var(--gray)', fontStyle: 'italic' }}>No materials added yet.</div>
                      )}
                      {updateMaterials.map((m, i) => (
                        <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 60px 68px 22px', gap: '6px', alignItems: 'center', marginBottom: '6px' }}>
                          <select value={m.inventoryId} onChange={e => setMaterialRow(i, e.target.value)}
                            style={{ padding: '6px 8px', fontSize: '0.78rem', background: 'var(--dark)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--white)' }}>
                            <option value="">- Material -</option>
                            {materialsList.map(mat => <option key={mat.id} value={mat.id}>{mat.name}</option>)}
                          </select>
                          <input type="number" min="0" value={m.qty} onChange={e => setMaterialQty(i, e.target.value)} placeholder="Qty"
                            style={{ padding: '6px 8px', fontSize: '0.78rem', background: 'var(--dark)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--white)', width: '100%', boxSizing: 'border-box' }} />
                          <span style={{ fontSize: '0.72rem', color: 'var(--gray)', textAlign: 'right' }}>{formatPeso((Number(m.qty) || 0) * (Number(m.unitCost) || 0))}</span>
                          <button type="button" onClick={() => removeMaterialRow(i)}
                            style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', fontSize: '1.05rem', lineHeight: 1, padding: 0 }}>×</button>
                        </div>
                      ))}
                      {updateMaterials.length > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', fontWeight: 600, marginTop: '4px', paddingTop: '4px', borderTop: '1px solid var(--border)' }}>
                          <span style={{ color: 'var(--gray)' }}>Material cost (COGS)</span>
                          <span style={{ color: 'var(--white)' }}>{formatPeso(materialsCostTotal)}</span>
                        </div>
                      )}
                    </div>

                    {/* Mockup URL */}
                    <div style={{ marginBottom: '1rem' }}>
                      <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--gray)', marginBottom: '0.375rem' }}>
                        Mockup URL <span style={{ color: 'var(--gray)', fontWeight: 400 }}>(optional - revised design link)</span>
                      </label>
                      <input
                        type="url"
                        value={updateMockupUrl}
                        onChange={e => setUpdateMockupUrl(e.target.value)}
                        placeholder="https://..."
                        style={{
                          width: '100%',
                          padding: '10px 12px',
                          backgroundColor: 'var(--dark)',
                          border: '1px solid var(--border)',
                          borderRadius: '8px',
                          color: 'var(--white)',
                          fontSize: '14px',
                          outline: 'none',
                          boxSizing: 'border-box',
                        }}
                       maxLength={2048}/>
                    </div>

                    {/* Messages */}
                    {modalError && (
                      <div style={{ marginBottom: '0.75rem', padding: '0.625rem 0.875rem', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '8px', color: 'var(--red)', fontSize: '0.85rem' }}>{modalError}</div>
                    )}
                    {modalSuccess && (
                      <div style={{ marginBottom: '0.75rem', padding: '0.625rem 0.875rem', background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: '8px', color: 'var(--green)', fontSize: '0.85rem' }}>{modalSuccess}</div>
                    )}

                    {/* Send, or close. The send goes to the customer's chat and, for non-chat
                        requests, their email - there is no separate "notify" step. */}
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <button
                        onClick={() => handleSubmitUpdate('quote')}
                        disabled={submitting}
                        style={{ flex: '2 1 180px', padding: '0.75rem', background: submitting ? 'var(--gray)' : 'var(--gold)', color: 'var(--black)', border: 'none', borderRadius: '8px', fontWeight: 700, fontSize: '0.875rem', cursor: submitting ? 'not-allowed' : 'pointer', opacity: submitting ? 0.6 : 1 }}
                      >
                        {submitting ? 'Sending...' : stageOf(selectedRequest) === 'ask' ? 'Send quotation' : stageOf(selectedRequest) === 'expired' ? 'Send again' : 'Update and re-send'}
                      </button>
                      <button
                        onClick={() => { if (window.confirm('Close this request? The customer will not be able to pay it.')) handleSubmitUpdate('close'); }}
                        disabled={submitting}
                        style={{ flex: '1 1 120px', padding: '0.75rem', background: 'transparent', color: 'var(--red)', border: '1px solid rgba(196,30,58,0.4)', borderRadius: '8px', fontWeight: 700, fontSize: '0.875rem', cursor: submitting ? 'not-allowed' : 'pointer' }}
                      >
                        {stageOf(selectedRequest) === 'ask' ? 'Decline' : 'Cancel quotation'}
                      </button>
                    </div>
                  </div>
                ) : stageOf(selectedRequest) === 'accepted' ? (
                  <div style={{ padding: '1rem 0', color: 'var(--gray)', fontSize: '0.82rem', lineHeight: 1.55 }}>
                    The customer paid this quotation, so it is an order now. Production, payments and
                    delivery are handled on the order, not here.
                  </div>
                ) : (
                  <div style={{ textAlign: 'center', padding: '1.5rem 0', color: 'var(--gray)' }}>
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--gray)" strokeWidth="1.5" style={{ marginBottom: '0.75rem' }}>
                      <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/><path d="M15 9l-6 6M9 9l6 6"/>
                    </svg>
                    <p style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--white)', marginBottom: '0.25rem' }}>This request is closed.</p>
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '1rem 1.5rem', borderTop: '1px solid var(--border)' }}>
              <button onClick={closeReview} disabled={submitting} style={{ background: 'var(--dark2)', border: '1px solid var(--border)', borderRadius: '8px', padding: '0.625rem 1.25rem', color: 'var(--gray)', fontSize: '0.875rem', cursor: 'pointer' }}>Close</button>
            </div>
          </div>
        </div>
      )}
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
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={e => e.stopPropagation()}
        style={{ background: 'var(--dark)', border: '1px solid var(--border)', borderRadius: 10,
          width: '100%', maxWidth: 520, maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
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
