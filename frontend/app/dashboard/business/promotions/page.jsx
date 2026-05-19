'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import ErrorBoundary from '@/components/ErrorBoundary';
import { fetchWithTimeout } from '@/lib/fetchWithTimeout';
import {
  fetchVouchers, createVoucher, updateVoucher,
  deleteVoucher, toggleVoucher,
} from '@/lib/voucherApi';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';

// ─── SVG icons per benefit category ─────────────────────────────────────────
function CatIcon({ type, size = 16, style }) {
  const s = { width: size, height: size, flexShrink: 0, ...style };
  const base = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: '1.75', strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true' };
  if (type === 'monetary') return (
    <svg {...base} style={s}><circle cx="12" cy="12" r="9"/><path d="M14.5 9a2.5 2 0 0 0-5 0c0 1.5.8 2 2.5 2.5 1.7.5 2.5 1 2.5 2.5a2.5 2 0 0 1-5 0"/><line x1="12" y1="6.5" x2="12" y2="8"/><line x1="12" y1="16" x2="12" y2="17.5"/></svg>
  );
  if (type === 'product') return (
    <svg {...base} style={s}><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>
  );
  if (type === 'service') return (
    <svg {...base} style={s}><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
  );
  if (type === 'production') return (
    <svg {...base} style={s}><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
  );
  if (type === 'loyalty') return (
    <svg {...base} style={s}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
  );
  if (type === 'experiential') return (
    <svg {...base} style={s}><polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/></svg>
  );
  return null;
}

// ─── Benefit catalogue ──────────────────────────────────────────────────────
const BENEFIT_CATEGORIES = [
  {
    key: 'monetary', label: 'Monetary',
    types: [
      { key: 'percentage',  label: 'Percentage Discount' },
      { key: 'fixed',       label: 'Fixed Amount Off' },
      { key: 'tiered',      label: 'Tiered Savings' },
    ],
  },
  {
    key: 'product', label: 'Product / Quantity',
    types: [
      { key: 'free_item',    label: 'Free Item With Order' },
      { key: 'buy_x_get_y', label: 'Buy X, Get X Free' },
      { key: 'upgrade',     label: 'Free Product Upgrade' },
    ],
  },
  {
    key: 'service', label: 'Service',
    types: [
      { key: 'rush_fee_waiver', label: 'Rush Fee Waiver' },
      { key: 'free_design',     label: 'Free Design Service' },
      { key: 'free_reprint',    label: 'Free Reprint' },
      { key: 'priority_queue',  label: 'Priority Production Queue' },
    ],
  },
  {
    key: 'production', label: 'Production',
    types: [
      { key: 'extended_payment', label: 'Deferred Payment Terms' },
      { key: 'free_proof',       label: 'Free Sample Proof' },
    ],
  },
  {
    key: 'loyalty', label: 'Loyalty',
    types: [
      { key: 'bonus_points',   label: 'Bonus Points Multiplier' },
      { key: 'points_to_peso', label: 'Points-to-Peso Redemption' },
      { key: 'early_access',   label: 'Early Sale Access' },
    ],
  },
  {
    key: 'experiential', label: 'Exclusive',
    types: [
      { key: 'birthday_discount',  label: 'Birthday Month Discount' },
      { key: 'anniversary_reward', label: 'Order Anniversary Reward' },
      { key: 'vip_badge',          label: 'VIP Permanent Pricing' },
    ],
  },
];

const ALL_BENEFIT_TYPE_KEYS = BENEFIT_CATEGORIES.flatMap(c => c.types.map(t => t.key));

const EMPTY_VOUCHER = {
  code: '', benefitCategory: 'monetary', benefitType: 'percentage',
  benefitDescription: '', discountType: 'percentage', discountValue: '',
  minOrderAmount: '', maxUses: '', isActive: true, expiresAt: '',
};

const EMPTY_FLASH = {
  productId: '', discountType: 'percentage', discountValue: '',
  startDate: '', endDate: '', isActive: true, stockLimit: '',
};

