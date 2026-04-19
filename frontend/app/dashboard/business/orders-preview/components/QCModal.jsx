"use client"

import { useState } from 'react';

export default function QCModal({ order, onClose, onSubmit }) {
  const TEXT_PRIMARY = 'var(--white)';
  const TEXT_MUTED = 'var(--gray)';
  const DARK_BG = 'var(--dark)';
  const CARD_BG = 'rgba(255,255,255,0.03)';
  const BORDER = 'rgba(255,255,255,0.1)';
  const GREEN = 'var(--green)';
  const GREEN_BG = 'rgba(34,197,94,0.15)';
  const GREEN_BORDER = 'rgba(34,197,94,0.2)';
  const RED = 'var(--red)';
  const RED_BG = 'rgba(239,68,68,0.15)';
  const RED_BORDER = 'rgba(239,68,68,0.2)';
  const PURPLE = 'var(--purple)';

  const [form, setForm] = useState({ result: '', notes: '', defectDetails: '', checkedBy: '' });
  const [errors, setErrors] = useState({});

  if (!order) return null;

  const handleSubmit = () => {
    const newErrors = {};
    if (!form.result) newErrors.result = 'Please select a result';
    if (!form.checkedBy.trim()) newErrors.checkedBy = 'Inspector name is required';
    if (form.result === 'failed' && !form.defectDetails) newErrors.defectDetails = 'Please describe the defect';
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }
    onSubmit({
      passed: form.result === 'passed',
      defects: form.defectDetails || null,
      checkedBy: form.checkedBy.trim(),
      notes: form.notes,
    });
  };

  const qty = order.items?.reduce((s, i) => s + (i.qty || 1), 0) || 1;
  const productName = order.items?.[0]?.name || '—';

  const baseFieldStyle = {
    width: '100%',
    padding: '10px 12px',
    background: DARK_BG,
    border: `1px solid ${BORDER}`,
    borderRadius: 10,
    color: TEXT_PRIMARY,
    fontSize: '0.875rem',
    outline: 'none',
  };

  const qcBtnBase = {
    width: '100%',
    textAlign: 'left',
    padding: 12,
    background: CARD_BG,
    border: `1px solid rgba(255,255,255,0.08)`,
    borderRadius: 12,
    cursor: 'pointer',
    display: 'flex',
    gap: 10,
    alignItems: 'flex-start',
  };

  const submitBg =
    form.result === 'passed'
      ? 'linear-gradient(135deg, rgba(34,197,94,0.95) 0%, rgba(34,197,94,0.65) 100%)'
      : form.result === 'failed'
        ? 'linear-gradient(135deg, rgba(239,68,68,0.95) 0%, rgba(239,68,68,0.65) 100%)'
        : 'rgba(255,255,255,0.1)';

  const submitColor = form.result ? 'var(--white)' : TEXT_MUTED;

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
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: DARK_BG,
          border: `1px solid ${BORDER}`,
          borderRadius: 16,
          width: '100%',
          maxWidth: 520,
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
            padding: '16px 20px',
            borderBottom: '1px solid rgba(255,255,255,0.08)',
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontSize: '0.6rem',
                color: PURPLE,
                textTransform: 'uppercase',
                letterSpacing: '0.15em',
                fontWeight: 700,
                marginBottom: 8,
              }}
            >
              Quality Control
            </div>
            <h2
              style={{
                margin: 0,
                fontSize: '1.05rem',
                fontWeight: 800,
                color: TEXT_PRIMARY,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              Quality Check — Order #{order.id}
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'rgba(255,255,255,0.06)',
              border: `1px solid ${BORDER}`,
              borderRadius: 10,
              width: 40,
              height: 40,
              cursor: 'pointer',
              color: TEXT_MUTED,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* 1) Order Info Card */}
          <div
            style={{
              padding: 16,
              background: CARD_BG,
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 14,
            }}
          >
            <div style={{ fontSize: '0.95rem', fontWeight: 800, color: TEXT_PRIMARY }}>
              {productName}
            </div>
            <div style={{ marginTop: 8, fontSize: '0.75rem', color: TEXT_MUTED, lineHeight: 1.5 }}>
              Customer: {order.customer.name} | Qty: {qty}
            </div>
          </div>

          {/* 2) QC Result */}
          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: 800, color: TEXT_MUTED, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              QC Result *
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 12,
                marginTop: 10,
              }}
            >
              <button
                type="button"
                onClick={() => {
                  setForm((p) => ({ ...p, result: 'passed' }));
                  if (errors.result) setErrors((p) => ({ ...p, result: undefined }));
                }}
                style={{
                  ...qcBtnBase,
                  background: form.result === 'passed' ? GREEN_BG : qcBtnBase.background,
                  border: `1px solid ${form.result === 'passed' ? GREEN : 'rgba(255,255,255,0.08)'}`,
                }}
              >
                <div
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 8,
                    border: `2px solid ${form.result === 'passed' ? GREEN : TEXT_MUTED}`,
                    background: form.result === 'passed' ? GREEN : 'transparent',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    marginTop: 2,
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={DARK_BG} strokeWidth="3">
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: '0.9rem', fontWeight: 900, color: TEXT_PRIMARY }}>Pass</div>
                  <div style={{ marginTop: 4, fontSize: '0.75rem', color: TEXT_MUTED, lineHeight: 1.4 }}>
                    Meets quality standards
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setForm((p) => ({ ...p, result: 'failed' }));
                  if (errors.result) setErrors((p) => ({ ...p, result: undefined }));
                }}
                style={{
                  ...qcBtnBase,
                  background: form.result === 'failed' ? RED_BG : qcBtnBase.background,
                  border: `1px solid ${form.result === 'failed' ? RED : 'rgba(255,255,255,0.08)'}`,
                }}
              >
                <div
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 8,
                    border: `2px solid ${form.result === 'failed' ? RED : TEXT_MUTED}`,
                    background: form.result === 'failed' ? RED : 'transparent',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    marginTop: 2,
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={DARK_BG} strokeWidth="3">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: '0.9rem', fontWeight: 900, color: TEXT_PRIMARY }}>Fail</div>
                  <div style={{ marginTop: 4, fontSize: '0.75rem', color: TEXT_MUTED, lineHeight: 1.4 }}>
                    Requires rework / reject
                  </div>
                </div>
              </button>
            </div>

            {errors.result && (
              <div style={{ marginTop: 10, fontSize: '0.85rem', fontWeight: 700, color: RED }}>
                {errors.result}
              </div>
            )}
          </div>

          {/* 3) Defect Details */}
          {form.result === 'failed' && (
            <div>
              <div style={{ fontSize: '0.75rem', fontWeight: 800, color: TEXT_MUTED, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Defect Details
              </div>
              <textarea
                rows={3}
                value={form.defectDetails}
                placeholder="Describe the defect found..."
                onChange={(e) => {
                  const v = e.target.value;
                  setForm((p) => ({ ...p, defectDetails: v }));
                  if (errors.defectDetails) setErrors((p) => ({ ...p, defectDetails: undefined }));
                }}
                style={{
                  ...baseFieldStyle,
                  marginTop: 10,
                  resize: 'vertical',
                  border: errors.defectDetails ? `1px solid ${RED_BORDER}` : baseFieldStyle.border,
                }}
              />
              {errors.defectDetails && (
                <div style={{ marginTop: 8, fontSize: '0.85rem', fontWeight: 700, color: RED }}>
                  {errors.defectDetails}
                </div>
              )}
            </div>
          )}

          {/* 4) Checked By */}
          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: 800, color: TEXT_MUTED, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Inspector Name *
            </div>
            <input
              type="text"
              value={form.checkedBy}
              placeholder="Name of person conducting QC..."
              onChange={(e) => {
                const v = e.target.value;
                setForm((p) => ({ ...p, checkedBy: v }));
                if (errors.checkedBy) setErrors((p) => ({ ...p, checkedBy: undefined }));
              }}
              style={{
                ...baseFieldStyle,
                marginTop: 10,
                border: errors.checkedBy ? `1px solid ${RED_BORDER}` : baseFieldStyle.border,
              }}
            />
            {errors.checkedBy && (
              <div style={{ marginTop: 8, fontSize: '0.85rem', fontWeight: 700, color: RED }}>
                {errors.checkedBy}
              </div>
            )}
          </div>

          {/* 5) QC Notes */}
          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: 800, color: TEXT_MUTED, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              QC Notes
            </div>
            <textarea
              rows={2}
              value={form.notes}
              placeholder="Additional notes (optional)..."
              onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
              style={{
                ...baseFieldStyle,
                marginTop: 10,
                resize: 'vertical',
                minHeight: 72,
              }}
            />
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 12,
            padding: 16,
            borderTop: '1px solid rgba(255,255,255,0.08)',
            background: 'rgba(0,0,0,0.2)',
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '10px 14px',
              background: CARD_BG,
              border: `1px solid ${BORDER}`,
              borderRadius: 10,
              color: TEXT_PRIMARY,
              fontSize: '0.9rem',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            style={{
              padding: '10px 14px',
              background: submitBg,
              border: form.result === 'passed'
                ? `1px solid ${GREEN_BORDER}`
                : form.result === 'failed'
                  ? `1px solid ${RED_BORDER}`
                  : `1px solid ${BORDER}`,
              borderRadius: 10,
              color: submitColor,
              fontSize: '0.9rem',
              fontWeight: 800,
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

