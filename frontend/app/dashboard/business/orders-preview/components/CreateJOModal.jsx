"use client"

import { useState } from 'react';

function formatPeso(n) {
  return `₱${Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function CreateJOModal({ order, onClose, onSubmit }) {
  const [form, setForm] = useState({
    assignedTo: '',
    targetCompletion: '',
    isRush: false,
    notes: '',
  });
  const [errors, setErrors] = useState({});

  const handleSubmit = () => {
    const newErrors = {};
    if (!form.targetCompletion) newErrors.targetCompletion = 'Target date is required';
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }
    onSubmit({
      orderId: order.id,
      productName: order.items?.[0]?.name,
      productQuantity: order.items?.reduce((s, i) => s + (i.qty || 1), 0) || 1,
      targetCompletion: form.targetCompletion,
      isRush: form.isRush,
      assignedTo: form.assignedTo,
      notes: form.notes,
    });
  };

  if (!order) return null;

  const colors = {
    gold: 'var(--gold)',
    goldGradient: 'linear-gradient(135deg, var(--gold-light) 0%, var(--gold) 100%)',
    textPrimary: 'var(--white)',
    textMuted: 'var(--gray)',
    darkBg: 'var(--dark)',
    cardBg: 'rgba(255,255,255,0.03)',
    border: 'rgba(255,255,255,0.1)',
    green: 'var(--green)',
    greenBg: 'rgba(34,197,94,0.08)',
    greenBorder: 'rgba(34,197,94,0.2)',
    red: 'var(--red)',
    redBg: 'rgba(239,68,68,0.08)',
    redBorder: 'rgba(239,68,68,0.2)',
    indigo: 'var(--indigo)',
    indigoBg: 'rgba(99,102,241,0.1)',
  };

  const sectionLabelStyle = {
    margin: 0,
    fontSize: '0.7rem',
    fontWeight: 700,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
  };

  const inputStyle = {
    width: '100%',
    padding: '8px 16px',
    background: colors.darkBg,
    border: `1px solid ${colors.border}`,
    borderRadius: 8,
    color: colors.textPrimary,
    fontSize: '0.875rem',
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
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: colors.darkBg,
          border: `1px solid ${colors.border}`,
          borderRadius: 16,
          width: '100%',
          maxWidth: 560,
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
            padding: '16px 24px',
            borderBottom: '1px solid rgba(255,255,255,0.08)',
          }}
        >
          <div>
            <div
              style={{
                fontSize: '0.6rem',
                color: colors.gold,
                textTransform: 'uppercase',
                letterSpacing: '0.15em',
                fontWeight: 700,
                marginBottom: 8,
              }}
            >
              Production
            </div>
            <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, color: colors.textPrimary }}>
              Create Job Order
            </h2>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'rgba(255,255,255,0.06)',
              border: `1px solid ${colors.border}`,
              borderRadius: 8,
              width: 40,
              height: 40,
              cursor: 'pointer',
              color: colors.textMuted,
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
        <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* 1) Order info card */}
          <div
            style={{
              padding: 16,
              background: colors.cardBg,
              borderRadius: 16,
              border: `1px solid ${colors.border}`,
              borderLeft: `3px solid ${colors.gold}`,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '0.9rem', fontWeight: 700, color: colors.textPrimary }}>
                  Order #{order.id}
                </div>
                <div style={{ fontSize: '0.8rem', color: colors.textMuted, marginTop: 8, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {order.customer.name} | {order.items.length} item(s)
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '0.9rem', fontWeight: 800, color: colors.gold, fontFamily: 'monospace' }}>
                  {formatPeso(order.total)}
                </div>
                <div style={{ fontSize: '0.75rem', color: colors.textMuted, marginTop: 8 }}>
                  {formatPeso(order.paid)} paid
                </div>
              </div>
            </div>
          </div>

          {/* 2) BOM status */}
          {order.bom && (
            <div
              style={{
                padding: 16,
                background: order.bom.verified ? colors.greenBg : colors.redBg,
                borderRadius: 16,
                border: `1px solid ${order.bom.verified ? colors.greenBorder : colors.redBorder}`,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke={order.bom.verified ? colors.green : colors.red}
                  strokeWidth="2"
                >
                  {order.bom.verified ? (
                    <>
                      <circle cx="12" cy="12" r="10" />
                      <path d="M8 12l3 3 5-5" />
                    </>
                  ) : (
                    <>
                      <circle cx="12" cy="12" r="10" />
                      <line x1="15" y1="9" x2="9" y2="15" />
                      <line x1="9" y1="9" x2="15" y2="15" />
                    </>
                  )}
                </svg>
                <span style={{ fontSize: '0.85rem', color: colors.textPrimary, fontWeight: 700 }}>
                  {order.bom.verified
                    ? 'BOM verified — all materials available'
                    : 'BOM not verified — check stock before creating JO'}
                </span>
              </div>
            </div>
          )}

          {/* 3) Design files */}
          {order.designs?.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <h4 style={sectionLabelStyle}>Design Files</h4>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {order.designs.map((d, idx) => (
                  <div
                    key={idx}
                    style={{
                      padding: '8px 12px',
                      background: colors.indigoBg,
                      border: `1px solid rgba(99,102,241,0.3)`,
                      borderRadius: 999,
                      color: colors.indigo,
                      fontSize: '0.8rem',
                      fontWeight: 700,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      maxWidth: '100%',
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                    </svg>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {d.name}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 4) Items to produce */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <h4 style={sectionLabelStyle}>Items to Produce</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {order.items.map((item, idx) => (
                <div
                  key={idx}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 16,
                    padding: '8px 16px',
                    background: colors.cardBg,
                    borderRadius: 8,
                  }}
                >
                  <span style={{ fontSize: '0.9rem', color: colors.textPrimary, fontWeight: 600 }}>
                    {item.name} × {item.qty}
                  </span>
                  <span style={{ fontSize: '0.9rem', color: colors.gold, fontFamily: 'monospace', fontWeight: 700 }}>
                    {formatPeso(item.total)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* 5) Form fields */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={sectionLabelStyle}>Assigned To</div>
              <input
                value={form.assignedTo}
                placeholder="Production team member"
                onChange={(e) => setForm((p) => ({ ...p, assignedTo: e.target.value }))}
                style={inputStyle}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={sectionLabelStyle}>Target Completion</div>
              <input
                value={form.targetCompletion}
                type="date"
                onChange={(e) => {
                  const v = e.target.value;
                  setForm((p) => ({ ...p, targetCompletion: v }));
                  if (errors.targetCompletion) {
                    setErrors((p) => ({ ...p, targetCompletion: undefined }));
                  }
                }}
                style={{
                  ...inputStyle,
                  border: errors.targetCompletion ? `1px solid ${colors.redBorder}` : inputStyle.border,
                }}
              />
              {errors.targetCompletion && (
                <div style={{ fontSize: '0.8rem', color: colors.red, fontWeight: 700 }}>
                  {errors.targetCompletion}
                </div>
              )}
            </div>

            <div
              onClick={() => setForm((p) => ({ ...p, isRush: !p.isRush }))}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 16,
                padding: 16,
                background: form.isRush ? colors.redBg : colors.cardBg,
                borderRadius: 16,
                border: `1px solid ${form.isRush ? colors.redBorder : colors.border}`,
                cursor: 'pointer',
                userSelect: 'none',
              }}
            >
              <div>
                <div style={{ fontSize: '0.9rem', fontWeight: 800, color: colors.textPrimary }}>
                  Rush Order
                </div>
                <div style={{ fontSize: '0.8rem', color: colors.textMuted, marginTop: 8 }}>
                  Prioritize this job in production.
                </div>
              </div>
              <div
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 8,
                  border: `2px solid ${form.isRush ? colors.red : colors.textMuted}`,
                  background: form.isRush ? colors.red : 'transparent',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                {form.isRush && (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--dark)" strokeWidth="3">
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={sectionLabelStyle}>Notes</div>
              <textarea
                rows={3}
                value={form.notes}
                placeholder="Special instructions for production..."
                onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
                style={{
                  ...inputStyle,
                  resize: 'vertical',
                  minHeight: 88,
                  lineHeight: 1.4,
                }}
              />
            </div>
          </div>

          {/* 6) Order notes */}
          {order.notes && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <h4 style={sectionLabelStyle}>Order Notes</h4>
              <div
                style={{
                  padding: 16,
                  background: colors.cardBg,
                  borderRadius: 16,
                  fontSize: '0.9rem',
                  color: colors.textPrimary,
                  lineHeight: 1.6,
                }}
              >
                {order.notes}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 16,
            padding: '16px 24px',
            borderTop: '1px solid rgba(255,255,255,0.08)',
            background: 'rgba(0,0,0,0.2)',
          }}
        >
          <button
            onClick={onClose}
            style={{
              padding: '8px 16px',
              background: colors.cardBg,
              border: `1px solid ${colors.border}`,
              borderRadius: 8,
              color: colors.textPrimary,
              fontSize: '0.9rem',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            style={{
              padding: '8px 16px',
              background: colors.goldGradient,
              border: 'none',
              borderRadius: 8,
              color: '#000',
              fontSize: '0.9rem',
              fontWeight: 800,
              cursor: 'pointer',
            }}
          >
            Create &amp; Assign JO
          </button>
        </div>
      </div>
    </div>
  );
}
