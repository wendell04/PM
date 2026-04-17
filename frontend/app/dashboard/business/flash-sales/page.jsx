'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import ErrorBoundary from '@/components/ErrorBoundary';
import { fetchWithTimeout } from '@/lib/fetchWithTimeout';

const API_URL = process.env.NEXT_PUBLIC_API_URL
  || 'http://127.0.0.1:8000';

export default function FlashSalesPage() {
  const { token } = useAuth();

  // Data
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [toggling, setToggling] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [products, setProducts] = useState([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [formError, setFormError] = useState(null);

  // Form
  const [form, setForm] = useState({
    productId: '',
    discountType: 'percentage',
    discountValue: '',
    startDate: '',
    endDate: '',
    isActive: true,
    stockLimit: '',
  });

  // Fetch
  const fetchSales = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetchWithTimeout(`${API_URL}/api/admin/flash-sales`, {
        headers: { Authorization: `Bearer ${token}` },
      }, 30000);
      if (!res.ok) throw new Error('Failed to fetch flash sales');
      const data = await res.json();
      setSales(data.data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  const fetchProducts = useCallback(async () => {
    if (!token) return;
    setLoadingProducts(true);
    try {
      const res = await fetchWithTimeout(`${API_URL}/api/admin/products`, {
        headers: { Authorization: `Bearer ${token}` },
      }, 30000);
      if (!res.ok) throw new Error('Failed to fetch products');
      const data = await res.json();
      setProducts(Array.isArray(data.data) ? data.data
        : Array.isArray(data) ? data : []);
    } catch {
      setProducts([]);
    } finally {
      setLoadingProducts(false);
    }
  }, [token]);

  useEffect(() => {
    if (!token) return;
    fetchSales();
    fetchProducts();
  }, [token, fetchSales, fetchProducts]);

  // Helpers
  function formatDate(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleString('en-PH', {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  }

  function toDatetimeLocal(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function getStatus(sale) {
    if (!sale.isActive) return { label: 'Inactive', color: '#ef4444', bg: 'rgba(239,68,68,0.12)' };
    const now = new Date();
    const start = new Date(sale.startDate);
    const end = new Date(sale.endDate);
    if (now < start) return { label: 'Upcoming', color: '#60a5fa', bg: 'rgba(96,165,250,0.12)' };
    if (now >= start && now <= end) return { label: 'Live', color: '#4ade80', bg: 'rgba(74,222,128,0.12)' };
    return { label: 'Expired', color: '#6b7280', bg: 'rgba(107,114,128,0.12)' };
  }

  function getProductBasePrice(product) {
    return product?.flatPrice ?? product?.price ?? null;
  }

  // Modal
  function openCreate() {
    setEditTarget(null);
    setForm({
      productId: '', discountType: 'percentage',
      discountValue: '', startDate: '', endDate: '',
      isActive: true, stockLimit: '',
    });
    setFormError(null);
    setShowModal(true);
  }

  function openEdit(sale) {
    setEditTarget(sale);
    setForm({
      productId: sale.productId || '',
      discountType: sale.discountType || 'percentage',
      discountValue: String(sale.discountValue || ''),
      startDate: toDatetimeLocal(sale.startDate),
      endDate: toDatetimeLocal(sale.endDate),
      isActive: sale.isActive !== false,
      stockLimit: sale.stockLimit != null ? String(sale.stockLimit) : '',
    });
    setFormError(null);
    setShowModal(true);
  }

  function closeModal() {
    setShowModal(false);
    setEditTarget(null);
    setFormError(null);
  }

  // Validation
  function validateForm() {
    if (!form.productId) return 'Please select a product.';
    if (!form.discountType) return 'Please select a discount type.';
    const val = parseFloat(form.discountValue);
    if (!form.discountValue || isNaN(val) || val <= 0)
      return 'Discount value must be greater than 0.';
    if (form.discountType === 'percentage' && val >= 100)
      return 'Percentage discount must be less than 100%.';
    if (!form.startDate) return 'Please select a start date.';
    if (!form.endDate) return 'Please select an end date.';
    if (new Date(form.endDate) <= new Date(form.startDate))
      return 'End date must be after start date.';
    return null;
  }

  // Submit
  async function handleSubmit() {
    const clientError = validateForm();
    if (clientError) { setFormError(clientError); return; }

    setSaving(true);
    setFormError(null);

    const url = editTarget
      ? `${API_URL}/api/admin/flash-sales/${editTarget.id}`
      : `${API_URL}/api/admin/flash-sales`;
    const method = editTarget ? 'PUT' : 'POST';

    try {
      const res = await fetchWithTimeout(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          ...form,
          discountValue: parseFloat(form.discountValue),
          stockLimit: form.stockLimit !== '' ? parseInt(form.stockLimit, 10) : null,
        }),
      }, 30000);
      const data = await res.json();
      if (!res.ok) {
        setFormError(data.message || 'Something went wrong.');
        return;
      }
      closeModal();
      fetchSales();
    } catch {
      setFormError('Network error. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  // Toggle
  async function handleToggle(sale) {
    setToggling(sale.id);
    try {
      const res = await fetchWithTimeout(
        `${API_URL}/api/admin/flash-sales/${sale.id}/toggle`,
        {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${token}` },
        },
        30000
      );
      if (!res.ok) throw new Error();
      const updated = await res.json();
      setSales(prev => prev.map(s =>
        s.id === sale.id ? { ...s, isActive: updated.isActive } : s
      ));
    } catch {
      // silent fail
    } finally {
      setToggling(null);
    }
  }

  // Delete
  async function handleDelete(sale) {
    if (!window.confirm(
      `Delete flash sale for "${sale.productName}"?`
    )) return;
    setDeleting(sale.id);
    try {
      const res = await fetchWithTimeout(
        `${API_URL}/api/admin/flash-sales/${sale.id}`,
        {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        },
        30000
      );
      if (!res.ok) throw new Error();
      setSales(prev => prev.filter(s => s.id !== sale.id));
    } catch {
      // silent fail
    } finally {
      setDeleting(null);
    }
  }

  // Stats
  const now = new Date();
  const liveCount = sales.filter(s =>
    s.isActive &&
    new Date(s.startDate) <= now &&
    new Date(s.endDate) >= now
  ).length;
  const upcomingCount = sales.filter(s =>
    s.isActive && new Date(s.startDate) > now
  ).length;

  return (
    <ErrorBoundary>
      <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>

        {/* Page header */}
        <div style={{ display: 'flex', alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '1.5rem', gap: '1rem', flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ fontFamily: "'Outfit', sans-serif",
              fontSize: '1.5rem', fontWeight: 700,
              color: 'var(--white)', margin: 0,
              display: 'flex', alignItems: 'center', gap: '8px' }}>
              <svg
                width="22" height="22" viewBox="0 0 24 24"
                fill="none" stroke="var(--gold)" strokeWidth="2"
                strokeLinecap="round" strokeLinejoin="round">
                <path d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              Flash Sales
            </h1>
            <p style={{ color: 'var(--gray)', fontSize: '0.85rem',
              marginTop: '0.25rem' }}>
              Create and manage limited-time discounts
            </p>
          </div>
          <button
            onClick={openCreate}
            style={{ background: 'var(--gold)', color: '#000',
              border: 'none', borderRadius: '8px',
              padding: '0.625rem 1.25rem', fontWeight: 700,
              fontSize: '0.875rem', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            + New Flash Sale
          </button>
        </div>

        {/* Summary bar */}
        <div style={{ display: 'flex', gap: '1rem',
          marginBottom: '1.5rem', flexWrap: 'wrap' }}>
          {[
            { label: 'Total', value: sales.length,
              color: 'var(--white)' },
            { label: 'Live Now', value: liveCount,
              color: '#4ade80' },
            { label: 'Upcoming', value: upcomingCount,
              color: '#60a5fa' },
          ].map(chip => (
            <div key={chip.label} style={{
              background: 'var(--dark2)',
              border: '1px solid var(--border)',
              borderRadius: '8px', padding: '0.75rem 1.25rem',
              display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span style={{ fontSize: '1.25rem', fontWeight: 700,
                color: chip.color }}>{chip.value}</span>
              <span style={{ fontSize: '0.8rem',
                color: 'var(--gray)' }}>{chip.label}</span>
            </div>
          ))}
        </div>

        {/* Error state */}
        {error && (
          <div style={{ padding: '1rem', background: 'rgba(239,68,68,0.1)',
            border: '1px solid rgba(239,68,68,0.3)',
            borderRadius: '8px', color: '#ef4444',
            marginBottom: '1rem', display: 'flex',
            justifyContent: 'space-between', alignItems: 'center' }}>
            <span>{error}</span>
            <button onClick={fetchSales}
              style={{ background: 'none', border: '1px solid #ef4444',
                color: '#ef4444', borderRadius: '6px',
                padding: '0.25rem 0.75rem', cursor: 'pointer',
                fontSize: '0.8rem' }}>
              Retry
            </button>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div style={{ border: '1px solid var(--border)',
            borderRadius: '10px', overflow: 'hidden' }}>
            {[...Array(5)].map((_, i) => (
              <div key={i} style={{
                height: '60px', background: 'var(--dark2)',
                borderBottom: i < 4 ? '1px solid var(--border)' : 'none',
                opacity: 1 - i * 0.15,
                animation: 'pulse 1.5s ease-in-out infinite',
              }} />
            ))}
          </div>
        )}

        {/* Empty */}
        {!loading && !error && sales.length === 0 && (
          <div style={{ textAlign: 'center', padding: '4rem 2rem',
            color: 'var(--gray)', border: '1px solid var(--border)',
            borderRadius: '10px' }}>
            <div>
              <svg
                width="48" height="48" viewBox="0 0 24 24"
                fill="none" stroke="var(--gold)" strokeWidth="1.5"
                strokeLinecap="round" strokeLinejoin="round"
                style={{ opacity: 0.5, marginBottom: '1rem' }}>
                <path d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <p style={{ fontSize: '1rem', color: 'var(--white)',
              marginBottom: '0.5rem', fontWeight: 600 }}>
              No flash sales yet
            </p>
            <p style={{ fontSize: '0.85rem' }}>
              Create one to get started
            </p>
          </div>
        )}

        {/* Table */}
        {!loading && !error && sales.length > 0 && (
          <div style={{ border: '1px solid var(--border)',
            borderRadius: '10px', overflowX: 'auto',
            scrollbarWidth: 'thin',
            scrollbarColor: 'var(--gold) var(--dark2)' }}>
            <table style={{ width: '100%',
              borderCollapse: 'collapse', minWidth: '860px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)',
                  background: 'var(--dark2)' }}>
                  {['Product', 'Discount', 'Original',
                    'Sale Price', 'Stock', 'Start', 'End',
                    'Status', 'Actions'].map(col => (
                    <th key={col} style={{
                      padding: '0.875rem 1rem', textAlign: 'left',
                      fontSize: '0.75rem', fontWeight: 600,
                      color: 'var(--gray)', textTransform: 'uppercase',
                      letterSpacing: '0.05em', whiteSpace: 'nowrap',
                    }}>{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sales.map(sale => {
                  const status = getStatus(sale);
                  const isDeleting = deleting === sale.id;
                  const isToggling = toggling === sale.id;

                  return (
                    <tr key={sale.id}
                      style={{ borderBottom: '1px solid var(--border)',
                        transition: 'background 0.15s' }}
                      onMouseEnter={e =>
                        e.currentTarget.style.background =
                          'rgba(255,255,255,0.02)'}
                      onMouseLeave={e =>
                        e.currentTarget.style.background = ''}>

                      {/* Product */}
                      <td style={{ padding: '0.875rem 1rem' }}>
                        <div style={{ display: 'flex',
                          alignItems: 'center', gap: '0.625rem' }}>
                          {sale.productThumbnail ? (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img src={sale.productThumbnail}
                              alt={sale.productName}
                              style={{ width: '32px', height: '32px',
                                borderRadius: '6px',
                                objectFit: 'cover',
                                border: '1px solid var(--border)',
                                flexShrink: 0 }} />
                          ) : (
                            <div style={{ width: '32px', height: '32px',
                              borderRadius: '6px',
                              background: 'var(--dark2)',
                              border: '1px solid var(--border)',
                              flexShrink: 0 }} />
                          )}
                          <span style={{ fontSize: '0.875rem',
                            color: 'var(--white)', fontWeight: 500,
                            maxWidth: '180px', overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap' }}>
                            {sale.productName || '—'}
                          </span>
                        </div>
                      </td>

                      {/* Discount badge */}
                      <td style={{ padding: '0.875rem 1rem' }}>
                        <span style={{
                          padding: '0.25rem 0.625rem',
                          borderRadius: '999px', fontWeight: 700,
                          fontSize: '0.8rem', whiteSpace: 'nowrap',
                          background: sale.discountType === 'percentage'
                            ? 'rgba(74,222,128,0.12)'
                            : 'rgba(96,165,250,0.12)',
                          color: sale.discountType === 'percentage'
                            ? '#4ade80' : '#60a5fa',
                          border: `1px solid ${
                            sale.discountType === 'percentage'
                              ? 'rgba(74,222,128,0.3)'
                              : 'rgba(96,165,250,0.3)'}`,
                        }}>
                          {sale.discountType === 'percentage'
                            ? `${sale.discountValue}%`
                            : `₱${sale.discountValue} OFF`}
                        </span>
                      </td>

                      {/* Original price */}
                      <td style={{ padding: '0.875rem 1rem',
                        color: 'var(--gray)', fontSize: '0.875rem' }}>
                        {sale.originalPrice != null
                          ? `₱${Number(sale.originalPrice)
                              .toLocaleString('en-PH',
                                { minimumFractionDigits: 2,
                                  maximumFractionDigits: 2 })}`
                          : '—'}
                      </td>

                      {/* Sale price */}
                      <td style={{ padding: '0.875rem 1rem',
                        color: 'var(--gold)', fontWeight: 700,
                        fontSize: '0.875rem' }}>
                        {sale.discountedPrice != null
                          ? `₱${Number(sale.discountedPrice)
                              .toLocaleString('en-PH',
                                { minimumFractionDigits: 2,
                                  maximumFractionDigits: 2 })}`
                          : '—'}
                      </td>

                      {/* Stock */}
                      <td style={{ padding: '0.875rem 1rem', whiteSpace: 'nowrap' }}>
                        {sale.isOnDemand ? (
                          <span style={{ fontSize: '0.75rem', color: 'var(--gray)' }}>On-demand</span>
                        ) : sale.currentStock == null ? (
                          <span style={{ fontSize: '0.75rem', color: 'var(--gray)' }}>—</span>
                        ) : (
                          <span style={{
                            fontSize: '0.8rem', fontWeight: 600,
                            color: sale.currentStock === 0
                              ? '#ef4444'
                              : sale.currentStock <= 5
                                ? '#f59e0b'
                                : 'var(--white)',
                          }}>
                            {sale.currentStock === 0 ? '⚠ Out of stock' : `${sale.currentStock} left`}
                            {sale.stockLimit != null && (
                              <span style={{ color: 'var(--gray)', fontWeight: 400 }}>
                                {' '}/ {sale.stockLimit} cap
                              </span>
                            )}
                          </span>
                        )}
                      </td>

                      {/* Start */}
                      <td style={{ padding: '0.875rem 1rem',
                        color: 'var(--gray)', fontSize: '0.8rem',
                        whiteSpace: 'nowrap' }}>
                        {formatDate(sale.startDate)}
                      </td>

                      {/* End */}
                      <td style={{ padding: '0.875rem 1rem',
                        color: 'var(--gray)', fontSize: '0.8rem',
                        whiteSpace: 'nowrap' }}>
                        {formatDate(sale.endDate)}
                      </td>

                      {/* Status badge */}
                      <td style={{ padding: '0.875rem 1rem' }}>
                        <span style={{
                          padding: '0.2rem 0.625rem',
                          borderRadius: '999px', fontSize: '0.75rem',
                          fontWeight: 700, whiteSpace: 'nowrap',
                          background: status.bg, color: status.color,
                        }}>
                          {status.label}
                        </span>
                      </td>

                      {/* Actions */}
                      <td style={{ padding: '0.875rem 1rem' }}>
                        <div style={{ display: 'flex',
                          alignItems: 'center', gap: '0.5rem' }}>

                          {/* Toggle */}
                          <button
                            onClick={() => handleToggle(sale)}
                            disabled={!!isToggling}
                            title={sale.isActive
                              ? 'Deactivate' : 'Activate'}
                            style={{
                              background: sale.isActive
                                ? 'rgba(74,222,128,0.12)'
                                : 'rgba(107,114,128,0.12)',
                              border: `1px solid ${sale.isActive
                                ? 'rgba(74,222,128,0.3)'
                                : 'rgba(107,114,128,0.3)'}`,
                              borderRadius: '6px', padding: '0.35rem',
                              cursor: isToggling ? 'wait' : 'pointer',
                              color: sale.isActive
                                ? '#4ade80' : '#6b7280',
                              display: 'flex', alignItems: 'center',
                              justifyContent: 'center',
                            }}>
                            {isToggling ? (
                              <svg width="14" height="14"
                                viewBox="0 0 24 24" fill="none"
                                stroke="currentColor" strokeWidth="2"
                                style={{ animation:
                                  'spin 1s linear infinite' }}>
                                <path d="M21 12a9 9 0 11-18 0
                                  9 9 0 0118 0z" opacity=".25"/>
                                <path d="M21 12a9 9 0 00-9-9"/>
                              </svg>
                            ) : (
                              <svg width="14" height="14"
                                viewBox="0 0 24 24" fill="none"
                                stroke="currentColor" strokeWidth="2.5">
                                <path d="M13 10V3L4 14h7v7l9-11h-7z"/>
                              </svg>
                            )}
                          </button>

                          {/* Edit */}
                          <button
                            onClick={() => openEdit(sale)}
                            title="Edit"
                            style={{
                              background: 'rgba(212,168,67,0.1)',
                              border: '1px solid rgba(212,168,67,0.3)',
                              borderRadius: '6px', padding: '0.35rem',
                              cursor: 'pointer', color: 'var(--gold)',
                              display: 'flex', alignItems: 'center',
                              justifyContent: 'center',
                            }}>
                            <svg width="14" height="14"
                              viewBox="0 0 24 24" fill="none"
                              stroke="currentColor" strokeWidth="2">
                              <path d="M11 4H4a2 2 0 00-2 2v14a2 2
                                0 002 2h14a2 2 0 002-2v-7"/>
                              <path d="M18.5 2.5a2.121 2.121 0 013
                                3L12 15l-4 1 1-4 9.5-9.5z"/>
                            </svg>
                          </button>

                          {/* Delete */}
                          <button
                            onClick={() => handleDelete(sale)}
                            disabled={!!isDeleting}
                            title="Delete"
                            style={{
                              background: 'rgba(239,68,68,0.1)',
                              border: '1px solid rgba(239,68,68,0.3)',
                              borderRadius: '6px', padding: '0.35rem',
                              cursor: isDeleting ? 'wait' : 'pointer',
                              color: '#ef4444',
                              display: 'flex', alignItems: 'center',
                              justifyContent: 'center',
                            }}>
                            {isDeleting ? (
                              <svg width="14" height="14"
                                viewBox="0 0 24 24" fill="none"
                                stroke="currentColor" strokeWidth="2"
                                style={{ animation:
                                  'spin 1s linear infinite' }}>
                                <path d="M21 12a9 9 0 11-18 0
                                  9 9 0 0118 0z" opacity=".25"/>
                                <path d="M21 12a9 9 0 00-9-9"/>
                              </svg>
                            ) : (
                              <svg width="14" height="14"
                                viewBox="0 0 24 24" fill="none"
                                stroke="currentColor" strokeWidth="2">
                                <polyline points="3 6 5 6 21 6"/>
                                <path d="M19 6l-1 14H6L5 6"/>
                                <path d="M10 11v6M14 11v6"/>
                                <path d="M9 6V4h6v2"/>
                              </svg>
                            )}
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

        {/* ── MODAL ── */}
        {showModal && (
          <div
            onClick={closeModal}
            style={{
              position: 'fixed', inset: 0, zIndex: 1000,
              background: 'rgba(0,0,0,0.7)',
              display: 'flex', alignItems: 'center',
              justifyContent: 'center', padding: '1rem',
            }}>
            <div
              onClick={e => e.stopPropagation()}
              style={{
                background: 'var(--dark)',
                border: '1px solid var(--border)',
                borderRadius: '16px', width: '100%',
                maxWidth: '480px', maxHeight: '90vh',
                overflowY: 'auto',
                scrollbarWidth: 'thin',
                scrollbarColor: 'var(--gold) var(--dark2)',
              }}>

              {/* Modal header */}
              <div style={{
                display: 'flex', alignItems: 'center',
                justifyContent: 'space-between',
                padding: '1.25rem 1.5rem',
                borderBottom: '1px solid var(--border)',
                position: 'sticky', top: 0, zIndex: 10,
                background: 'var(--dark)',
              }}>
                <h2 style={{ fontFamily: "'Outfit', sans-serif",
                  fontSize: '1.1rem', fontWeight: 700,
                  color: 'var(--white)', margin: 0 }}>
                  {editTarget ? 'Edit Flash Sale' : 'New Flash Sale'}
                </h2>
                <button onClick={closeModal} disabled={saving} style={{
                  background: 'var(--dark2)',
                  border: '1px solid var(--border)',
                  borderRadius: '8px', width: '32px', height: '32px',
                  display: 'flex', alignItems: 'center',
                  justifyContent: 'center', cursor: 'pointer',
                  color: 'var(--gray)',
                }}>
                  <svg width="16" height="16" viewBox="0 0 24 24"
                    fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 6L6 18M6 6l12 12"/>
                  </svg>
                </button>
              </div>

              {/* Modal body */}
              <div style={{ padding: '1.5rem',
                display: 'flex', flexDirection: 'column',
                gap: '1rem' }}>

                {/* Product select */}
                <div>
                  <label style={{ display: 'block',
                    fontSize: '0.8rem', fontWeight: 600,
                    color: 'var(--gray)', marginBottom: '0.5rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em' }}>
                    Product <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <select
                    value={form.productId}
                    onChange={e => setForm(f =>
                      ({ ...f, productId: e.target.value }))}
                    disabled={loadingProducts}
                    style={{
                      width: '100%', padding: '0.625rem 0.875rem',
                      background: 'var(--dark2)',
                      border: '1px solid var(--border)',
                      borderRadius: '8px', color: 'var(--white)',
                      fontSize: '0.875rem',
                      cursor: loadingProducts
                        ? 'wait' : 'pointer',
                    }}>
                    <option value="">
                      {loadingProducts
                        ? 'Loading...' : 'Select a product'}
                    </option>
                    {products.map(p => {
                      const basePrice = getProductBasePrice(p);
                      const label = p.subCategoryName || p.name
                        || 'Unnamed';
                      return (
                        <option key={p._id || p.id}
                          value={p._id || p.id}>
                          {label}
                          {basePrice != null
                            ? ` — ₱${basePrice}` : ''}
                        </option>
                      );
                    })}
                  </select>
                </div>

                {/* Discount type */}
                <div>
                  <label style={{ display: 'block',
                    fontSize: '0.8rem', fontWeight: 600,
                    color: 'var(--gray)', marginBottom: '0.5rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em' }}>
                    Discount Type <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <select
                    value={form.discountType}
                    onChange={e => setForm(f =>
                      ({ ...f, discountType: e.target.value }))}
                    style={{
                      width: '100%', padding: '0.625rem 0.875rem',
                      background: 'var(--dark2)',
                      border: '1px solid var(--border)',
                      borderRadius: '8px', color: 'var(--white)',
                      fontSize: '0.875rem', cursor: 'pointer',
                    }}>
                    <option value="percentage">Percentage (%)</option>
                    <option value="fixed">Fixed Amount (₱)</option>
                  </select>
                </div>

                {/* Discount value */}
                <div>
                  <label style={{ display: 'block',
                    fontSize: '0.8rem', fontWeight: 600,
                    color: 'var(--gray)', marginBottom: '0.5rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em' }}>
                    {form.discountType === 'percentage'
                      ? 'Discount (%)' : 'Discount Amount (₱)'}
                    <span style={{ color: '#ef4444' }}> *</span>
                  </label>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={form.discountValue}
                    onChange={e => setForm(f =>
                      ({ ...f, discountValue: e.target.value }))}
                    onKeyDown={e => {
                      if (['e','E','+','-'].includes(e.key)) {
                        e.preventDefault();
                      }
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleSubmit();
                      }
                    }}
                    placeholder={form.discountType === 'percentage'
                      ? 'e.g. 20' : 'e.g. 50'}
                    style={{
                      width: '100%', padding: '0.625rem 0.875rem',
                      background: 'var(--dark2)',
                      border: '1px solid var(--border)',
                      borderRadius: '8px', color: 'var(--white)',
                      fontSize: '0.875rem', boxSizing: 'border-box',
                    }}
                  />
                </div>

                {/* Start date */}
                <div>
                  <label style={{ display: 'block',
                    fontSize: '0.8rem', fontWeight: 600,
                    color: 'var(--gray)', marginBottom: '0.5rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em' }}>
                    Start Date <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input
                    type="datetime-local"
                    value={form.startDate}
                    onChange={e => setForm(f =>
                      ({ ...f, startDate: e.target.value }))}
                    style={{
                      width: '100%', padding: '0.625rem 0.875rem',
                      background: 'var(--dark2)',
                      border: '1px solid var(--border)',
                      borderRadius: '8px', color: 'var(--white)',
                      fontSize: '0.875rem', boxSizing: 'border-box',
                      colorScheme: 'dark',
                    }}
                  />
                </div>

                {/* End date */}
                <div>
                  <label style={{ display: 'block',
                    fontSize: '0.8rem', fontWeight: 600,
                    color: 'var(--gray)', marginBottom: '0.5rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em' }}>
                    End Date <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input
                    type="datetime-local"
                    value={form.endDate}
                    onChange={e => setForm(f =>
                      ({ ...f, endDate: e.target.value }))}
                    style={{
                      width: '100%', padding: '0.625rem 0.875rem',
                      background: 'var(--dark2)',
                      border: '1px solid var(--border)',
                      borderRadius: '8px', color: 'var(--white)',
                      fontSize: '0.875rem', boxSizing: 'border-box',
                      colorScheme: 'dark',
                    }}
                  />
                </div>

                {/* Stock Limit */}
                <div>
                  <label style={{ display: 'block',
                    fontSize: '0.8rem', fontWeight: 600,
                    color: 'var(--gray)', marginBottom: '0.5rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em' }}>
                    Stock Limit <span style={{ color: 'var(--gray)', fontWeight: 400, textTransform: 'none' }}>(optional)</span>
                  </label>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={form.stockLimit}
                    onChange={e => setForm(f => ({ ...f, stockLimit: e.target.value }))}
                    onKeyDown={e => { if (['e','E','+','-'].includes(e.key)) e.preventDefault(); }}
                    placeholder="e.g. 50 — leave blank for unlimited"
                    style={{
                      width: '100%', padding: '0.625rem 0.875rem',
                      background: 'var(--dark2)',
                      border: '1px solid var(--border)',
                      borderRadius: '8px', color: 'var(--white)',
                      fontSize: '0.875rem', boxSizing: 'border-box',
                    }}
                  />
                  {/* Live stock warning for selected product */}
                  {(() => {
                    if (!form.productId) return null;
                    const stockInfo = editTarget
                      ? { stock: editTarget.currentStock, isOnDemand: editTarget.isOnDemand }
                      : null;
                    if (!stockInfo || stockInfo.isOnDemand) return null;
                    if (stockInfo.stock == null) return null;
                    const color = stockInfo.stock === 0 ? '#ef4444' : stockInfo.stock <= 5 ? '#f59e0b' : '#4ade80';
                    const msg = stockInfo.stock === 0
                      ? '⚠ This product is out of stock.'
                      : stockInfo.stock <= 5
                        ? `⚠ Only ${stockInfo.stock} units in stock.`
                        : `✓ ${stockInfo.stock} units available.`;
                    return (
                      <div style={{ marginTop: '0.5rem', fontSize: '0.78rem', color }}>
                        {msg}
                      </div>
                    );
                  })()}
                </div>

                {/* Active checkbox */}
                <label style={{ display: 'flex',
                  alignItems: 'center', gap: '0.625rem',
                  cursor: 'pointer', userSelect: 'none' }}>
                  <input
                    type="checkbox"
                    checked={form.isActive}
                    onChange={e => setForm(f =>
                      ({ ...f, isActive: e.target.checked }))}
                    style={{ width: '16px', height: '16px',
                      accentColor: 'var(--gold)', cursor: 'pointer' }}
                  />
                  <span style={{ fontSize: '0.875rem',
                    color: 'var(--white)' }}>
                    Active immediately
                  </span>
                </label>

                {/* Form error */}
                {formError && (
                  <div style={{
                    padding: '0.75rem 1rem',
                    background: 'rgba(239,68,68,0.1)',
                    border: '1px solid rgba(239,68,68,0.3)',
                    borderRadius: '8px', color: '#ef4444',
                    fontSize: '0.85rem',
                  }}>
                    {formError}
                  </div>
                )}

                {/* Actions */}
                <div style={{ display: 'flex', gap: '0.75rem',
                  justifyContent: 'flex-end',
                  paddingTop: '0.5rem' }}>
                  <button onClick={closeModal} disabled={saving}
                    style={{
                      background: 'var(--dark2)',
                      border: '1px solid var(--border)',
                      borderRadius: '8px',
                      padding: '0.625rem 1.25rem',
                      color: 'var(--gray)', cursor: 'pointer',
                      fontSize: '0.875rem', fontWeight: 600,
                    }}>
                    Cancel
                  </button>
                  <button
                    onClick={handleSubmit}
                    disabled={saving}
                    style={{
                      background: saving
                        ? 'rgba(212,168,67,0.5)' : 'var(--gold)',
                      color: '#000', border: 'none',
                      borderRadius: '8px',
                      padding: '0.625rem 1.25rem',
                      fontWeight: 700, fontSize: '0.875rem',
                      cursor: saving ? 'wait' : 'pointer',
                    }}>
                    {saving
                      ? 'Saving...'
                      : editTarget ? 'Save Changes' : 'Create'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Spin keyframe */}
        <style>{`
          @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
          @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
          }
        `}</style>
      </div>
    </ErrorBoundary>
  );
}
