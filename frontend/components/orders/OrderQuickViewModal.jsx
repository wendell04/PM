'use client';

import { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';
import { useAuth } from '@/contexts/AuthContext';
import { getStatusBadge } from '@/lib/utils/orderHelpers';
import { fetchWithTimeout } from '@/lib/fetchWithTimeout';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';

function getAvailableStatuses(order) {
  if (!order) return [];
  const s = order.orderStatus;
  const isCOD = (order.paymentMethod || '').toLowerCase() === 'cod';
  if (order.isCustomOrder) {
    // Keyed by BOTH canonical and legacy codes - a custom order now starts at plain
    // "pending", which this map did not know about, leaving it with no transitions at all.
    const map = {
      pending:             ['in_production', 'Cancelled'],
      Pending:             ['in_production', 'Cancelled'],
      pending_review:      ['awaiting_payment'],
      design_approved:     ['awaiting_payment'],
      awaiting_payment:    ['in_production'],
      awaiting_production: ['in_production'],
      processing:          ['in_production', 'Cancelled'],
      Processing:          ['in_production', 'Cancelled'],
      in_production:       ['for_qc'],
      for_qc:              order.paymentStatus === 'paid' ? ['for_delivery'] : ['ready_for_delivery'],
      ready_for_delivery:  ['for_delivery'],
      for_delivery:        ['delivered'],
    };
    return map[s] ?? [];
  }
  if (isCOD) {
    const map = {
      Pending:        ['Processing', 'Cancelled'],
      Processing:     ['For Delivery', 'Cancelled'],
      'For Delivery': ['Delivered'],
      Delivered:      order.paymentStatus === 'paid' ? [] : ['Paid', 'Returned'],
    };
    return map[s] ?? [];
  }
  const map = {
    Pending:        ['Processing', 'Cancelled'],
    Processing:     ['For Delivery', 'Cancelled'],
    'For Delivery': ['Delivered'],
    Delivered:      ['Returned'],
  };
  return map[s] ?? [];
}

export default function OrderQuickViewModal({
  orderId,
  mode = 'admin',
  isOpen,
  onClose,
  onStatusUpdated,
}) {
  const { token } = useAuth();
  const [order, setOrder] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateError, setUpdateError] = useState(null);
  const [selectedStatus, setSelectedStatus] = useState('');
  const [confirmStatus, setConfirmStatus]   = useState(null);
  const [designAction, setDesignAction]     = useState(null);
  const [designError, setDesignError]       = useState(null);
  const [rejectReason, setRejectReason]     = useState('');
  const [showRejectInput, setShowRejectInput] = useState(false);
  const [adminDesignUploading, setAdminDesignUploading] = useState(false);
  const [adminDesignError, setAdminDesignError]         = useState(null);
  const [adminDesignSuccess, setAdminDesignSuccess]     = useState(false);
  const [adminDraftFile, setAdminDraftFile]             = useState(null);

  // Hoisted fetch order function using useAuth token
  const fetchOrder = useCallback(async () => {
    if (!orderId || !token) return;
    setIsLoading(true);
    setError(null);
    setOrder(null);

    try {
      const res = await fetchWithTimeout(`${API_URL}/api/orders/${orderId}`, {
        headers: { Authorization: `Bearer ${token}` },
      }, 15000);
      if (res.status === 401) throw new Error('Unauthorized');
      if (res.status === 404) throw new Error('not found');
      if (!res.ok) throw new Error('fetch failed');
      const data = await res.json();
      setOrder(data.order);
      setSelectedStatus(data.order.orderStatus || '');
    } catch (err) {
      if (err.message.includes('Unauthorized')) {
        setError('Unauthorized. Please login again.');
      } else if (err.message.includes('not found')) {
        setError('Order not found.');
      } else {
        setError('Failed to load order details. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  }, [orderId, token]);

  // Fetch order when modal opens or orderId changes
  useEffect(() => {
    if (!orderId || !isOpen) return;
    fetchOrder();
  }, [orderId, isOpen, fetchOrder]);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setOrder(null);
      setError(null);
      setIsLoading(false);
      setUpdateError(null);
      setSelectedStatus('');
      setAdminDesignError(null);
      setAdminDesignSuccess(false);
    }
  }, [isOpen]);

  const handleUpdateStatus = async () => {
    if (!orderId || !order || !confirmStatus) return;
    setConfirmStatus(null);
    setIsUpdating(true);
    setUpdateError(null);
    try {
      // 'Paid' means collect COD payment — only update paymentStatus, orderStatus stays 'Delivered'
      const payload = confirmStatus === 'Paid'
        ? { paymentStatus: 'paid' }
        : { orderStatus: confirmStatus };
      const res = await fetchWithTimeout(`${API_URL}/api/admin/orders/${orderId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      }, 15000);
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || errData.error || 'Update failed');
      }
      setOrder(prev => {
        if (!prev) return null;
        if (confirmStatus === 'Paid') return { ...prev, paymentStatus: 'paid' };
        return { ...prev, orderStatus: confirmStatus };
      });
      if (confirmStatus !== 'Paid') setSelectedStatus(confirmStatus);
      if (onStatusUpdated) onStatusUpdated();
    } catch (err) {
      setUpdateError(err.message || 'Failed to update status');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleApproveDesign = async () => {
    if (!orderId || designAction) return;
    setDesignAction('approving');
    setDesignError(null);
    try {
      const res = await fetchWithTimeout(
        `${API_URL}/api/admin/orders/${orderId}/approve-design`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        },
        15000
      );
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.message || 'Failed to approve design');
      }
      setOrder(prev => prev ? { ...prev, designStatus: 'approved' } : null);
      if (onStatusUpdated) onStatusUpdated();
    } catch (err) {
      setDesignError(err.message);
    } finally {
      setDesignAction(null);
    }
  };

  const handleRejectDesign = async () => {
    if (!orderId || designAction) return;
    setDesignAction('rejecting');
    setDesignError(null);
    try {
      const res = await fetchWithTimeout(
        `${API_URL}/api/admin/orders/${orderId}/reject-design`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ reason: rejectReason.trim() || null }),
        },
        15000
      );
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.message || 'Failed to reject design');
      }
      setOrder(prev => prev ? { ...prev, designStatus: 'rejected' } : null);
      setShowRejectInput(false);
      setRejectReason('');
      if (onStatusUpdated) onStatusUpdated();
    } catch (err) {
      setDesignError(err.message);
    } finally {
      setDesignAction(null);
    }
  };


  const handleAdminUploadDesign = async (files) => {
    const fileList = Array.isArray(files) ? files : [files];
    if (!fileList.length || !orderId) return;
    setAdminDesignUploading(true);
    setAdminDesignError(null);
    setAdminDesignSuccess(false);
    try {
      const form = new FormData();
      fileList.forEach(f => form.append('design[]', f));
      const res = await fetchWithTimeout(`${API_URL}/api/admin/orders/${orderId}/upload-design`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      }, 30000);
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.message || 'Upload failed');
      }
      const data = await res.json();
      const adminDesignUrl  = data.order?.adminDesignUrl  ?? data.adminDesignUrl ?? null;
      const adminDesignUrls = data.order?.adminDesignUrls ?? data.adminDesignUrls ?? (adminDesignUrl ? [adminDesignUrl] : []);
      setOrder(prev => prev ? { ...prev, adminDesignUrl, adminDesignUrls, orderStatus: 'proof_sent', designStatus: 'draft_ready' } : null);
      setAdminDraftFile(null); // ← moved here: clear files only after confirmed success
      setAdminDesignSuccess(true);
      if (onStatusUpdated) onStatusUpdated();
    } catch (err) {
      setAdminDesignError(err.message || 'Upload failed. Please try again.');
    } finally {
      setAdminDesignUploading(false);
    }
  };

  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  // Format address for Philippine format
  const formatAddress = (addr) => {
    if (!addr) return [];
    const lines = [];

    // Line 1: House/Unit No + Street + Subdivision
    const line1Parts = [];
    if (addr.house_number) line1Parts.push(addr.house_number);
    if (addr.street) line1Parts.push(addr.street);
    if (addr.subdivision) line1Parts.push(addr.subdivision);
    if (line1Parts.length > 0) {
      lines.push(line1Parts.join(', '));
    }

    // Line 2: Barangay + City
    const line2Parts = [];
    if (addr.barangay) line2Parts.push(`Brgy. ${addr.barangay}`);
    if (addr.city) line2Parts.push(addr.city);
    if (line2Parts.length > 0) {
      lines.push(line2Parts.join(', '));
    }

    // Line 3: Province + ZIP
    const line3Parts = [];
    if (addr.province) line3Parts.push(addr.province);
    if (addr.zip) line3Parts.push(addr.zip);
    if (line3Parts.length > 0) {
      lines.push(line3Parts.join(' '));
    }

    return lines;
  };

  if (!isOpen) return null;

  return (
    <>
    <div
      className="modal-overlay"
      onClick={handleOverlayClick}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 2000,
        background: 'rgba(0, 0, 0, 0.7)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
        overflow: 'auto',
      }}
    >
      <div
        style={{
          background: 'var(--dark2)',
          border: '1px solid var(--border)',
          borderRadius: '10px',
          width: '100%',
          maxWidth: '896px',
          maxHeight: '90vh',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '1.25rem 1.5rem',
            borderBottom: '1px solid var(--border)',
            position: 'sticky',
            top: 0,
            background: 'var(--dark2)',
            zIndex: 1,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--white)' }}>
              #{String(orderId).slice(-8).toUpperCase()}
            </span>
            {order && (() => {
              const deliveredPaid = order.orderStatus === 'Delivered' && order.paymentStatus === 'paid';
              const badge = deliveredPaid
                ? { label: 'Delivered', color: '#4ade80', bg: 'rgba(74,222,128,0.15)', border: 'rgba(74,222,128,0.4)' }
                : getStatusBadge(order.orderStatus);
              return (
                <span style={{ display: 'inline-block', fontSize: '0.7rem', fontWeight: 700, padding: '0.25rem 0.625rem', borderRadius: '999px', background: badge.bg, color: badge.color, border: `1px solid ${badge.border}` }}>
                  {badge.label || order.orderStatus}
                </span>
              );
            })()}
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'rgba(255, 255, 255, 0.06)',
              border: '1px solid var(--border)',
              color: 'var(--gray-light)',
              width: '30px',
              height: '30px',
              borderRadius: '8px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'background 0.2s, color 0.2s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(196, 30, 58, 0.15)';
              e.currentTarget.style.color = 'var(--red)';
              e.currentTarget.style.borderColor = 'rgba(196, 30, 58, 0.3)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)';
              e.currentTarget.style.color = 'var(--gray-light)';
              e.currentTarget.style.borderColor = 'var(--border)';
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div
          style={{
            padding: '1.5rem',
            overflow: 'auto',
            flex: 1,
          }}
        >
          {isLoading && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
              {/* Left column skeletons */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    style={{
                      height: '80px',
                      background: 'var(--dark)',
                      borderRadius: '8px',
                      animation: 'pulse 1.5s ease-in-out infinite',
                    }}
                  />
                ))}
              </div>
              {/* Right column skeletons */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {[1, 2, 3, 4].map((i) => (
                  <div
                    key={i}
                    style={{
                      height: '60px',
                      background: 'var(--dark)',
                      borderRadius: '8px',
                      animation: 'pulse 1.5s ease-in-out infinite',
                    }}
                  />
                ))}
              </div>
            </div>
          )}

          {error && (
            <div
              style={{
                textAlign: 'center',
                padding: '3rem 1rem',
              }}
            >
              <svg
                width="48"
                height="48"
                viewBox="0 0 24 24"
                fill="none"
                stroke="var(--red)"
                strokeWidth="1.5"
                style={{ marginBottom: '1rem' }}
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <div style={{ fontSize: '0.95rem', color: 'var(--red)', marginBottom: '1rem' }}>
                {error}
              </div>
              <button
                onClick={fetchOrder}
                style={{
                  padding: '0.5rem 1.25rem',
                  background: 'transparent',
                  border: '1px solid var(--gold)',
                  borderRadius: '6px',
                  color: 'var(--gold)',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Retry
              </button>
            </div>
          )}

          {!isLoading && !error && order && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
              {/* LEFT COLUMN */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                {/* Customer Section */}
                <div>
                  <h4
                    style={{
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      color: 'var(--gray)',
                      textTransform: 'uppercase',
                      letterSpacing: '1px',
                      marginBottom: '0.75rem',
                    }}
                  >
                    Customer
                  </h4>
                  <div style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--white)', marginBottom: '0.25rem' }}>
                    {order.userSnapshot?.name || '—'}
                  </div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--gray)', marginBottom: '0.125rem' }}>
                    {order.userSnapshot?.email || '—'}
                  </div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--gray)' }}>
                    {order.userSnapshot?.phone || '—'}
                  </div>
                </div>

                {/* Shipping Address Section */}
                <div>
                  <h4
                    style={{
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      color: 'var(--gray)',
                      textTransform: 'uppercase',
                      letterSpacing: '1px',
                      marginBottom: '0.75rem',
                    }}
                  >
                    Shipping Address
                  </h4>
                  <div style={{ fontSize: '0.875rem', color: 'var(--white)', lineHeight: '1.6' }}>
                    {formatAddress(order.deliveryAddress).length > 0 ? (
                      formatAddress(order.deliveryAddress).map((line, i) => (
                        <div key={i}>{line}</div>
                      ))
                    ) : (
                      <span style={{ color: 'var(--gray)' }}>—</span>
                    )}
                  </div>
                </div>

                {/* Payment Section */}
                <div>
                  <h4
                    style={{
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      color: 'var(--gray)',
                      textTransform: 'uppercase',
                      letterSpacing: '1px',
                      marginBottom: '0.75rem',
                    }}
                  >
                    Payment
                  </h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: '0.85rem', color: 'var(--gray)' }}>Method:</span>
                      <span style={{ fontSize: '0.85rem', color: 'var(--white)' }}>
                        {{ cod: 'Cash on Delivery', gcash: 'GCash', paymaya: 'Maya', card: 'Credit / Debit Card' }[order.paymentMethod] || order.paymentMethod || '—'}
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: '0.85rem', color: 'var(--gray)' }}>Payment:</span>
                      <span style={{ fontSize: '0.8rem', fontWeight: 700, color: order.paymentStatus === 'paid' ? '#22c55e' : 'var(--gold)' }}>
                        {order.paymentStatus === 'paid' ? '✓ Paid' : (order.designFeePaid && order.paymentStatus !== 'paid') ? 'Design Fee ✓' : 'Unpaid'}
                      </span>
                    </div>
                    {order.downPayment > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: '0.85rem', color: 'var(--gray)' }}>Down Payment Paid:</span>
                        <span style={{ fontSize: '0.85rem', color: '#60a5fa', fontWeight: 600 }}>
                          ₱{parseFloat(order.downPayment).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                    )}
                    {order.balance > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: '0.85rem', color: 'var(--gray)' }}>Balance Due:</span>
                        <span style={{ fontSize: '0.85rem', color: 'var(--gold)', fontWeight: 600 }}>
                          ₱{parseFloat(order.balance).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                    )}
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: '0.85rem', color: 'var(--gray)' }}>Order Total:</span>
                      <span style={{ fontSize: '0.85rem', color: 'var(--white)', fontWeight: 700 }}>
                        ₱{parseFloat(order.totalAmount ?? 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Update Status — admin only, left column */}
                {mode === 'admin' && (
                  <div>
                    <h4 style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--gray)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '0.75rem' }}>
                      Update Status
                    </h4>
                    {['pending_design', 'revision_requested'].includes(order.orderStatus) ? (
                      <span style={{ fontSize: '0.8rem', color: 'var(--gray)', fontStyle: 'italic' }}>
                        Status updates via design draft upload
                      </span>
                    ) : ['awaiting_payment', 'ready_for_delivery'].includes(order.orderStatus) ? (
                      <span style={{ fontSize: '0.8rem', color: 'var(--gray)', fontStyle: 'italic' }}>
                        Waiting for customer payment
                      </span>
                    ) : getAvailableStatuses(order).length > 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <select
                          value={selectedStatus}
                          onChange={e => setSelectedStatus(e.target.value)}
                          style={{ width: '100%', padding: '0.5rem 0.75rem', background: 'var(--dark)', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--white)', fontSize: '0.875rem', cursor: 'pointer' }}
                        >
                          <option value={order.orderStatus}>
                            {getStatusBadge(order.orderStatus).label || order.orderStatus} (current)
                          </option>
                          {getAvailableStatuses(order).map(s => (
                            <option key={s} value={s} style={{ background: 'var(--dark)', color: 'var(--white)' }}>
                              {getStatusBadge(s).label || s}
                            </option>
                          ))}
                        </select>
                        <button
                          onClick={() => selectedStatus !== order.orderStatus && setConfirmStatus(selectedStatus)}
                          disabled={isUpdating || selectedStatus === order.orderStatus}
                          style={{ width: '100%', padding: '0.5rem', background: isUpdating || selectedStatus === order.orderStatus ? 'var(--border)' : 'var(--gold)', border: 'none', borderRadius: '6px', color: isUpdating || selectedStatus === order.orderStatus ? 'var(--gray)' : 'var(--dark)', fontSize: '0.875rem', fontWeight: 700, cursor: isUpdating || selectedStatus === order.orderStatus ? 'not-allowed' : 'pointer' }}
                        >
                          {isUpdating ? 'Updating...' : 'Update Status'}
                        </button>
                        {updateError && (
                          <div style={{ fontSize: '0.75rem', color: 'var(--red)' }}>{updateError}</div>
                        )}
                      </div>
                    ) : (
                      <span style={{ fontSize: '0.8rem', color: 'var(--gray)', fontStyle: 'italic' }}>
                        {['Cancelled','Returned','Paid','Delivered','delivered'].includes(order.orderStatus)
                          ? 'No further updates' : 'Managed via action buttons'}
                      </span>
                    )}
                  </div>
                )}

              </div>

              {/* RIGHT COLUMN */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                {/* Order Items Section */}
                <div>
                  <h4
                    style={{
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      color: 'var(--gray)',
                      textTransform: 'uppercase',
                      letterSpacing: '1px',
                      marginBottom: '0.75rem',
                    }}
                  >
                    Order Items
                  </h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {order.items && order.items.length > 0 ? (
                      order.items.map((item, index) => (
                        <div
                          key={index}
                          style={{
                            display: 'flex',
                            gap: '0.75rem',
                            padding: '0.75rem',
                            background: 'var(--dark)',
                            borderRadius: '6px',
                          }}
                        >
                          {/* Thumbnail */}
                          <div
                            style={{
                              width: '40px',
                              height: '40px',
                              borderRadius: '4px',
                              background: item.thumbnail ? 'transparent' : 'var(--border)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0,
                            }}
                          >
                            {item.thumbnail ? (
                              <Image
                                src={item.thumbnail}
                                alt={item.productName}
                                width={40}
                                height={40}
                                style={{ borderRadius: '4px', objectFit: 'cover' }}
                                unoptimized
                              />
                            ) : (
                              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--gray)" strokeWidth="1.5">
                                <rect x="3" y="3" width="18" height="18" rx="2" />
                                <circle cx="8.5" cy="8.5" r="1.5" />
                                <polyline points="21 15 16 10 5 21" />
                              </svg>
                            )}
                          </div>

                          {/* Item Details */}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--white)', marginBottom: '0.125rem' }}>
                              {item.productName}
                            </div>
                            {item.variantName && (
                              <div style={{ fontSize: '0.75rem', color: 'var(--gray)', marginBottom: '0.25rem' }}>
                                {item.variantName}
                              </div>
                            )}
                            {item.customization_note && (
                              <div style={{ fontSize: '0.75rem', color: 'var(--gold)', fontStyle: 'italic' }}>
                                "{item.customization_note}"
                              </div>
                            )}
                            {/* Per-item design file */}
                            {item.designUrl && (
                              <a
                                href={item.designUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', marginTop: '4px', fontSize: '0.72rem', fontWeight: 600, color: '#60a5fa', textDecoration: 'none' }}
                              >
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                                View Customer Design
                              </a>
                            )}
                            {/* Design service requested */}
                            {item.designRequested && (
                              <div style={{ marginTop: '4px', display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 7px', background: 'rgba(212,168,67,0.1)', border: '1px solid rgba(212,168,67,0.3)', borderRadius: '4px', fontSize: '0.68rem', fontWeight: 700, color: 'var(--gold)' }}>
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                                Design Service Requested{item.designFee ? ` (+₱${Number(item.designFee).toLocaleString()})` : ''}
                              </div>
                            )}
                          </div>

                          {/* Line Total */}
                          <div style={{ textAlign: 'right', flexShrink: 0 }}>
                            <div style={{ fontSize: '0.75rem', color: 'var(--gray)' }}>
                              {item.qty} × ₱{(item.unitPrice || 0).toLocaleString()}
                            </div>
                            <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--gold)' }}>
                              ₱{(item.lineTotal || (item.unitPrice || 0) * (item.qty || 0)).toLocaleString()}
                            </div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div style={{ fontSize: '0.875rem', color: 'var(--gray)', padding: '1rem', textAlign: 'center' }}>
                        No items found
                      </div>
                    )}
                  </div>
                </div>

                {/* Pricing Breakdown Section */}
                <div>
                  <h4
                    style={{
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      color: 'var(--gray)',
                      textTransform: 'uppercase',
                      letterSpacing: '1px',
                      marginBottom: '0.75rem',
                    }}
                  >
                    Pricing Breakdown
                  </h4>
                  <div
                    style={{
                      padding: '1rem',
                      background: 'var(--dark)',
                      borderRadius: '6px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.5rem',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem' }}>
                      <span style={{ color: 'var(--gray)' }}>Subtotal:</span>
                      <span style={{ color: 'var(--white)' }}>₱{(order.items || []).reduce((s, i) => s + (i.lineTotal || (i.unitPrice || 0) * (i.qty || 0)), 0).toLocaleString()}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem' }}>
                      <span style={{ color: 'var(--gray)' }}>Shipping Fee:</span>
                      <span style={{ color: 'var(--white)' }}>₱{(order.shippingFee || 0).toLocaleString()}</span>
                    </div>
                    <div
                      style={{
                        height: '1px',
                        background: 'var(--border)',
                        margin: '0.25rem 0',
                      }}
                    />
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--white)' }}>Total:</span>
                      <span style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--gold)' }}>
                        ₱{(order.totalAmount || 0).toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Admin: Approve Upload Design */}
                {mode === 'admin' && order.isCustomOrder && order.designType === 'upload' && order.orderStatus === 'pending_review' && (
                  <div>
                    <h4 style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--gray)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '0.75rem' }}>
                      Upload Review
                    </h4>
                    <div style={{ padding: '0.875rem', borderRadius: '8px', background: 'rgba(96,165,250,0.06)', border: '1px solid rgba(96,165,250,0.2)' }}>
                      <div style={{ fontSize: '0.8rem', color: 'var(--gray)', marginBottom: '0.75rem' }}>
                        Review the customer&apos;s uploaded design file. If it&apos;s print-ready, approve it to notify them to proceed with payment.
                      </div>
                      {order.designFilePath && (
                        <a href={order.designFilePath?.startsWith('http') ? order.designFilePath : `${API_URL}/storage/${order.designFilePath}`} target="_blank" rel="noopener noreferrer"
                          style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem', fontWeight: 600, color: '#60a5fa', textDecoration: 'none', marginBottom: '0.75rem' }}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                          View Uploaded File
                        </a>
                      )}
                      <button
                        onClick={async () => {
                          setIsUpdating(true);
                          try {
                            const res = await fetchWithTimeout(`${API_URL}/api/admin/orders/${orderId}/approve-upload`, {
                              method: 'POST',
                              headers: { Authorization: `Bearer ${token}` },
                            }, 15000);
                            if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.message || 'Failed'); }
                            setOrder(prev => prev ? { ...prev, orderStatus: 'awaiting_payment' } : null);
                            if (onStatusUpdated) onStatusUpdated();
                          } catch (err) {
                            setUpdateError(err.message);
                          } finally {
                            setIsUpdating(false);
                          }
                        }}
                        disabled={isUpdating}
                        style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '0.5rem 1rem', background: 'rgba(96,165,250,0.15)', border: '1px solid rgba(96,165,250,0.4)', borderRadius: '8px', color: '#60a5fa', fontSize: '0.82rem', fontWeight: 700, cursor: isUpdating ? 'not-allowed' : 'pointer', opacity: isUpdating ? 0.6 : 1 }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                        {isUpdating ? 'Approving...' : 'Approve — Notify Customer to Pay'}
                      </button>
                    </div>
                  </div>
                )}

                {/* Admin Design Service Upload */}
                {mode === 'admin' && (order.items?.some(i => i.designRequested) || (order.isCustomOrder && order.designType === 'request')) && (
                  <div style={{ borderRadius: '12px', border: '1px solid rgba(212,168,67,0.25)', overflow: 'hidden' }}>
                    {/* Header bar */}
                    <div style={{ padding: '10px 14px', background: 'rgba(212,168,67,0.08)', borderBottom: '1px solid rgba(212,168,67,0.15)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" strokeWidth="2.5"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                      <span style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.8px' }}>Design Service</span>
                    </div>
                    <div style={{ padding: '0.75rem', background: 'rgba(212,168,67,0.02)' }}>
                      {/* Already has uploaded draft — show links + replace option */}
                      {(order.adminDesignUrl || adminDesignSuccess) && !adminDraftFile?.length ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--gold)', padding: '2px 8px', borderRadius: '999px', background: 'rgba(212,168,67,0.1)', border: '1px solid rgba(212,168,67,0.25)' }}>
                              Draft Uploaded
                            </span>
                            <span style={{ fontSize: '0.72rem', color: 'var(--gray)' }}>
                              {order.designStatus === 'draft_ready' ? '— Awaiting customer review'
                                : order.designStatus === 'approved' ? '— Customer approved'
                                : adminDesignSuccess ? '— Customer has been notified'
                                : ''}
                            </span>
                          </div>
                          {(order.adminDesignUrls ?? (order.adminDesignUrl ? [order.adminDesignUrl] : [])).filter(Boolean).map((url, i, arr) => (
                            <a key={i} href={url} target="_blank" rel="noopener noreferrer"
                              style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem', fontWeight: 600, color: 'var(--gold)', textDecoration: 'none' }}>
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                              {arr.length > 1 ? `File ${i + 1}` : 'View Design Draft'}
                            </a>
                          ))}
                          {/* Replace draft — file picker only, no immediate upload */}
                          <label style={{ cursor: 'pointer', display: 'inline-block', marginTop: '0.25rem' }}>
                            <span style={{ fontSize: '0.75rem', color: 'var(--gray)', textDecoration: 'underline', cursor: 'pointer' }}>Replace draft</span>
                            <input
                              type="file"
                              accept="image/*,video/*,.pdf,.ai,.psd,.svg"
                              multiple
                              style={{ display: 'none' }}
                              onChange={e => {
                                const files = Array.from(e.target.files ?? []).slice(0, 5);
                                if (files.length) { setAdminDraftFile(files); setAdminDesignSuccess(false); }
                                e.target.value = '';
                              }}
                            />
                          </label>
                        </div>

                      ) : adminDraftFile?.length > 0 ? (
                        /* Files selected — show list + Send button */
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                          <div style={{ fontSize: '0.75rem', color: 'var(--gray)', marginBottom: '0.25rem' }}>
                            {adminDraftFile.length} file{adminDraftFile.length > 1 ? 's' : ''} selected
                          </div>
                          {adminDraftFile.map((f, fi) => (
                            <div key={fi} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 10px', background: 'rgba(255,255,255,0.04)', borderRadius: '6px', border: '1px solid var(--border)' }}>
                              {f.type.startsWith('video/') ? (
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" strokeWidth="2.5"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
                              ) : (
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" strokeWidth="2.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                              )}
                              <span style={{ fontSize: '0.78rem', color: 'var(--white)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                              <button
                                type="button"
                                onClick={() => setAdminDraftFile(prev => prev.filter((_, i) => i !== fi))}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--gray)', fontSize: '0.72rem', padding: '0', flexShrink: 0 }}
                              >
                                Remove
                              </button>
                            </div>
                          ))}
                          {adminDraftFile.length < 5 && (
                            <label style={{ cursor: 'pointer' }}>
                              <span style={{ fontSize: '0.72rem', color: 'var(--gold)', textDecoration: 'underline' }}>
                                + Add more ({5 - adminDraftFile.length} remaining)
                              </span>
                              <input
                                type="file"
                                accept="image/*,video/*,.pdf,.ai,.psd,.svg"
                                multiple
                                style={{ display: 'none' }}
                                onChange={e => {
                                  const more = Array.from(e.target.files ?? []).slice(0, 5 - adminDraftFile.length);
                                  setAdminDraftFile(prev => [...prev, ...more]);
                                  e.target.value = '';
                                }}
                              />
                            </label>
                          )}
                          <div style={{ display: 'flex', gap: '6px', marginTop: '0.25rem' }}>
                            {/* SEND button — this is the action trigger */}
                            <button
                              type="button"
                              disabled={adminDesignUploading}
                              onClick={() => handleAdminUploadDesign(adminDraftFile)}
                              style={{
                                flex: 1,
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '6px',
                                padding: '0.5rem 0.875rem',
                                background: adminDesignUploading ? 'var(--border)' : 'var(--gold)',
                                borderRadius: '6px',
                                color: adminDesignUploading ? 'var(--gray)' : '#000',
                                fontSize: '0.82rem',
                                fontWeight: 700,
                                cursor: adminDesignUploading ? 'not-allowed' : 'pointer',
                                border: 'none',
                              }}
                            >
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
                              </svg>
                              {adminDesignUploading
                                ? 'Sending...'
                                : `Send ${adminDraftFile.length} File${adminDraftFile.length > 1 ? 's' : ''} to Customer`}
                            </button>
                            <button
                              type="button"
                              disabled={adminDesignUploading}
                              onClick={() => setAdminDraftFile(null)}
                              style={{ padding: '0.5rem 0.75rem', background: 'transparent', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--gray)', fontSize: '0.8rem', cursor: adminDesignUploading ? 'not-allowed' : 'pointer' }}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>

                      ) : (
                        /* No files selected, no draft yet — show initial picker */
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                          <div style={{ fontSize: '0.8rem', color: 'var(--gray)' }}>
                            Customer requested design service. Upload the design draft when ready.
                          </div>
                          <label style={{ cursor: 'pointer', display: 'inline-block' }}>
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '0.4rem 0.875rem', background: 'transparent', border: '1px solid rgba(212,168,67,0.5)', borderRadius: '6px', color: 'var(--gold)', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer' }}>
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/></svg>
                              Choose Files
                            </div>
                            <input
                              type="file"
                              accept="image/*,video/*,.pdf,.ai,.psd,.svg"
                              multiple
                              style={{ display: 'none' }}
                              onChange={e => {
                                const files = Array.from(e.target.files ?? []).slice(0, 5);
                                if (files.length) { setAdminDraftFile(files); setAdminDesignSuccess(false); }
                                e.target.value = '';
                              }}
                            />
                          </label>
                        </div>
                      )}

                      {adminDesignError && (
                        <div style={{ fontSize: '0.73rem', color: 'var(--red)', marginTop: '0.5rem' }}>{adminDesignError}</div>
                      )}
                    </div>
                  </div>
                )}

                {/* Revision Notes — shown prominently when customer requested changes */}
                {order.orderStatus === 'revision_requested' && order.revisionNotes && (
                  <div style={{ padding: '0.875rem', borderRadius: '8px', background: 'rgba(249,115,22,0.08)', border: '1px solid rgba(249,115,22,0.3)' }}>
                    <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#f97316', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '0.5rem' }}>
                      ↩ Customer Revision Request
                    </div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--white)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                      {order.revisionNotes}
                    </div>
                  </div>
                )}

                {/* Design File Section */}
                {(order.designFilePath || order.designNotes) && (
                  <div>
                    <h4
                      style={{
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        color: 'var(--gray)',
                        textTransform: 'uppercase',
                        letterSpacing: '1px',
                        marginBottom: '0.75rem',
                      }}
                    >
                      Customer Design
                    </h4>

                    {/* Design status badge */}
                    {order.designStatus && (
                      <div style={{ marginBottom: '0.75rem' }}>
                        <span style={{
                          display: 'inline-block',
                          padding: '0.2rem 0.625rem',
                          borderRadius: '999px',
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          background: order.designStatus === 'approved'
                            ? 'rgba(74,222,128,0.12)'
                            : order.designStatus === 'rejected'
                            ? 'rgba(239,68,68,0.12)'
                            : 'rgba(212,168,67,0.12)',
                          color: order.designStatus === 'approved'
                            ? '#4ade80'
                            : order.designStatus === 'rejected'
                            ? '#ef4444'
                            : '#d4a843',
                          border: `1px solid ${order.designStatus === 'approved'
                            ? 'rgba(74,222,128,0.3)'
                            : order.designStatus === 'rejected'
                            ? 'rgba(239,68,68,0.3)'
                            : 'rgba(212,168,67,0.3)'}`,
                          textTransform: 'capitalize',
                        }}>
                          {order.designStatus === 'approved'
                            ? '✓ Approved'
                            : order.designStatus === 'rejected'
                            ? '✗ Rejected'
                            : order.designStatus === 'revision_requested'
                            ? '↩ Revision Requested'
                            : '⏳ Pending Review'}
                        </span>
                      </div>
                    )}

                    {/* Design file link */}
                    {order.designFilePath && (
                      <div style={{ marginBottom: '0.75rem' }}>
                        <a
                          href={order.designFilePath?.startsWith('http') ? order.designFilePath : `${API_URL}/storage/${order.designFilePath}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.375rem',
                            color: '#d4a843',
                            fontSize: '0.85rem',
                            fontWeight: 600,
                            textDecoration: 'none',
                          }}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24"
                            fill="none" stroke="currentColor" strokeWidth="2"
                            strokeLinecap="round" strokeLinejoin="round">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                            <polyline points="14 2 14 8 20 8"/>
                          </svg>
                          View Design File
                        </a>
                      </div>
                    )}

                    {/* Design notes */}
                    {order.designNotes && (
                      <div style={{
                        padding: '0.625rem 0.75rem',
                        background: 'var(--dark)',
                        borderRadius: '6px',
                        fontSize: '0.8rem',
                        color: 'var(--gray)',
                        lineHeight: 1.5,
                        marginBottom: '0.75rem',
                      }}>
                        {order.designNotes}
                      </div>
                    )}

                    {/* Approve / Reject buttons — only when pending */}
                    {mode === 'admin' &&
                      (!order.designStatus || order.designStatus === 'pending_review') && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        {designError && (
                          <div style={{
                            fontSize: '0.75rem',
                            color: '#ef4444',
                            padding: '0.375rem 0.5rem',
                            background: 'rgba(239,68,68,0.08)',
                            borderRadius: '4px',
                          }}>
                            {designError}
                          </div>
                        )}

                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <button
                            onClick={handleApproveDesign}
                            disabled={!!designAction}
                            style={{
                              flex: 1, padding: '0.5rem',
                              background: designAction === 'approving'
                                ? 'rgba(74,222,128,0.06)'
                                : 'rgba(74,222,128,0.1)',
                              border: '1px solid rgba(74,222,128,0.3)',
                              borderRadius: '6px',
                              color: '#4ade80',
                              fontSize: '0.8rem',
                              fontWeight: 700,
                              cursor: designAction ? 'not-allowed' : 'pointer',
                              opacity: designAction ? 0.6 : 1,
                            }}
                          >
                            {designAction === 'approving' ? 'Approving...' : '✓ Approve'}
                          </button>
                          <button
                            onClick={() => setShowRejectInput(v => !v)}
                            disabled={!!designAction}
                            style={{
                              flex: 1, padding: '0.5rem',
                              background: 'rgba(239,68,68,0.1)',
                              border: '1px solid rgba(239,68,68,0.3)',
                              borderRadius: '6px',
                              color: '#ef4444',
                              fontSize: '0.8rem',
                              fontWeight: 700,
                              cursor: designAction ? 'not-allowed' : 'pointer',
                              opacity: designAction ? 0.6 : 1,
                            }}
                          >
                            ✗ Reject
                          </button>
                        </div>

                        {showRejectInput && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                            <textarea
                              rows={2}
                              placeholder="Reason for rejection (optional)"
                              value={rejectReason}
                              onChange={e => setRejectReason(e.target.value)}
                              style={{
                                width: '100%',
                                padding: '0.5rem',
                                background: 'var(--dark)',
                                border: '1px solid rgba(239,68,68,0.3)',
                                borderRadius: '6px',
                                color: 'var(--white)',
                                fontSize: '0.8rem',
                                resize: 'vertical',
                                outline: 'none',
                                boxSizing: 'border-box',
                                fontFamily: 'inherit',
                              }}
                            />
                            <button
                              onClick={handleRejectDesign}
                              disabled={!!designAction}
                              style={{
                                padding: '0.5rem',
                                background: '#ef4444',
                                border: 'none',
                                borderRadius: '6px',
                                color: '#fff',
                                fontSize: '0.8rem',
                                fontWeight: 700,
                                cursor: designAction ? 'not-allowed' : 'pointer',
                                opacity: designAction ? 0.6 : 1,
                              }}
                            >
                              {designAction === 'rejecting'
                                ? 'Rejecting...' : 'Confirm Rejection'}
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

              </div>
            </div>
          )}
        </div>

      </div>
    </div>

    {/* Status update confirmation */}
    {confirmStatus && (
      <div
        style={{ position: 'fixed', inset: 0, zIndex: 3000, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
        onClick={() => setConfirmStatus(null)}
      >
        <div
          style={{ background: 'var(--dark2)', border: '1px solid var(--border)', borderRadius: '12px', padding: '1.5rem', maxWidth: '380px', width: '100%' }}
          onClick={e => e.stopPropagation()}
        >
          <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--white)', marginBottom: '0.5rem' }}>Update Order Status</div>
          <div style={{ fontSize: '0.875rem', color: 'var(--gray)', marginBottom: '1.25rem' }}>
            Change status to{' '}
            <span style={{ color: getStatusBadge(confirmStatus).color, fontWeight: 600 }}>
              {getStatusBadge(confirmStatus).label || confirmStatus}
            </span>
            {confirmStatus === 'Paid' && '? This will also mark the order as paid.'}
            {confirmStatus === 'Cancelled' && '? This action cannot be undone.'}
            {!['Paid', 'Cancelled'].includes(confirmStatus) && '? Are you sure?'}
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
            <button
              onClick={() => setConfirmStatus(null)}
              style={{ padding: '0.5rem 1rem', background: 'transparent', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--gray)', fontSize: '0.875rem', cursor: 'pointer' }}
            >
              Cancel
            </button>
            <button
              onClick={handleUpdateStatus}
              style={{ padding: '0.5rem 1.25rem', background: 'var(--gold)', border: 'none', borderRadius: '6px', color: 'var(--dark)', fontSize: '0.875rem', fontWeight: 700, cursor: 'pointer' }}
            >
              Confirm
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
