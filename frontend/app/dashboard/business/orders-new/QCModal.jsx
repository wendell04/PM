"use client";

/**
 * Quality Check Modal
 * Production team submits order for QC, QC team approves/rejects
 */

import { useState } from 'react';

export default function QCModal({ order, onClose, onSubmit }) {
  const [form, setForm] = useState({
    result: '', // 'passed' | 'failed'
    notes: '',
    defectDetails: '',
  });
  const [errors, setErrors] = useState({});

  if (!order) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    const newErrors = {};
    if (!form.result) newErrors.result = 'Please select a result';
    if (form.result === 'failed' && !form.defectDetails) {
      newErrors.defectDetails = 'Please describe the defect';
    }
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }
    onSubmit({
      orderId: order.id || order._id,
      result: form.result,
      notes: form.notes,
      defectDetails: form.defectDetails,
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
          maxWidth: '520px',
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
            <div style={{ fontSize: '0.6rem', color: '#8b5cf6', textTransform: 'uppercase', letterSpacing: '0.15em', fontWeight: 700, marginBottom: '0.25rem' }}>
              Quality Control
            </div>
            <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, color: '#E5E2E1' }}>
              Quality Check — Order #{order.id || order._id}
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
          <div style={{ padding: '1rem', background: 'rgba(255,255,255,0.03)', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.08)' }}>
            <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#E5E2E1' }}>
              {order.productName || order.items?.[0]?.productName || '—'}
            </div>
            <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '0.25rem' }}>
              Customer: {order.customerName || '—'} | Qty: {order.quantity || order.items?.reduce((s, i) => s + (i.qty || 1), 0) || 1}
            </div>
          </div>

          {/* QC Result Selection */}
          <div>
            <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#E5E2E1', marginBottom: '0.75rem' }}>
              QC Result <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              {/* Pass */}
              <button
                type="button"
                onClick={() => setForm((p) => ({ ...p, result: 'passed' }))}
                style={{
                  padding: '1rem',
                  background: form.result === 'passed' ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.03)',
                  border: `2px solid ${form.result === 'passed' ? '#22c55e' : 'rgba(255,255,255,0.1)'}`,
                  borderRadius: '10px',
                  cursor: 'pointer',
                  textAlign: 'center',
                  transition: 'all 0.2s',
                }}
              >
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={form.result === 'passed' ? '#22c55e' : '#9ca3af'} strokeWidth="2" style={{ marginBottom: '0.5rem' }}>
                  <circle cx="12" cy="12" r="10" />
                  <path d="M8 12l3 3 5-5" />
                </svg>
                <div style={{ fontSize: '0.85rem', fontWeight: 700, color: form.result === 'passed' ? '#22c55e' : '#E5E2E1' }}>
                  Pass
                </div>
                <div style={{ fontSize: '0.7rem', color: '#9ca3af', marginTop: '0.25rem' }}>
                  Meets quality standards
                </div>
              </button>

              {/* Fail */}
              <button
                type="button"
                onClick={() => setForm((p) => ({ ...p, result: 'failed' }))}
                style={{
                  padding: '1rem',
                  background: form.result === 'failed' ? 'rgba(239,68,68,0.15)' : 'rgba(255,255,255,0.03)',
                  border: `2px solid ${form.result === 'failed' ? '#ef4444' : 'rgba(255,255,255,0.1)'}`,
                  borderRadius: '10px',
                  cursor: 'pointer',
                  textAlign: 'center',
                  transition: 'all 0.2s',
                }}
              >
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={form.result === 'failed' ? '#ef4444' : '#9ca3af'} strokeWidth="2" style={{ marginBottom: '0.5rem' }}>
                  <circle cx="12" cy="12" r="10" />
                  <line x1="15" y1="9" x2="9" y2="15" />
                  <line x1="9" y1="9" x2="15" y2="15" />
                </svg>
                <div style={{ fontSize: '0.85rem', fontWeight: 700, color: form.result === 'failed' ? '#ef4444' : '#E5E2E1' }}>
                  Fail
                </div>
                <div style={{ fontSize: '0.7rem', color: '#9ca3af', marginTop: '0.25rem' }}>
                  Needs rework
                </div>
              </button>
            </div>
            {errors.result && (
              <div style={{ fontSize: '0.7rem', color: '#ef4444', marginTop: '0.5rem' }}>
                {errors.result}
              </div>
            )}
          </div>

          {/* Defect Details (shown only if failed) */}
          {form.result === 'failed' && (
            <div>
              <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#ef4444', marginBottom: '0.5rem' }}>
                Defect Details <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <textarea
                value={form.defectDetails}
                onChange={(e) => setForm((p) => ({ ...p, defectDetails: e.target.value }))}
                placeholder="Describe the defect found..."
                rows={3}
                style={{
                  ...inputStyle,
                  borderColor: errors.defectDetails ? 'rgba(239,68,68,0.5)' : undefined,
                }}
              />
              {errors.defectDetails && (
                <div style={{ fontSize: '0.7rem', color: '#ef4444', marginTop: '0.25rem' }}>
                  {errors.defectDetails}
                </div>
              )}
            </div>
          )}

          {/* General Notes */}
          <div>
            <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#E5E2E1', marginBottom: '0.5rem' }}>
              QC Notes
            </label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
              placeholder="Additional notes (optional)..."
              rows={2}
              style={inputStyle}
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
              background:
                form.result === 'passed'
                  ? 'linear-gradient(135deg, #4ade80 0%, #22c55e 100%)'
                  : form.result === 'failed'
                  ? 'linear-gradient(135deg, #f87171 0%, #ef4444 100%)'
                  : 'rgba(255,255,255,0.1)',
              border: 'none',
              borderRadius: '8px',
              color: form.result ? '#fff' : '#9ca3af',
              fontSize: '0.85rem',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Submit QC Result
          </button>
        </div>
      </div>
    </div>
  );
}
