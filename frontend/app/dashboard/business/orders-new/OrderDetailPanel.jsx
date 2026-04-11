"use client";

/**
 * Order Detail Panel - Right sidebar showing order details
 * ProfitPulse-style order detail view
 */

import { useMemo } from 'react';
import { OrderStatusBadge, JOStatusBadge, PaymentStatusBadge } from './OrderStatusBadge';
import PaymentTracker from './PaymentTracker';

function formatPeso(amount) {
  if (amount == null || amount === 0) return '—';
  return `P${Number(amount).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function OrderDetailPanel({ order, onClose, onCreateJO, onRecordPayment }) {
  if (!order) return null;

  const total = order.totalAmount || order.total || 0;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        width: '420px',
        height: '100vh',
        background: '#1a1a1a',
        borderLeft: '1px solid rgba(255,255,255,0.08)',
        overflowY: 'auto',
        zIndex: 1000,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          padding: '1.25rem',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          flexShrink: 0,
        }}
      >
        <div>
          <div style={{ fontSize: '0.7rem', color: '#9ca3af', marginBottom: '0.25rem' }}>
            Order #{order.id || order._id || '—'}
          </div>
          <OrderStatusBadge status={order.status || order.orderStatus} size="md" />
          <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: '#9ca3af' }}>
            {formatDate(order.createdAt)}
          </div>
        </div>
        <button
          onClick={onClose}
          style={{
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '8px',
            width: '32px',
            height: '32px',
            cursor: 'pointer',
            color: '#9ca3af',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem' }}>
        {/* Customer Info */}
        <div style={{ marginBottom: '1.5rem' }}>
          <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '0.75rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase' }}>
            Customer
          </h4>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '50%',
                background: 'rgba(212,168,67,0.15)',
                color: '#D4A843',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1rem',
                fontWeight: 700,
                flexShrink: 0,
              }}
            >
              {(order.customerName || order.customer?.name || '?').charAt(0).toUpperCase()}
            </div>
            <div>
              <div style={{ fontWeight: 600, color: '#E5E2E1', fontSize: '0.9rem' }}>
                {order.customerName || order.customer?.name || '—'}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#9ca3af' }}>
                {order.customerEmail || order.customer?.email || '—'}
              </div>
            </div>
          </div>
        </div>

        {/* Order Items */}
        <div style={{ marginBottom: '1.5rem' }}>
          <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '0.75rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase' }}>
            Order Items
          </h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {(order.items || order.orderItems || []).map((item, idx) => (
              <div
                key={idx}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  padding: '0.75rem',
                  background: 'rgba(255,255,255,0.03)',
                  borderRadius: '8px',
                }}
              >
                <div
                  style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '8px',
                    background: 'rgba(255,255,255,0.06)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#9ca3af',
                    flexShrink: 0,
                  }}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                    <circle cx="8.5" cy="8.5" r="1.5" />
                    <polyline points="21 15 16 10 5 21" />
                  </svg>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#E5E2E1', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {item.productName || item.name || '—'}
                  </div>
                  <div style={{ fontSize: '0.7rem', color: '#9ca3af' }}>
                    Qty: {item.qty || item.quantity || 1}
                  </div>
                </div>
                <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#D4A843', fontFamily: 'monospace' }}>
                  {formatPeso(item.price || item.unitPrice || item.total)}
                </div>
              </div>
            ))}
            {(order.items || order.orderItems || []).length === 0 && (
              <div style={{ textAlign: 'center', padding: '1rem', color: '#9ca3af', fontSize: '0.8rem' }}>
                No items
              </div>
            )}
          </div>
        </div>

        {/* Payment Tracker */}
        <div style={{ marginBottom: '1.5rem' }}>
          <PaymentTracker order={order} onRecordPayment={onRecordPayment} />
        </div>

        {/* Job Order Status */}
        {order.jobOrder && (
          <div style={{ marginBottom: '1.5rem' }}>
            <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '0.75rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase' }}>
              Production Status
            </h4>
            <div
              style={{
                padding: '0.75rem',
                background: 'rgba(255,255,255,0.03)',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div>
                <div style={{ fontSize: '0.8rem', color: '#E5E2E1', fontWeight: 600 }}>
                  JO #{order.jobOrder.id || order.jobOrder._id}
                </div>
                <div style={{ fontSize: '0.7rem', color: '#9ca3af' }}>
                  Target: {formatDate(order.jobOrder.targetCompletion)}
                </div>
              </div>
              <JOStatusBadge status={order.jobOrder.joStatus || order.jobOrder.status} />
            </div>
          </div>
        )}

        {/* Notes */}
        {order.notes && (
          <div style={{ marginBottom: '1.5rem' }}>
            <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.75rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase' }}>
              Notes
            </h4>
            <div
              style={{
                padding: '0.75rem',
                background: 'rgba(255,255,255,0.03)',
                borderRadius: '8px',
                fontSize: '0.8rem',
                color: '#E5E2E1',
                lineHeight: 1.5,
              }}
            >
              {order.notes}
            </div>
          </div>
        )}
      </div>

      {/* Footer Actions */}
      <div
        style={{
          padding: '1.25rem',
          borderTop: '1px solid rgba(255,255,255,0.08)',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.5rem',
          flexShrink: 0,
        }}
      >
        {!order.jobOrder && onCreateJO && (
          <button
            onClick={() => onCreateJO(order)}
            style={{
              width: '100%',
              padding: '0.625rem',
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
        )}
        <button
          style={{
            width: '100%',
            padding: '0.625rem',
            background: 'transparent',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '8px',
            color: '#9ca3af',
            fontSize: '0.85rem',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          View Full Details
        </button>
      </div>
    </div>
  );
}
