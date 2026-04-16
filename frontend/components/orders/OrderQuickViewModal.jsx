'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { getStatusBadge, getPaymentBadge } from '@/lib/utils/orderHelpers';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';

const ORDER_STATUSES = [
  'Pending',
  'In Production',
  'For Delivery',
  'Delivered',
  'Returned',
  'Cancelled',
];

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
  const [notesEdit, setNotesEdit]           = useState('');
  const [paymentEdit, setPaymentEdit]       = useState('');
  const [isEditingNotes, setIsEditingNotes] = useState(false);
  const [designAction, setDesignAction]     = useState(null); // 'approving' | 'rejecting' | null
  const [designError, setDesignError]       = useState(null);
  const [rejectReason, setRejectReason]     = useState('');
  const [showRejectInput, setShowRejectInput] = useState(false);
  const [cashReceived, setCashReceived]   = useState('');
  const [codError, setCodError]           = useState(null);
  const [codSuccess, setCodSuccess]       = useState(false);

  const handleConfirmCOD = async () => {
    const cash = parseFloat(cashReceived);
    const due  = parseFloat(order?.totalAmount ?? 0);
    if (isNaN(cash) || cash < due) {
      setCodError('Cash received must be at least ₱' + due.toLocaleString('en-PH', { minimumFractionDigits: 2 }));
      return;
    }
    setCodError(null);
    setIsUpdating(true);
    try {
      const res = await fetch(`${API_URL}/api/admin/orders/${order._id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ paymentStatus: 'paid' }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || 'Failed to confirm COD payment');
      }
      setOrder(prev => prev ? { ...prev, payment_status: 'paid' } : null);
      setCodSuccess(true);
      if (onStatusUpdated) onStatusUpdated();
    } catch (err) {
      setCodError(err.message || 'Failed to confirm payment');
    } finally {
      setIsUpdating(false);
    }
  };

  // Hoisted fetch order function using useAuth token
  const fetchOrder = useCallback(async () => {
    if (!orderId || !token) return;
    setIsLoading(true);
    setError(null);
    setOrder(null);

    try {
      const res = await fetch(`${API_URL}/api/orders/${orderId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) throw new Error('Unauthorized');
      if (res.status === 404) throw new Error('not found');
      if (!res.ok) throw new Error('fetch failed');
      const data = await res.json();
      setOrder(data.order);
      setSelectedStatus(data.order.order_status);
      setNotesEdit(data.order.notes || '');
      setPaymentEdit(data.order.paymentStatus || 'unpaid');
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
      setNotesEdit('');
      setPaymentEdit('');
      setIsEditingNotes(false);
    }
  }, [isOpen]);

  const handleUpdateStatus = async () => {
    if (!orderId || !order) return;

    setIsUpdating(true);
    setUpdateError(null);

    try {
      const payload = {};
      if (selectedStatus !== order.order_status) {
        payload.orderStatus = selectedStatus;
      }
      if (paymentEdit !== (order.paymentStatus || 'unpaid')) {
        payload.paymentStatus = paymentEdit;
      }
      if (notesEdit.trim() !== (order.notes || '')) {
        payload.notes = notesEdit.trim();
      }
      if (Object.keys(payload).length === 0) return;

      const res = await fetch(`${API_URL}/api/admin/orders/${orderId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || 'Update failed');
      }
      const updated = await res.json();
      setOrder((prev) => prev ? {
        ...prev,
        order_status: payload.orderStatus ?? prev.order_status,
        paymentStatus: payload.paymentStatus ?? prev.paymentStatus,
        notes: payload.notes ?? prev.notes,
      } : null);
      setIsEditingNotes(false);
      if (onStatusUpdated) onStatusUpdated();
      setUpdateError(null);
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
      const res = await fetch(
        `${API_URL}/api/admin/orders/${orderId}/approve-design`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        }
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
      const res = await fetch(
        `${API_URL}/api/admin/orders/${orderId}/reject-design`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ reason: rejectReason.trim() || null }),
        }
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
              {order?.order_number || orderId}
            </span>
            {order && (
              <span
                style={{
                  display: 'inline-block',
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  padding: '0.25rem 0.625rem',
                  borderRadius: '999px',
                  background: getStatusBadge(order.order_status).bg,
                  color: getStatusBadge(order.order_status).color,
                  border: `1px solid ${getStatusBadge(order.order_status).border}`,
                }}
              >
                {order.order_status}
              </span>
            )}
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
                    {order.customer?.name}
                  </div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--gray)', marginBottom: '0.125rem' }}>
                    {order.customer?.email}
                  </div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--gray)' }}>
                    {order.customer?.phone}
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
                    {formatAddress(order.shipping_address).length > 0 ? (
                      formatAddress(order.shipping_address).map((line, i) => (
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
                        {order.payment_method || '—'}
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: '0.85rem', color: 'var(--gray)' }}>Status:</span>
                      <span
                        style={{
                          display: 'inline-block',
                          fontSize: '0.7rem',
                          fontWeight: 700,
                          padding: '0.2rem 0.5rem',
                          borderRadius: '999px',
                          background: getPaymentBadge(order.payment_status).bg,
                          color: getPaymentBadge(order.payment_status).color,
                          border: `1px solid ${getPaymentBadge(order.payment_status).border}`,
                        }}
                      >
                        {order.payment_status}
                      </span>
                    </div>
                    {/* COD POS — B-14 */}
                    {order.payment_method === 'COD' && order.payment_status !== 'paid' && (
                      <div style={{
                        marginTop: '0.75rem',
                        padding: '0.75rem',
                        borderRadius: '8px',
                        background: 'rgba(250, 204, 21, 0.06)',
                        border: '1px solid rgba(250, 204, 21, 0.2)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.5rem',
                      }}>
                        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '1px' }}>
                          COD Collection
                        </span>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: '0.85rem', color: 'var(--gray)' }}>Amount Due:</span>
                          <span style={{ fontSize: '0.85rem', color: 'var(--white)', fontWeight: 600 }}>
                            ₱{parseFloat(order.totalAmount ?? 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
                          <span style={{ fontSize: '0.85rem', color: 'var(--gray)', whiteSpace: 'nowrap' }}>Cash Received:</span>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={cashReceived}
                            onChange={e => { setCashReceived(e.target.value); setCodError(null); setCodSuccess(false); }}
                            placeholder="0.00"
                            style={{
                              width: '120px',
                              padding: '0.3rem 0.5rem',
                              background: 'var(--dark)',
                              border: '1px solid var(--border)',
                              borderRadius: '6px',
                              color: 'var(--white)',
                              fontSize: '0.85rem',
                              textAlign: 'right',
                            }}
                          />
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: '0.85rem', color: 'var(--gray)' }}>Change:</span>
                          <span style={{ fontSize: '0.85rem', color: parseFloat(cashReceived) >= parseFloat(order.totalAmount ?? 0) ? '#4ade80' : 'var(--gray)', fontWeight: 600 }}>
                            ₱{Math.max(0, parseFloat(cashReceived || 0) - parseFloat(order.totalAmount ?? 0)).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                        {codError && (
                          <span style={{ fontSize: '0.75rem', color: 'var(--red)' }}>{codError}</span>
                        )}
                        {codSuccess && (
                          <span style={{ fontSize: '0.75rem', color: '#4ade80', fontWeight: 600 }}>✓ Payment confirmed</span>
                        )}
                        <button
                          onClick={handleConfirmCOD}
                          disabled={isUpdating || !cashReceived || parseFloat(cashReceived) < parseFloat(order.totalAmount ?? 0)}
                          style={{
                            marginTop: '0.25rem',
                            padding: '0.4rem 1rem',
                            background: isUpdating || !cashReceived || parseFloat(cashReceived) < parseFloat(order.totalAmount ?? 0) ? 'var(--border)' : 'var(--gold)',
                            border: 'none',
                            borderRadius: '6px',
                            color: isUpdating || !cashReceived || parseFloat(cashReceived) < parseFloat(order.totalAmount ?? 0) ? 'var(--gray)' : 'var(--dark)',
                            fontSize: '0.85rem',
                            fontWeight: 700,
                            cursor: isUpdating || !cashReceived || parseFloat(cashReceived) < parseFloat(order.totalAmount ?? 0) ? 'not-allowed' : 'pointer',
                            width: '100%',
                          }}
                        >
                          {isUpdating ? 'Processing...' : 'Confirm Payment Received'}
                        </button>
                      </div>
                    )}
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: '0.85rem', color: 'var(--gray)' }}>Down Payment:</span>
                      <span style={{ fontSize: '0.85rem', color: 'var(--white)' }}>
                        ₱{(order.down_payment || 0).toLocaleString()}
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: '0.85rem', color: 'var(--gray)' }}>Balance:</span>
                      <span style={{ fontSize: '0.85rem', color: 'var(--gold)', fontWeight: 600 }}>
                        ₱{(order.balance || 0).toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Admin Notes Section */}
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
                    Admin Notes
                  </h4>
                  {isEditingNotes ? (
                    <div>
                      <textarea
                        value={notesEdit}
                        onChange={e => setNotesEdit(e.target.value)}
                        maxLength={1000}
                        rows={3}
                        disabled={isUpdating}
                        style={{
                          width: '100%',
                          backgroundColor: 'var(--bg-tertiary)',
                          border: '1px solid var(--gold-primary)',
                          borderRadius: '6px',
                          color: 'var(--text-primary)',
                          fontSize: '13px',
                          padding: '8px',
                          resize: 'vertical',
                          outline: 'none',
                          boxSizing: 'border-box',
                        }}
                      />
                      <button
                        onClick={() => {
                          setNotesEdit(order.notes || '');
                          setIsEditingNotes(false);
                        }}
                        disabled={isUpdating}
                        style={{
                          marginTop: '4px',
                          background: 'none',
                          border: 'none',
                          color: 'var(--text-secondary)',
                          fontSize: '12px',
                          cursor: isUpdating ? 'not-allowed' : 'pointer',
                          padding: 0,
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                      <span style={{
                        color: notesEdit ? 'var(--white)' : 'var(--gray)',
                        fontSize: '14px',
                        flex: 1,
                      }}>
                        {notesEdit || '—'}
                      </span>
                      <button
                        onClick={() => setIsEditingNotes(true)}
                        disabled={isUpdating}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: 'var(--gold-primary)',
                          fontSize: '12px',
                          cursor: isUpdating ? 'not-allowed' : 'pointer',
                          padding: '0 4px',
                          flexShrink: 0,
                        }}
                      >
                        Edit
                      </button>
                    </div>
                  )}
                </div>
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
                              background: item.preview_image_url ? 'transparent' : 'var(--border)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0,
                            }}
                          >
                            {item.preview_image_url ? (
                              <img
                                src={item.preview_image_url}
                                alt={item.product_name}
                                style={{ width: '40px', height: '40px', borderRadius: '4px', objectFit: 'cover' }}
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
                              {item.product_name}
                            </div>
                            {item.variant && (
                              <div style={{ fontSize: '0.75rem', color: 'var(--gray)', marginBottom: '0.25rem' }}>
                                {item.variant}
                              </div>
                            )}
                            {item.customization_note && (
                              <div
                                style={{
                                  fontSize: '0.75rem',
                                  color: 'var(--gold)',
                                  fontStyle: 'italic',
                                }}
                              >
                                "{item.customization_note}"
                              </div>
                            )}
                          </div>

                          {/* Line Total */}
                          <div style={{ textAlign: 'right', flexShrink: 0 }}>
                            <div style={{ fontSize: '0.75rem', color: 'var(--gray)' }}>
                              {item.quantity} × ₱{(item.unit_price || 0).toLocaleString()}
                            </div>
                            <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--gold)' }}>
                              ₱{((item.unit_price || 0) * (item.quantity || 0)).toLocaleString()}
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
                      <span style={{ color: 'var(--white)' }}>₱{(order.subtotal || 0).toLocaleString()}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem' }}>
                      <span style={{ color: 'var(--gray)' }}>Shipping Fee:</span>
                      <span style={{ color: 'var(--white)' }}>₱{(order.shipping_fee || 0).toLocaleString()}</span>
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
                        ₱{(order.total || 0).toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>

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
                            : '⏳ Pending Review'}
                        </span>
                      </div>
                    )}

                    {/* Design file link */}
                    {order.designFilePath && (
                      <div style={{ marginBottom: '0.75rem' }}>
                        <a
                          href={`${API_URL}/storage/${order.designFilePath}`}
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

                {/* Tracking Section */}
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
                    Tracking
                  </h4>
                  <div style={{ fontSize: '0.875rem', color: 'var(--white)' }}>
                    {order.tracking_number || '—'}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer (Admin mode only) */}
        {mode === 'admin' && !isLoading && !error && order && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              padding: '1rem 1.5rem',
              borderTop: '1px solid var(--border)',
              background: 'var(--dark2)',
            }}
          >
            {/* Payment status row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ fontSize: '0.85rem', color: 'var(--gray)', fontWeight: 600, minWidth: '120px' }}>
                Payment Status:
              </span>
              <button
                onClick={() => setPaymentEdit(
                paymentEdit === 'unpaid' ? 'paid' : 'unpaid'
              )}
              disabled={isUpdating}
              style={{
                padding: '4px 14px',
                borderRadius: '6px',
                border: '1px solid',
                borderColor: paymentEdit === 'paid'
                  ? 'var(--green, #4ade80)'
                  : 'var(--border-color)',
                backgroundColor: paymentEdit === 'paid'
                  ? 'rgba(74,222,128,0.1)'
                  : 'var(--bg-tertiary)',
                color: paymentEdit === 'paid'
                  ? 'var(--green, #4ade80)'
                  : 'var(--text-secondary)',
                fontSize: '13px',
                fontWeight: 600,
                cursor: isUpdating ? 'not-allowed' : 'pointer',
                opacity: isUpdating ? 0.6 : 1,
                textTransform: 'capitalize',
              }}
            >
              {paymentEdit === 'paid' ? '✓ Paid' : 'Unpaid'}
              </button>
            </div>
            {/* Order status row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ fontSize: '0.85rem', color: 'var(--gray)', fontWeight: 600, minWidth: '120px' }}>
                Order Status:
              </span>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              style={{
                padding: '0.5rem 0.75rem',
                background: 'var(--dark)',
                border: '1px solid var(--border)',
                borderRadius: '6px',
                color: 'var(--white)',
                fontSize: '0.875rem',
                cursor: 'pointer',
                minWidth: '140px',
              }}
            >
              {ORDER_STATUSES.map((status) => (
                <option key={status} value={status} style={{ background: 'var(--dark)', color: 'var(--white)' }}>
                  {status}
                </option>
              ))}
            </select>
            <button
              onClick={handleUpdateStatus}
              disabled={isUpdating || selectedStatus === order?.order_status}
              style={{
                padding: '0.5rem 1.25rem',
                background: isUpdating || selectedStatus === order?.order_status ? 'var(--border)' : 'var(--gold)',
                border: 'none',
                borderRadius: '6px',
                color: isUpdating || selectedStatus === order?.order_status ? 'var(--gray)' : 'var(--dark)',
                fontSize: '0.875rem',
                fontWeight: 600,
                cursor: isUpdating || selectedStatus === order?.order_status ? 'not-allowed' : 'pointer',
              }}
            >
              {isUpdating ? 'Updating...' : 'Update'}
            </button>
            </div>
            {updateError && (
              <span style={{ fontSize: '0.75rem', color: 'var(--red)', marginLeft: 'auto' }}>
                {updateError}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
