'use client';

import React, { useState } from 'react';

const inp = {
  width: '100%',
  marginTop: '4px',
  padding: '8px 10px',
  background: 'var(--dark3)',
  border: '1px solid var(--border)',
  borderRadius: '6px',
  color: 'var(--white)',
  fontSize: '0.85rem',
  outline: 'none',
  boxSizing: 'border-box',
};

const QuotationModal = ({ onClose, onSubmit, isSending }) => {
  const [form, setForm] = useState({
    productName: '',
    qty: 1,
    unitPrice: '',
    designFee: '',
    deliveryFee: '',
    downPayment: '',
    note: '',
  });

  const qty = parseInt(form.qty) || 1;
  const unitPrice = parseFloat(form.unitPrice) || 0;
  const designFee = parseFloat(form.designFee) || 0;
  const deliveryFee = parseFloat(form.deliveryFee) || 0;
  const total = unitPrice * qty + designFee + deliveryFee;
  const downPayment = parseFloat(form.downPayment) || 0;
  const dpPct = total > 0 && downPayment > 0 ? Math.round((downPayment / total) * 100) : 0;

  const fmt = (n) => n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((p) => ({ ...p, [name]: value }));
  };

  const canSubmit = form.productName.trim() && unitPrice > 0 && !isSending;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    onSubmit({ productName: form.productName.trim(), qty, unitPrice, designFee, deliveryFee, downPayment, note: form.note.trim(), total });
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.72)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '16px',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--dark2)',
          border: '1px solid var(--border)',
          borderRadius: '12px',
          padding: '24px',
          width: '100%',
          maxWidth: '420px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
          <div>
            <div style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--white)' }}>Create Quotation</div>
            <div style={{ fontSize: '0.72rem', color: '#888', marginTop: '2px' }}>Send a price quote to the customer</div>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer', fontSize: '1rem', lineHeight: 1, padding: '4px' }}
          >✕</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '12px' }}>
            <label style={{ fontSize: '0.7rem', color: '#888', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>Product / Service</label>
            <input name="productName" value={form.productName} onChange={handleChange} required placeholder="e.g. Custom Tarpaulin 3x5ft" style={inp} />
          </div>

          <div style={{ marginBottom: '12px' }}>
            <label style={{ fontSize: '0.7rem', color: '#888', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>Quantity (pcs)</label>
            <input name="qty" type="number" min="1" value={form.qty} onChange={handleChange} required style={inp} />
          </div>

          <div style={{ marginBottom: '12px' }}>
            <label style={{ fontSize: '0.7rem', color: '#888', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>Price per Piece (&#8369;)</label>
            <input name="unitPrice" type="number" min="0" step="0.01" value={form.unitPrice} onChange={handleChange} required placeholder="0.00" style={inp} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
            <div>
              <label style={{ fontSize: '0.7rem', color: '#888', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>Design Fee (&#8369;)</label>
              <input name="designFee" type="number" min="0" step="0.01" value={form.designFee} onChange={handleChange} placeholder="0.00" style={inp} />
            </div>
            <div>
              <label style={{ fontSize: '0.7rem', color: '#888', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>Delivery Fee (&#8369;)</label>
              <input name="deliveryFee" type="number" min="0" step="0.01" value={form.deliveryFee} onChange={handleChange} placeholder="0.00" style={inp} />
            </div>
          </div>

          <div style={{ marginBottom: '12px' }}>
            <label style={{ fontSize: '0.7rem', color: '#888', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>
              Downpayment (&#8369;, optional){dpPct > 0 ? ` — ${dpPct}%` : ''}
            </label>
            <input name="downPayment" type="number" min="0" step="0.01" value={form.downPayment} onChange={handleChange} placeholder="Leave blank for 50% default" style={inp} />
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={{ fontSize: '0.7rem', color: '#888', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>Note (optional)</label>
            <textarea
              name="note"
              value={form.note}
              onChange={handleChange}
              placeholder="Additional notes for the customer..."
              rows={2}
              style={{ ...inp, resize: 'vertical', minHeight: '52px', fontFamily: 'inherit' }}
            />
          </div>

          {/* Breakdown */}
          <div style={{
            background: 'rgba(212,168,67,0.07)',
            border: '1px solid rgba(212,168,67,0.22)',
            borderRadius: '8px',
            padding: '12px 14px',
            marginBottom: '16px',
            fontSize: '0.8rem',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#888', marginBottom: '4px' }}>
              <span>Subtotal ({qty} pcs × &#8369;{fmt(unitPrice)})</span>
              <span>&#8369;{fmt(unitPrice * qty)}</span>
            </div>
            {designFee > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#888', marginBottom: '4px' }}>
                <span>Design fee</span>
                <span>&#8369;{fmt(designFee)}</span>
              </div>
            )}
            {deliveryFee > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#888', marginBottom: '4px' }}>
                <span>Delivery fee</span>
                <span>&#8369;{fmt(deliveryFee)}</span>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid rgba(212,168,67,0.2)', paddingTop: '8px', marginTop: '6px' }}>
              <span style={{ fontWeight: 700, color: '#d4a843' }}>Total</span>
              <span style={{ fontSize: '1rem', fontWeight: 900, color: '#d4a843' }}>&#8369;{fmt(total)}</span>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                flex: 1, padding: '10px', borderRadius: '8px',
                background: 'var(--dark3)', border: '1px solid var(--border)',
                color: 'var(--white)', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer',
              }}
            >Cancel</button>
            <button
              type="submit"
              disabled={!canSubmit}
              style={{
                flex: 1, padding: '10px', borderRadius: '8px',
                background: '#d4a843', border: 'none',
                color: '#000', fontWeight: 800, fontSize: '0.85rem',
                cursor: canSubmit ? 'pointer' : 'not-allowed',
                opacity: canSubmit ? 1 : 0.5,
              }}
            >{isSending ? 'Sending...' : 'Send Quotation'}</button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default QuotationModal;
