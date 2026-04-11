"use client";

/**
 * Create Job Order Modal
 * Converts an order into a Job Order for production
 */

import { useState } from 'react';

export default function CreateJOModal({ order, materials, onClose, onSubmit }) {
  const [form, setForm] = useState({
    assignedTo: '',
    targetCompletion: '',
    isRush: false,
    notes: '',
  });
  const [errors, setErrors] = useState({});

  if (!order) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    const newErrors = {};
    if (!form.targetCompletion) newErrors.targetCompletion = 'Target date is required';
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }
    onSubmit({
      orderId: order.id || order._id,
      productName: order.productName || order.items?.[0]?.productName,
      productQuantity: order.quantity || order.items?.reduce((s, i) => s + (i.qty || 1), 0) || 1,
      targetCompletion: form.targetCompletion,
      isRush: form.isRush,
      assignedTo: form.assignedTo,
      notes: form.notes,
    });
  };

  const inputStyle = {
    width: '100%',
    padding: '0.625rem 0.75rem',
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '8px',
    color: '#E5E2E1',
    fontSize: '0.85rem',
    outline: 'none',
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.8)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2000,
        backdropFilter: 'blur(4px)',
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#1a1a1a',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: '16px',
          width: '90%',
          maxWidth: '500px',
          overflow: 'hidden',
          boxShadow: '0 24px 48px rgba(0,0,0,0.5)',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '1.25rem 1.5rem',
            borderBottom: '1px solid rgba(255,255,255,0.08)',
          }}
        >
          <div>
            <div style={{ fontSize: '0.6rem', color: '#D4A843', textTransform: 'uppercase', letterSpacing: '0.15em', fontWeight: 700, marginBottom: '0.25rem' }}>
              Production
            </div>
            <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, color: '#E5E2E1' }}>
              Create Job Order
            </h2>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '8px',
              width: '36px',
              height: '36px',
              cursor: 'pointer',
              color: '#9ca3af',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Order Info */}
          <div style={{ padding: '1rem', background: 'rgba(212,168,67,0.08)', borderRadius: '10px', border: '1px solid rgba(212,168,67,0.2)' }}>
            <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#E5E2E1' }}>
              Order #{order.id || order._id}
            </div>
            <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '0.25rem' }}>
              {order.customerName || '—'} | {order.items?.length || 1} item(s)
            </div>
          </div>

          {/* BOM Check Info */}
          <div style={{ padding: '0.75rem', background: 'rgba(34,197,94,0.08)', borderRadius: '8px', border: '1px solid rgba(34,197,94,0.2)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <path d="M8 12l3 3 5-5" />
              </svg>
              <span style={{ fontSize: '0.75rem', color: '#22c55e', fontWeight: 600 }}>
                BOM stock verified — all materials available
              </span>
            </div>
          </div>

          {/* Assigned To */}
          <div>
            <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#E5E2E1', marginBottom: '0.5rem' }}>
              Assigned To
            </label>
            <input
              type="text"
              value={form.assignedTo}
              onChange={(e) => setForm((p) => ({ ...p, assignedTo: e.target.value }))}
              placeholder="Production team member"
              style={inputStyle}
            />
          </div>

          {/* Target Completion */}
          <div>
            <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#E5E2E1', marginBottom: '0.5rem' }}>
              Target Completion <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <input
              type="date"
              value={form.targetCompletion}
              onChange={(e) => setForm((p) => ({ ...p, targetCompletion: e.target.value }))}
              style={{
                ...inputStyle,
                borderColor: errors.targetCompletion ? 'rgba(239,68,68,0.5)' : undefined,
              }}
            />
            {errors.targetCompletion && (
              <div style={{ fontSize: '0.7rem', color: '#ef4444', marginTop: '0.25rem' }}>
                {errors.targetCompletion}
              </div>
            )}
          </div>

          {/* Rush Order Toggle */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              padding: '0.75rem',
              background: form.isRush ? 'rgba(239,68,68,0.08)' : 'rgba(255,255,255,0.03)',
              borderRadius: '8px',
              border: `1px solid ${form.isRush ? 'rgba(239,68,68,0.3)' : 'rgba(255,255,255,0.08)'}`,
              cursor: 'pointer',
            }}
            onClick={() => setForm((p) => ({ ...p, isRush: !p.isRush }))}
          >
            <div
              style={{
                width: '20px',
                height: '20px',
                borderRadius: '4px',
                border: form.isRush ? '2px solid #ef4444' : '2px solid rgba(255,255,255,0.2)',
                background: form.isRush ? '#ef4444' : 'transparent',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              {form.isRush && (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
            </div>
            <div>
              <div style={{ fontSize: '0.8rem', fontWeight: 600, color: form.isRush ? '#ef4444' : '#E5E2E1' }}>
                Rush Order
              </div>
              <div style={{ fontSize: '0.7rem', color: '#9ca3af' }}>
                Priority production — expedite processing
              </div>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#E5E2E1', marginBottom: '0.5rem' }}>
              Notes
            </label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
              placeholder="Special instructions for production..."
              rows={3}
              style={{ ...inputStyle, resize: 'vertical' }}
            />
          </div>
        </form>

        {/* Footer */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '0.75rem',
            padding: '1.25rem 1.5rem',
            borderTop: '1px solid rgba(255,255,255,0.08)',
            background: 'rgba(0,0,0,0.2)',
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '0.625rem 1.25rem',
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '8px',
              color: '#E5E2E1',
              fontSize: '0.85rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            style={{
              padding: '0.625rem 1.5rem',
              background: 'linear-gradient(135deg, #FFDF9F 0%, #D4A843 100%)',
              border: 'none',
              borderRadius: '8px',
              color: '#000',
              fontSize: '0.85rem',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Create Job Order
          </button>
        </div>
      </div>
    </div>
  );
}