// ─── helpers ────────────────────────────────────────────────────────────────
function pad(n) { return String(n).padStart(2, '0'); }
function toDatetimeLocal(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-PH', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}
function getFlashStatus(sale) {
  if (!sale.isActive) return { label: 'Inactive', color: 'var(--red)',   bg: 'rgba(239,68,68,0.12)' };
  const now = new Date();
  if (new Date(sale.startDate) > now) return { label: 'Upcoming', color: 'var(--blue)',  bg: 'rgba(96,165,250,0.12)' };
  if (new Date(sale.endDate) >= now)  return { label: 'Live',     color: 'var(--green)', bg: 'rgba(74,222,128,0.12)' };
  return { label: 'Expired', color: 'var(--gray)', bg: 'rgba(107,114,128,0.12)' };
}

// Category accent colours
const CAT_COLORS = {
  monetary:     { color: '#d4a843', bg: 'rgba(212,168,67,0.12)',  border: 'rgba(212,168,67,0.3)'  },
  product:      { color: '#60a5fa', bg: 'rgba(96,165,250,0.12)', border: 'rgba(96,165,250,0.3)'  },
  service:      { color: '#a78bfa', bg: 'rgba(167,139,250,0.12)',border: 'rgba(167,139,250,0.3)' },
  production:   { color: '#fb923c', bg: 'rgba(251,146,60,0.12)', border: 'rgba(251,146,60,0.3)'  },
  loyalty:      { color: '#f472b6', bg: 'rgba(244,114,182,0.12)',border: 'rgba(244,114,182,0.3)' },
  experiential: { color: '#4ade80', bg: 'rgba(74,222,128,0.12)', border: 'rgba(74,222,128,0.3)'  },
};

// Shared input style
const inp = {
  width: '100%', padding: '0.6rem 0.875rem',
  background: 'var(--dark2)', border: '1px solid var(--border)',
  borderRadius: '8px', color: 'var(--white)', fontSize: '0.875rem',
  boxSizing: 'border-box',
};
const lbl = {
  display: 'block', fontSize: '0.75rem', fontWeight: 600,
  color: 'var(--gray)', marginBottom: '0.375rem',
  textTransform: 'uppercase', letterSpacing: '0.04em',
};

// ─── Main component ──────────────────────────────────────────────────────────
function PromotionsInner() {
  const { token } = useAuth();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState(() => searchParams?.get('tab') === 'flash_sales' ? 'flash_sales' : 'vouchers');

  return (
    <div style={{ padding: '1.5rem', maxWidth: '1200px', margin: '0 auto' }}>
      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0', marginBottom: '1.25rem', borderBottom: '1px solid var(--border)' }}>
        {[
          { key: 'vouchers',    label: 'Vouchers' },
          { key: 'flash_sales', label: 'Flash Sales' },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              padding: '0.5rem 1.125rem',
              background: 'none', border: 'none',
              borderBottom: tab === t.key ? '2px solid var(--gold)' : '2px solid transparent',
              color: tab === t.key ? 'var(--gold)' : 'var(--gray)',
              fontWeight: tab === t.key ? 700 : 500,
              fontSize: '0.875rem', cursor: 'pointer',
              marginBottom: '-1px', transition: 'color 0.15s',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'vouchers'    && <VouchersTab    token={token} />}
      {tab === 'flash_sales' && <FlashSalesTab  token={token} />}
    </div>
  );
}

export default function PromotionsPage() {
  return (
    <ErrorBoundary>
      <Suspense>
        <PromotionsInner />
      </Suspense>
    </ErrorBoundary>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// VOUCHERS TAB
// ════════════════════════════════════════════════════════════════════════════
function VouchersTab({ token }) {
  const [vouchers, setVouchers]   = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [form, setForm]           = useState(EMPTY_VOUCHER);
  const [formError, setFormError] = useState(null);
  const [saving, setSaving]       = useState(false);
  const [toggling, setToggling]   = useState(null);
  const [deleteId, setDeleteId]   = useState(null);
  const [deleting, setDeleting]   = useState(false);
  const [page, setPage]           = useState(1);
  const [rpp, setRpp]             = useState(10);
  const [catFilter, setCatFilter] = useState('all');

  const load = useCallback(async () => {
    if (!token) { setLoading(false); return; }
    setLoading(true); setError(null);
    try {
      const data = await fetchVouchers(token);
      setVouchers(data.data ?? []);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  // Filter + paginate
  const filtered = catFilter === 'all' ? vouchers : vouchers.filter(v => (v.benefitCategory || 'monetary') === catFilter);
  const totalPages = Math.max(1, Math.ceil(filtered.length / rpp));
  const paged = filtered.slice((page - 1) * rpp, page * rpp);

  function openCreate() {
    setEditTarget(null); setForm(EMPTY_VOUCHER); setFormError(null); setShowModal(true);
  }
  function openEdit(v) {
    setEditTarget(v);
    const cat = v.benefitCategory || 'monetary';
    setForm({
      code:               v.code || '',
      benefitCategory:    cat,
      benefitType:        v.benefitType || (cat === 'monetary' ? 'percentage' : BENEFIT_CATEGORIES.find(c => c.key === cat)?.types[0]?.key || ''),
      benefitDescription: v.benefitDescription || '',
      discountType:       v.discountType || 'percentage',
      discountValue:      String(v.discountValue ?? ''),
      minOrderAmount:     v.minOrderAmount != null ? String(v.minOrderAmount) : '',
      maxUses:            v.maxUses != null ? String(v.maxUses) : '',
      isActive:           v.isActive ?? true,
      expiresAt:          v.expiresAt ? v.expiresAt.slice(0, 10) : '',
    });
    setFormError(null); setShowModal(true);
  }
  function closeModal() { setShowModal(false); setEditTarget(null); setFormError(null); }

  function validate() {
    if (!form.code.trim()) return 'Code is required.';
    if (!form.benefitCategory) return 'Please select a benefit category.';
    if (!form.benefitType) return 'Please select a benefit type.';
    if (form.benefitCategory === 'monetary') {
      const val = parseFloat(form.discountValue);
      if (!form.discountValue || isNaN(val) || val <= 0) return 'Discount value must be > 0.';
      if (form.discountType === 'percentage' && val >= 100) return 'Percentage must be < 100%.';
    }
    return null;
  }

  async function handleSave() {
    const err = validate();
    if (err) { setFormError(err); return; }
    setSaving(true); setFormError(null);
    try {
      const payload = {
        code:               form.code.trim().toUpperCase(),
        benefitCategory:    form.benefitCategory,
        benefitType:        form.benefitType,
        benefitDescription: form.benefitDescription || null,
        discountType:       form.benefitCategory === 'monetary' ? form.discountType : null,
        discountValue:      form.benefitCategory === 'monetary' && form.discountValue ? parseFloat(form.discountValue) : null,
        minOrderAmount:     form.minOrderAmount ? parseFloat(form.minOrderAmount) : null,
        maxUses:            form.maxUses ? parseInt(form.maxUses) : null,
        isActive:           form.isActive,
        expiresAt:          form.expiresAt || null,
      };
      if (editTarget) await updateVoucher(token, editTarget._id || editTarget.id, payload);
      else await createVoucher(token, payload);
      closeModal(); load();
    } catch (err) { setFormError(err.message); }
    finally { setSaving(false); }
  }

  async function handleToggle(v) {
    const id = v._id || v.id;
    setToggling(id);
    setError(null);
    try { await toggleVoucher(token, id); load(); }
    catch (err) { setError(err.message); }
    finally { setToggling(null); }
  }

  async function handleDelete() {
    if (!deleteId) return;
    setDeleting(true);
    try { await deleteVoucher(token, deleteId); setDeleteId(null); load(); }
    catch (err) { setError(err.message); }
    finally { setDeleting(false); }
  }

  // Summary counts per category
  const catCounts = BENEFIT_CATEGORIES.reduce((acc, c) => {
    acc[c.key] = vouchers.filter(v => (v.benefitCategory || 'monetary') === c.key).length;
    return acc;
  }, {});
  const activeCnt = vouchers.filter(v => {
    const exp = v.expiresAt && new Date(v.expiresAt) < new Date();
    const maxed = v.maxUses != null && v.usedCount >= v.maxUses;
    return v.isActive && !exp && !maxed;
  }).length;

  if (loading) return <SkelLoader />;

  return (
    <>
      {/* Toolbar: stats + action + filter */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', flexWrap: 'wrap', marginBottom: '0.875rem' }}>
        {[
          { label: 'Total',  value: vouchers.length, color: 'var(--white)' },
          { label: 'Active', value: activeCnt,        color: 'var(--green)' },
        ].map(c => (
          <div key={c.label} style={{ background: 'var(--dark2)', border: '1px solid var(--border)', borderRadius: '7px', padding: '0.4rem 0.875rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <span style={{ fontSize: '1rem', fontWeight: 700, color: c.color }}>{c.value}</span>
            <span style={{ fontSize: '0.75rem', color: 'var(--gray)' }}>{c.label}</span>
          </div>
        ))}
        <div style={{ flex: 1, display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
          {[{ key: 'all', label: 'All' }, ...BENEFIT_CATEGORIES].map(c => {
            const ac = CAT_COLORS[c.key] || {};
            const active = catFilter === c.key;
            return (
              <button
                key={c.key}
                onClick={() => { setCatFilter(c.key); setPage(1); }}
                style={{
                  padding: '0.25rem 0.75rem', borderRadius: '999px', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s',
                  display: 'inline-flex', alignItems: 'center', gap: '4px',
                  background: active ? (ac.bg || 'rgba(212,168,67,0.15)') : 'var(--dark2)',
                  border: `1px solid ${active ? (ac.border || 'rgba(212,168,67,0.4)') : 'var(--border)'}`,
                  color: active ? (ac.color || 'var(--gold)') : 'var(--gray)',
                }}
              >
                {c.key !== 'all' && <CatIcon type={c.key} size={11} />}
                {c.label}
                {c.key !== 'all' && catCounts[c.key] > 0 && (
                  <span style={{ fontSize: '0.68rem', opacity: 0.7 }}>({catCounts[c.key]})</span>
                )}
              </button>
            );
          })}
        </div>
        <button
          onClick={openCreate}
          style={{ padding: '0.45rem 1rem', background: 'var(--gold)', color: 'var(--black)', border: 'none', borderRadius: '7px', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer', whiteSpace: 'nowrap' }}
        >
          + New Voucher
        </button>
      </div>

      {error && (
        <div style={{ marginBottom: '1rem', padding: '12px 16px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '8px', color: 'var(--red)', fontSize: '0.875rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {error}
          <button onClick={load} style={{ background: 'none', border: '1px solid var(--red)', borderRadius: '6px', color: 'var(--red)', padding: '0.2rem 0.6rem', cursor: 'pointer', fontSize: '0.8rem' }}>Retry</button>
        </div>
      )}

      {/* Table */}
      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden' }}>
        {paged.length === 0 ? (
          <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--gray)', fontSize: '0.875rem' }}>
            {catFilter === 'all' ? 'No vouchers yet. Create one to get started.' : `No ${catFilter} vouchers yet.`}
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['Code', 'Category', 'Benefit / Discount', 'Min Order', 'Uses', 'Expires', 'Status', 'Actions'].map(h => (
                  <th key={h} style={{ padding: '11px 14px', textAlign: 'left', fontSize: '0.7rem', color: 'var(--gray)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paged.map((v, i) => {
                const cat = v.benefitCategory || 'monetary';
                const ac = CAT_COLORS[cat] || CAT_COLORS.monetary;
                const catMeta = BENEFIT_CATEGORIES.find(c => c.key === cat);
                const typeMeta = catMeta?.types.find(t => t.key === v.benefitType);
                const isExpired = v.expiresAt && new Date(v.expiresAt) < new Date();
                const isMaxed   = v.maxUses != null && v.usedCount >= v.maxUses;
                const statusOk  = v.isActive && !isExpired && !isMaxed;

                return (
                  <tr key={String(v._id || v.id || `v-${i}`)} style={{ borderBottom: '1px solid var(--border)', opacity: statusOk ? 1 : 0.6 }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'}
                    onMouseLeave={e => e.currentTarget.style.background = ''}>

                    <td style={{ padding: '11px 14px', fontSize: '0.875rem', color: 'var(--gold)', fontWeight: 700, fontFamily: 'monospace' }}>{v.code}</td>

                    <td style={{ padding: '11px 14px' }}>
                      <span style={{ padding: '2px 8px', borderRadius: '999px', fontSize: '0.72rem', fontWeight: 600, background: ac.bg, color: ac.color, border: `1px solid ${ac.border}`, whiteSpace: 'nowrap' }}>
                        {catMeta?.icon} {catMeta?.label || cat}
                      </span>
                    </td>

                    <td style={{ padding: '11px 14px', fontSize: '0.82rem', color: 'var(--white)', maxWidth: '220px' }}>
                      {cat === 'monetary' ? (
                        <span style={{ fontWeight: 600 }}>
                          {v.discountType === 'percentage' ? `${v.discountValue}%` : `₱${Number(v.discountValue).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} OFF
                        </span>
                      ) : (
                        <span style={{ color: 'var(--gray)' }}>{typeMeta?.label || v.benefitType || '—'}</span>
                      )}
                      {v.benefitDescription && (
                        <div style={{ fontSize: '0.72rem', color: 'var(--gray)', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '200px' }}>
                          {v.benefitDescription}
                        </div>
                      )}
                    </td>

                    <td style={{ padding: '11px 14px', fontSize: '0.82rem', color: 'var(--white)' }}>
                      {v.minOrderAmount != null ? `₱${Number(v.minOrderAmount).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}
                    </td>

                    <td style={{ padding: '11px 14px', fontSize: '0.82rem', color: 'var(--white)', whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span>{v.usedCount ?? 0}{v.maxUses != null ? ` / ${v.maxUses}` : ' / ∞'}</span>
                        {v.maxUses != null && (
                          <div style={{ width: '48px', height: '4px', background: 'rgba(255,255,255,0.1)', borderRadius: '2px', overflow: 'hidden' }}>
                            <div style={{ height: '100%', borderRadius: '2px', width: `${Math.min(100, ((v.usedCount ?? 0) / v.maxUses) * 100)}%`, background: isMaxed ? 'var(--red)' : 'var(--green)' }} />
                          </div>
                        )}
                      </div>
                    </td>

                    <td style={{ padding: '11px 14px', fontSize: '0.82rem', color: isExpired ? 'var(--red)' : 'var(--white)', whiteSpace: 'nowrap' }}>
                      {v.expiresAt ? new Date(v.expiresAt).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                    </td>

                    <td style={{ padding: '11px 14px' }}>
                      <span style={{ padding: '3px 10px', borderRadius: '20px', fontSize: '0.7rem', fontWeight: 600, background: statusOk ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.12)', color: statusOk ? 'var(--green)' : 'var(--red)' }}>
                        {!v.isActive ? 'Inactive' : isExpired ? 'Expired' : isMaxed ? 'Maxed' : 'Active'}
                      </span>
                    </td>

                    <td style={{ padding: '11px 14px' }}>
                      <div style={{ display: 'flex', gap: '0.4rem' }}>
                        <button onClick={() => openEdit(v)} style={{ padding: '4px 10px', background: 'var(--border)', border: 'none', borderRadius: '6px', color: 'var(--white)', fontSize: '0.75rem', cursor: 'pointer' }}>Edit</button>
                        <button onClick={() => handleToggle(v)} disabled={toggling === (v._id || v.id)} style={{ padding: '4px 10px', background: v.isActive ? 'rgba(239,68,68,0.12)' : 'rgba(34,197,94,0.12)', border: 'none', borderRadius: '6px', color: v.isActive ? 'var(--red)' : 'var(--green)', fontSize: '0.75rem', cursor: toggling === (v._id || v.id) ? 'not-allowed' : 'pointer', opacity: toggling === (v._id || v.id) ? 0.5 : 1 }}>
                          {toggling === (v._id || v.id) ? '...' : v.isActive ? 'Disable' : 'Enable'}
                        </button>
                        <button onClick={() => setDeleteId(v._id || v.id)} style={{ padding: '4px 10px', background: 'rgba(239,68,68,0.12)', border: 'none', borderRadius: '6px', color: 'var(--red)', fontSize: '0.75rem', cursor: 'pointer' }}>Del</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {filtered.length > rpp && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.6rem 1rem', borderTop: '1px solid var(--border)', fontSize: '0.8rem', color: 'var(--gray)', flexWrap: 'wrap', gap: '0.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              Rows:
              <select value={rpp} onChange={e => { setRpp(Number(e.target.value)); setPage(1); }} style={{ background: 'var(--dark)', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--white)', padding: '0.2rem 0.4rem', fontSize: '0.78rem' }}>
                {[5,10,25,50].map(n => <option key={n}>{n}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
              <button onClick={() => setPage(p => Math.max(1, p-1))} disabled={page<=1} style={{ padding: '0.2rem 0.6rem', background: 'var(--dark)', border: '1px solid var(--border)', borderRadius: '6px', color: page<=1?'var(--gray)':'var(--white)', cursor: page<=1?'not-allowed':'pointer' }}>‹</button>
              <span>{page} / {totalPages}</span>
              <button onClick={() => setPage(p => Math.min(totalPages, p+1))} disabled={page>=totalPages} style={{ padding: '0.2rem 0.6rem', background: 'var(--dark)', border: '1px solid var(--border)', borderRadius: '6px', color: page>=totalPages?'var(--gray)':'var(--white)', cursor: page>=totalPages?'not-allowed':'pointer' }}>›</button>
            </div>
          </div>
        )}
      </div>

      {/* Create / Edit Modal */}
      {showModal && (
        <VoucherModal
          form={form} setForm={setForm}
          formError={formError} saving={saving}
          editTarget={editTarget}
          onSave={handleSave} onClose={closeModal}
        />
      )}

      {/* Delete confirm */}
      {deleteId && (
        <ConfirmModal
          message="Delete this voucher? This cannot be undone."
          onConfirm={handleDelete} onCancel={() => setDeleteId(null)}
          loading={deleting} confirmLabel="Delete"
        />
      )}
    </>
  );
}

// ─── Voucher Modal ───────────────────────────────────────────────────────────
function VoucherModal({ form, setForm, formError, saving, editTarget, onSave, onClose }) {
  const catMeta = BENEFIT_CATEGORIES.find(c => c.key === form.benefitCategory);
  const isMonetary = form.benefitCategory === 'monetary';

  function handleCategoryChange(cat) {
    const firstType = BENEFIT_CATEGORIES.find(c => c.key === cat)?.types[0]?.key || '';
    setForm(f => ({
      ...f,
      benefitCategory: cat,
      benefitType: firstType,
      // Ensure discountType is always a non-null string; restore default when returning to monetary
      discountType: cat === 'monetary' ? (f.discountType || 'percentage') : '',
    }));
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.72)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--dark)', border: '1px solid var(--border)', borderRadius: '14px', width: '100%', maxWidth: '520px', maxHeight: '92vh', overflowY: 'auto', scrollbarWidth: 'thin' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, background: 'var(--dark)', zIndex: 10 }}>
          <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: 'var(--white)' }}>
            {editTarget ? 'Edit Voucher' : 'New Voucher'}
          </h2>
          <button onClick={onClose} style={{ background: 'var(--dark2)', border: '1px solid var(--border)', borderRadius: '8px', width: '30px', height: '30px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--gray)' }}>✕</button>
        </div>

        <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {formError && (
            <div style={{ padding: '10px 14px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '8px', color: 'var(--red)', fontSize: '0.85rem' }}>{formError}</div>
          )}

          {/* Code */}
          <div>
            <label style={lbl}>Voucher Code <span style={{ color: 'var(--red)' }}>*</span></label>
            <input value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))} placeholder="e.g. SAVE20, BIRTHDAY10" style={{ ...inp, fontFamily: 'monospace', fontWeight: 700, letterSpacing: '1px' }} />
            <p style={{ margin: '4px 0 0', fontSize: '0.72rem', color: 'var(--gray)' }}>Owner manually shares this code with customers to claim the benefit.</p>
          </div>

          {/* Benefit Category */}
          <div>
            <label style={lbl}>Benefit Category <span style={{ color: 'var(--red)' }}>*</span></label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' }}>
              {BENEFIT_CATEGORIES.map(c => {
                const ac = CAT_COLORS[c.key];
                const active = form.benefitCategory === c.key;
                return (
                  <button key={c.key} type="button" onClick={() => handleCategoryChange(c.key)}
                    style={{ padding: '0.5rem', borderRadius: '8px', border: `1px solid ${active ? ac.border : 'var(--border)'}`, background: active ? ac.bg : 'var(--dark2)', color: active ? ac.color : 'var(--gray)', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', textAlign: 'center', transition: 'all 0.15s', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                    <CatIcon type={c.key} size={18} />
                    {c.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Benefit Type */}
          <div>
            <label style={lbl}>Benefit Type <span style={{ color: 'var(--red)' }}>*</span></label>
            <select value={form.benefitType} onChange={e => setForm(f => ({ ...f, benefitType: e.target.value }))} style={inp}>
              {catMeta?.types.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
            </select>
          </div>

          {/* Monetary fields */}
          {isMonetary && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <label style={lbl}>Discount Type <span style={{ color: 'var(--red)' }}>*</span></label>
                  <select value={form.discountType || 'percentage'} onChange={e => setForm(f => ({ ...f, discountType: e.target.value }))} style={inp}>
                    <option value="percentage">Percentage (%)</option>
                    <option value="fixed">Fixed Amount (₱)</option>
                    <option value="tiered">Tiered (manual)</option>
                  </select>
                </div>
                <div>
                  <label style={lbl}>{form.discountType === 'percentage' ? 'Discount %' : 'Amount (₱)'} <span style={{ color: 'var(--red)' }}>*</span></label>
                  <input type="number" min="0.01" step="0.01" value={form.discountValue} onChange={e => setForm(f => ({ ...f, discountValue: e.target.value }))} placeholder={form.discountType === 'percentage' ? 'e.g. 20' : 'e.g. 100'} style={inp} />
                </div>
              </div>
              <div>
                <label style={lbl}>Minimum Order Amount (₱) <span style={{ color: 'var(--gray)', textTransform: 'none' }}>— optional</span></label>
                <input type="number" min="0" step="0.01" value={form.minOrderAmount} onChange={e => setForm(f => ({ ...f, minOrderAmount: e.target.value }))} placeholder="e.g. 500" style={inp} />
              </div>
            </>
          )}

          {/* Non-monetary description */}
          {!isMonetary && (
            <div>
              <label style={lbl}>Benefit Description <span style={{ color: 'var(--gray)', textTransform: 'none' }}>— shown to customer on redemption</span></label>
              <textarea
                value={form.benefitDescription}
                onChange={e => setForm(f => ({ ...f, benefitDescription: e.target.value }))}
                placeholder="e.g. Show this code at checkout to receive 1 free ref magnet with your order."
                rows={3}
                style={{ ...inp, resize: 'vertical', lineHeight: '1.5' }}
              />
            </div>
          )}

          {/* Common fields */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div>
              <label style={lbl}>Max Uses <span style={{ color: 'var(--gray)', textTransform: 'none' }}>— optional</span></label>
              <input type="number" min="1" step="1" value={form.maxUses} onChange={e => setForm(f => ({ ...f, maxUses: e.target.value }))} placeholder="∞ unlimited" style={inp} />
            </div>
            <div>
              <label style={lbl}>Expiry Date <span style={{ color: 'var(--gray)', textTransform: 'none' }}>— optional</span></label>
              <input type="date" value={form.expiresAt} onChange={e => setForm(f => ({ ...f, expiresAt: e.target.value }))} style={inp} />
            </div>
          </div>

          {/* Active toggle */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '0.75rem', borderTop: '1px solid var(--border)' }}>
            <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--white)' }}>Active</span>
            <button type="button" onClick={() => setForm(f => ({ ...f, isActive: !f.isActive }))}
              style={{ width: '44px', height: '24px', borderRadius: '12px', border: 'none', cursor: 'pointer', background: form.isActive ? 'var(--gold)' : 'var(--border)', position: 'relative', flexShrink: 0 }}>
              <span style={{ position: 'absolute', top: '2px', left: form.isActive ? '22px' : '2px', width: '20px', height: '20px', borderRadius: '50%', background: 'var(--white)', transition: 'left 0.2s' }} />
            </button>
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: '0.75rem', paddingTop: '0.25rem' }}>
            <button onClick={onClose} disabled={saving} style={{ flex: 1, padding: '10px', background: 'var(--border)', border: 'none', borderRadius: '8px', color: 'var(--white)', fontWeight: 600, fontSize: '0.875rem', cursor: 'pointer' }}>Cancel</button>
            <button onClick={onSave} disabled={saving} style={{ flex: 2, padding: '10px', background: 'var(--gold)', border: 'none', borderRadius: '8px', color: 'var(--black)', fontWeight: 700, fontSize: '0.875rem', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
              {saving ? 'Saving…' : editTarget ? 'Save Changes' : 'Create Voucher'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// FLASH SALES TAB
// ════════════════════════════════════════════════════════════════════════════
function FlashSalesTab({ token }) {
  const [sales, setSales]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);
  const [saving, setSaving]     = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [toggling, setToggling] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [products, setProducts]   = useState([]);
  const [formError, setFormError] = useState(null);
  const [confirmModal, setConfirmModal] = useState(null);
  const [form, setForm] = useState(EMPTY_FLASH);

  const fetchSales = useCallback(async () => {
    if (!token) { setLoading(false); return; }
    setLoading(true); setError(null);
    try {
      const res = await fetchWithTimeout(`${API_URL}/api/admin/flash-sales`, { headers: { Authorization: `Bearer ${token}` } }, 30000);
      if (!res.ok) throw new Error('Failed to fetch flash sales');
      const data = await res.json();
      setSales(data.data || []);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, [token]);

  const fetchProducts = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetchWithTimeout(`${API_URL}/api/admin/products`, { headers: { Authorization: `Bearer ${token}` } }, 30000);
      if (!res.ok) return;
      const data = await res.json();
      setProducts(Array.isArray(data.data) ? data.data : Array.isArray(data) ? data : []);
    } catch { /* silent */ }
  }, [token]);

  useEffect(() => { fetchSales(); fetchProducts(); }, [fetchSales, fetchProducts]);

  function openCreate() { setEditTarget(null); setForm(EMPTY_FLASH); setFormError(null); setShowModal(true); }
  function openEdit(sale) {
    setEditTarget(sale);
    setForm({
      productId: sale.productId || '', discountType: sale.discountType || 'percentage',
      discountValue: String(sale.discountValue || ''), startDate: toDatetimeLocal(sale.startDate),
      endDate: toDatetimeLocal(sale.endDate), isActive: sale.isActive !== false,
      stockLimit: sale.stockLimit != null ? String(sale.stockLimit) : '',
    });
    setFormError(null); setShowModal(true);
  }
  function closeModal() { setShowModal(false); setEditTarget(null); setFormError(null); }

  function validateFlash() {
    if (!form.productId) return 'Please select a product.';
    const val = parseFloat(form.discountValue);
    if (!form.discountValue || isNaN(val) || val <= 0) return 'Discount value must be > 0.';
    if (form.discountType === 'percentage' && val >= 100) return 'Percentage must be < 100%.';
    if (!form.startDate) return 'Please select a start date.';
    if (!form.endDate) return 'Please select an end date.';
    if (new Date(form.endDate) <= new Date(form.startDate)) return 'End date must be after start date.';
    return null;
  }

  async function handleSubmit() {
    const ce = validateFlash(); if (ce) { setFormError(ce); return; }
    setSaving(true); setFormError(null);
    const url = editTarget ? `${API_URL}/api/admin/flash-sales/${editTarget.id}` : `${API_URL}/api/admin/flash-sales`;
    try {
      const res = await fetchWithTimeout(url, {
        method: editTarget ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ...form, discountValue: parseFloat(form.discountValue), stockLimit: form.stockLimit !== '' ? parseInt(form.stockLimit) : null }),
      }, 30000);
      const data = await res.json();
      if (!res.ok) { setFormError(data.message || 'Something went wrong.'); return; }
      closeModal(); fetchSales();
    } catch { setFormError('Network error. Please try again.'); }
    finally { setSaving(false); }
  }

  async function handleToggle(sale) {
    setToggling(sale.id);
    try {
      const res = await fetchWithTimeout(`${API_URL}/api/admin/flash-sales/${sale.id}/toggle`, { method: 'PATCH', headers: { Authorization: `Bearer ${token}` } }, 30000);
      if (!res.ok) throw new Error();
      const updated = await res.json();
      setSales(prev => prev.map(s => s.id === sale.id ? { ...s, isActive: updated.isActive } : s));
    } catch { /* silent */ }
    finally { setToggling(null); }
  }

  async function handleDelete(sale) {
    setConfirmModal({
      message: `Delete flash sale for "${sale.productName}"?`,
      onConfirm: async () => {
        setConfirmModal(null);
        setDeleting(sale.id);
        try {
          const res = await fetchWithTimeout(`${API_URL}/api/admin/flash-sales/${sale.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }, 30000);
          if (!res.ok) throw new Error('Failed to delete');
          setSales(prev => prev.filter(s => s.id !== sale.id));
        } catch (err) { setError(err.message); }
        finally { setDeleting(null); }
      },
    });
  }

  const now = new Date();
  const liveCount     = sales.filter(s => s.isActive && new Date(s.startDate) <= now && new Date(s.endDate) >= now).length;
  const upcomingCount = sales.filter(s => s.isActive && new Date(s.startDate) > now).length;

  if (loading) return <SkelLoader />;

  return (
    <>
      {/* Stats + action */}
      <div style={{ display: 'flex', gap: '0.625rem', flexWrap: 'wrap', marginBottom: '0.875rem', alignItems: 'center' }}>
        {[{ label: 'Total', value: sales.length, color: 'var(--white)' }, { label: 'Live Now', value: liveCount, color: 'var(--green)' }, { label: 'Upcoming', value: upcomingCount, color: 'var(--blue)' }].map(c => (
          <div key={c.label} style={{ background: 'var(--dark2)', border: '1px solid var(--border)', borderRadius: '7px', padding: '0.4rem 0.875rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <span style={{ fontSize: '1rem', fontWeight: 700, color: c.color }}>{c.value}</span>
            <span style={{ fontSize: '0.75rem', color: 'var(--gray)' }}>{c.label}</span>
          </div>
        ))}
        <button onClick={openCreate} style={{ marginLeft: 'auto', padding: '0.45rem 1rem', background: 'var(--gold)', color: 'var(--black)', border: 'none', borderRadius: '7px', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer' }}>
          + New Flash Sale
        </button>
      </div>

      {error && (
        <div style={{ padding: '1rem', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '8px', color: 'var(--red)', marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {error}
          <button onClick={fetchSales} style={{ background: 'none', border: '1px solid var(--red)', borderRadius: '6px', color: 'var(--red)', padding: '0.25rem 0.75rem', cursor: 'pointer', fontSize: '0.8rem' }}>Retry</button>
        </div>
      )}

      {!error && sales.length === 0 && (
        <div style={{ textAlign: 'center', padding: '2.5rem 2rem', color: 'var(--gray)', border: '1px solid var(--border)', borderRadius: '10px' }}>
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.5, marginBottom: '0.75rem' }}><path d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
          <p style={{ fontSize: '0.95rem', color: 'var(--white)', marginBottom: '0.25rem', fontWeight: 600 }}>No flash sales yet</p>
          <p style={{ fontSize: '0.82rem' }}>Create one to get started</p>
        </div>
      )}

      {!error && sales.length > 0 && (
        <div style={{ border: '1px solid var(--border)', borderRadius: '10px', overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '800px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--dark2)' }}>
                {['Product', 'Discount', 'Original', 'Sale Price', 'Quantity', 'Start', 'End', 'Status', 'Actions'].map(col => (
                  <th key={col} style={{ padding: '0.875rem 1rem', textAlign: 'left', fontSize: '0.72rem', fontWeight: 600, color: 'var(--gray)', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sales.map(sale => {
                const status = getFlashStatus(sale);
                const stockPct = sale.stockLimit > 0 ? Math.min(100, ((sale.stockUsed ?? 0) / sale.stockLimit) * 100) : null;
                return (
                  <tr key={sale.id} style={{ borderBottom: '1px solid var(--border)' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'}
                    onMouseLeave={e => e.currentTarget.style.background = ''}>

                    <td style={{ padding: '0.875rem 1rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
                        {sale.productThumbnail
                          /* eslint-disable-next-line @next/next/no-img-element */
                          ? <img src={sale.productThumbnail} alt="" style={{ width: '32px', height: '32px', borderRadius: '6px', objectFit: 'cover', border: '1px solid var(--border)', flexShrink: 0 }} />
                          : <div style={{ width: '32px', height: '32px', borderRadius: '6px', background: 'var(--dark2)', border: '1px solid var(--border)', flexShrink: 0 }} />
                        }
                        <span style={{ fontSize: '0.875rem', color: 'var(--white)', fontWeight: 500, maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sale.productName || '—'}</span>
                      </div>
                    </td>

                    <td style={{ padding: '0.875rem 1rem' }}>
                      <span style={{ padding: '0.25rem 0.625rem', borderRadius: '999px', fontWeight: 700, fontSize: '0.78rem', whiteSpace: 'nowrap', background: sale.discountType === 'percentage' ? 'rgba(74,222,128,0.12)' : 'rgba(96,165,250,0.12)', color: sale.discountType === 'percentage' ? 'var(--green)' : 'var(--blue)', border: `1px solid ${sale.discountType === 'percentage' ? 'rgba(74,222,128,0.3)' : 'rgba(96,165,250,0.3)'}` }}>
                        {sale.discountType === 'percentage' ? `${sale.discountValue}%` : `₱${sale.discountValue} OFF`}
                      </span>
                    </td>

                    <td style={{ padding: '0.875rem 1rem', color: 'var(--gray)', fontSize: '0.85rem' }}>
                      {sale.originalPrice != null ? `₱${Number(sale.originalPrice).toLocaleString('en-PH', { minimumFractionDigits: 2 })}` : '—'}
                    </td>

                    <td style={{ padding: '0.875rem 1rem', color: 'var(--gold)', fontWeight: 700, fontSize: '0.85rem' }}>
                      {sale.discountedPrice != null ? `₱${Number(sale.discountedPrice).toLocaleString('en-PH', { minimumFractionDigits: 2 })}` : '—'}
                    </td>

                    {/* Quantity column — progress bar */}
                    <td style={{ padding: '0.875rem 1rem', minWidth: '110px' }}>
                      {sale.isOnDemand ? (
                        <span style={{ fontSize: '0.75rem', color: 'var(--gray)' }}>On-demand</span>
                      ) : sale.stockLimit == null ? (
                        <span style={{ fontSize: '0.75rem', color: 'var(--gray)' }}>
                          {sale.stockUsed > 0 ? `${sale.stockUsed} sold` : '—'}
                        </span>
                      ) : (
                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', marginBottom: '4px' }}>
                            <span style={{ color: 'var(--gray)' }}>{sale.stockUsed ?? 0} sold</span>
                            <span style={{ color: stockPct >= 80 ? 'var(--red)' : 'var(--gray)' }}>cap {sale.stockLimit}</span>
                          </div>
                          <div style={{ height: '5px', background: 'rgba(255,255,255,0.08)', borderRadius: '3px', overflow: 'hidden' }}>
                            <div style={{ height: '100%', borderRadius: '3px', width: `${stockPct}%`, background: stockPct >= 80 ? 'var(--red)' : stockPct >= 50 ? 'var(--gold)' : 'var(--green)', transition: 'width 0.3s' }} />
                          </div>
                          {sale.currentStock != null && (
                            <div style={{ fontSize: '0.7rem', color: sale.currentStock === 0 ? 'var(--red)' : sale.currentStock <= 5 ? 'var(--orange)' : 'var(--gray)', marginTop: '3px' }}>
                              {sale.currentStock === 0 ? 'Out of stock' : `${sale.currentStock} in stock`}
                            </div>
                          )}
                        </div>
                      )}
                    </td>

                    <td style={{ padding: '0.875rem 1rem', color: 'var(--gray)', fontSize: '0.78rem', whiteSpace: 'nowrap' }}>{formatDate(sale.startDate)}</td>
                    <td style={{ padding: '0.875rem 1rem', color: 'var(--gray)', fontSize: '0.78rem', whiteSpace: 'nowrap' }}>{formatDate(sale.endDate)}</td>

                    <td style={{ padding: '0.875rem 1rem' }}>
                      <span style={{ padding: '0.2rem 0.625rem', borderRadius: '999px', fontSize: '0.72rem', fontWeight: 700, whiteSpace: 'nowrap', background: status.bg, color: status.color }}>{status.label}</span>
                    </td>

                    <td style={{ padding: '0.875rem 1rem' }}>
                      <div style={{ display: 'flex', gap: '0.4rem' }}>
                        <button onClick={() => handleToggle(sale)} disabled={toggling === sale.id} title={sale.isActive ? 'Deactivate' : 'Activate'}
                          style={{ background: sale.isActive ? 'rgba(74,222,128,0.12)' : 'rgba(107,114,128,0.12)', border: `1px solid ${sale.isActive ? 'rgba(74,222,128,0.3)' : 'rgba(107,114,128,0.3)'}`, borderRadius: '6px', padding: '0.35rem', cursor: 'pointer', color: sale.isActive ? 'var(--green)' : 'var(--gray)', display: 'flex', alignItems: 'center' }}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
                        </button>
                        <button onClick={() => openEdit(sale)} title="Edit"
                          style={{ background: 'rgba(212,168,67,0.1)', border: '1px solid rgba(212,168,67,0.3)', borderRadius: '6px', padding: '0.35rem', cursor: 'pointer', color: 'var(--gold)', display: 'flex', alignItems: 'center' }}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                        </button>
                        <button onClick={() => handleDelete(sale)} disabled={deleting === sale.id} title="Delete"
                          style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '6px', padding: '0.35rem', cursor: 'pointer', color: 'var(--red)', display: 'flex', alignItems: 'center' }}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Flash sale modal */}
      {showModal && (
        <FlashSaleModal
          form={form} setForm={setForm} formError={formError} saving={saving}
          editTarget={editTarget} products={products}
          onSubmit={handleSubmit} onClose={closeModal}
        />
      )}

      {confirmModal && (
        <ConfirmModal message={confirmModal.message} onConfirm={confirmModal.onConfirm} onCancel={() => setConfirmModal(null)} confirmLabel="Delete" />
      )}
    </>
  );
}

// ─── Flash Sale Modal ────────────────────────────────────────────────────────
function FlashSaleModal({ form, setForm, formError, saving, editTarget, products, onSubmit, onClose }) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--dark)', border: '1px solid var(--border)', borderRadius: '16px', width: '100%', maxWidth: '480px', maxHeight: '90vh', overflowY: 'auto', scrollbarWidth: 'thin' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, background: 'var(--dark)', zIndex: 10 }}>
          <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: 'var(--white)' }}>{editTarget ? 'Edit Flash Sale' : 'New Flash Sale'}</h2>
          <button onClick={onClose} style={{ background: 'var(--dark2)', border: '1px solid var(--border)', borderRadius: '8px', width: '30px', height: '30px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--gray)' }}>✕</button>
        </div>
        <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {formError && <div style={{ padding: '0.75rem 1rem', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '8px', color: 'var(--red)', fontSize: '0.85rem' }}>{formError}</div>}

          <div>
            <label style={lbl}>Product <span style={{ color: 'var(--red)' }}>*</span></label>
            <select value={form.productId} onChange={e => setForm(f => ({ ...f, productId: e.target.value }))} style={inp}>
              <option value="">Select a product</option>
              {products.map(p => {
                const price = p.flatPrice ?? p.price;
                return <option key={p._id || p.id} value={p._id || p.id}>{p.subCategoryName || p.name || 'Unnamed'}{price != null ? ` — ₱${price}` : ''}</option>;
              })}
            </select>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div>
              <label style={lbl}>Discount Type <span style={{ color: 'var(--red)' }}>*</span></label>
              <select value={form.discountType} onChange={e => setForm(f => ({ ...f, discountType: e.target.value }))} style={inp}>
                <option value="percentage">Percentage (%)</option>
                <option value="fixed">Fixed Amount (₱)</option>
              </select>
            </div>
            <div>
              <label style={lbl}>{form.discountType === 'percentage' ? 'Discount %' : 'Amount (₱)'} <span style={{ color: 'var(--red)' }}>*</span></label>
              <input type="number" min="0.01" step="0.01" value={form.discountValue} onChange={e => setForm(f => ({ ...f, discountValue: e.target.value }))} onKeyDown={e => ['e','E','+','-'].includes(e.key) && e.preventDefault()} placeholder={form.discountType === 'percentage' ? 'e.g. 20' : 'e.g. 50'} style={inp} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div>
              <label style={lbl}>Start Date <span style={{ color: 'var(--red)' }}>*</span></label>
              <input type="datetime-local" value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))} style={{ ...inp, colorScheme: 'dark' }} />
            </div>
            <div>
              <label style={lbl}>End Date <span style={{ color: 'var(--red)' }}>*</span></label>
              <input type="datetime-local" value={form.endDate} onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))} style={{ ...inp, colorScheme: 'dark' }} />
            </div>
          </div>

          <div>
            <label style={lbl}>Stock Limit <span style={{ color: 'var(--gray)', textTransform: 'none' }}>— optional</span></label>
            <input type="number" min="1" step="1" value={form.stockLimit} onChange={e => setForm(f => ({ ...f, stockLimit: e.target.value }))} onKeyDown={e => ['e','E','+','-'].includes(e.key) && e.preventDefault()} placeholder="e.g. 50 — leave blank for unlimited" style={inp} />
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', cursor: 'pointer' }}>
            <input type="checkbox" checked={form.isActive} onChange={e => setForm(f => ({ ...f, isActive: e.target.checked }))} style={{ width: '16px', height: '16px', accentColor: 'var(--gold)', cursor: 'pointer' }} />
            <span style={{ fontSize: '0.875rem', color: 'var(--white)' }}>Active immediately</span>
          </label>

          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
            <button onClick={onClose} disabled={saving} style={{ padding: '0.625rem 1.25rem', background: 'var(--dark2)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--gray)', cursor: 'pointer', fontSize: '0.875rem', fontWeight: 600 }}>Cancel</button>
            <button onClick={onSubmit} disabled={saving} style={{ padding: '0.625rem 1.25rem', background: saving ? 'rgba(212,168,67,0.5)' : 'var(--gold)', color: 'var(--black)', border: 'none', borderRadius: '8px', fontWeight: 700, fontSize: '0.875rem', cursor: saving ? 'wait' : 'pointer' }}>
              {saving ? 'Saving...' : editTarget ? 'Save Changes' : 'Create'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Shared helpers ──────────────────────────────────────────────────────────
function SkelLoader() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <style>{`@keyframes promoSkel{0%,100%{opacity:1}50%{opacity:.45}}`}</style>
      {[...Array(5)].map((_, i) => (
        <div key={i} style={{ height: '56px', borderRadius: '8px', background: 'rgba(255,255,255,0.04)', animation: 'promoSkel 1.5s ease-in-out infinite' }} />
      ))}
    </div>
  );
}

function ConfirmModal({ message, onConfirm, onCancel, loading, confirmLabel = 'Confirm' }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: 'var(--dark2)', border: '1px solid var(--border)', borderRadius: '12px', padding: '2rem', maxWidth: '380px', width: '90%', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--white)' }}>Confirm</div>
        <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--gray)' }}>{message}</p>
        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
          <button onClick={onCancel} disabled={loading} style={{ padding: '0.5rem 1.25rem', background: 'transparent', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--gray)', cursor: 'pointer', fontWeight: 600, fontSize: '0.875rem' }}>Cancel</button>
          <button onClick={onConfirm} disabled={loading} style={{ padding: '0.5rem 1.25rem', background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.4)', borderRadius: '8px', color: '#ef4444', cursor: 'pointer', fontWeight: 700, fontSize: '0.875rem', opacity: loading ? 0.6 : 1 }}>{loading ? 'Working…' : confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
