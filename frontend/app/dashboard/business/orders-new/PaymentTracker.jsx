"use client";

/**
 * Payment Tracker Component
 * Shows down payment / balance progress for an order
 */

function formatPeso(amount) {
  if (amount == null || amount === 0) return '—';
  return `P${Number(amount).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function PaymentTracker({ order, onRecordPayment }) {
  if (!order) return null;

  const total = order.totalAmount || order.total || 0;
  const paid = order.totalPaid || order.downPayment || 0;
  const balance = total - paid;
  const isFullyPaid = balance <= 0;
  const progressPercent = total > 0 ? Math.min((paid / total) * 100, 100) : 0;

  return (
    <div
      style={{
        background: 'rgba(255,255,255,0.04)',
        borderRadius: '12px',
        border: `1px solid ${isFullyPaid ? 'rgba(34,197,94,0.3)' : 'rgba(212,168,67,0.3)'}`,
        padding: '1rem',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '0.75rem',
        }}
      >
        <h4 style={{ margin: 0, fontSize: '0.85rem', fontWeight: 700, color: '#E5E2E1' }}>
          Payment Status
        </h4>
        <span
          style={{
            fontSize: '0.7rem',
            fontWeight: 700,
            padding: '0.2rem 0.6rem',
            borderRadius: '999px',
            background: isFullyPaid ? 'rgba(34,197,94,0.15)' : 'rgba(245,158,11,0.15)',
            color: isFullyPaid ? '#22c55e' : '#f59e0b',
            border: `1px solid ${isFullyPaid ? 'rgba(34,197,94,0.3)' : 'rgba(245,158,11,0.3)'}`,
          }}
        >
          {isFullyPaid ? 'Fully Paid' : paid > 0 ? 'Partial Payment' : 'Unpaid'}
        </span>
      </div>

      {/* Progress Bar */}
      <div
        style={{
          width: '100%',
          height: '8px',
          background: 'rgba(255,255,255,0.08)',
          borderRadius: '4px',
          overflow: 'hidden',
          marginBottom: '0.75rem',
        }}
      >
        <div
          style={{
            width: `${progressPercent}%`,
            height: '100%',
            background: isFullyPaid
              ? 'linear-gradient(90deg, #22c55e, #4ade80)'
              : 'linear-gradient(90deg, #f59e0b, #D4A843)',
            borderRadius: '4px',
            transition: 'width 0.3s',
          }}
        />
      </div>

      {/* Details */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 1fr',
          gap: '0.75rem',
          marginBottom: '1rem',
        }}
      >
        <div>
          <div style={{ fontSize: '0.65rem', color: '#9ca3af', marginBottom: '0.25rem', textTransform: 'uppercase' }}>
            Total
          </div>
          <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#E5E2E1', fontFamily: 'monospace' }}>
            {formatPeso(total)}
          </div>
        </div>
        <div>
          <div style={{ fontSize: '0.65rem', color: '#9ca3af', marginBottom: '0.25rem', textTransform: 'uppercase' }}>
            Paid
          </div>
          <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#22c55e', fontFamily: 'monospace' }}>
            {formatPeso(paid)}
          </div>
        </div>
        <div>
          <div style={{ fontSize: '0.65rem', color: '#9ca3af', marginBottom: '0.25rem', textTransform: 'uppercase' }}>
            Balance
          </div>
          <div
            style={{
              fontSize: '0.95rem',
              fontWeight: 700,
              color: isFullyPaid ? '#9ca3af' : '#ef4444',
              fontFamily: 'monospace',
            }}
          >
            {isFullyPaid ? '—' : formatPeso(balance)}
          </div>
        </div>
      </div>

      {/* Action Button */}
      {!isFullyPaid && onRecordPayment && (
        <button
          onClick={onRecordPayment}
          style={{
            width: '100%',
            padding: '0.625rem',
            background: 'rgba(212,168,67,0.15)',
            border: '1px solid rgba(212,168,67,0.3)',
            borderRadius: '8px',
            color: '#D4A843',
            fontSize: '0.8rem',
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.5rem',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
            <line x1="1" y1="10" x2="23" y2="10" />
          </svg>
          Record Payment
        </button>
      )}

      {isFullyPaid && (
        <div
          style={{
            textAlign: 'center',
            padding: '0.5rem',
            background: 'rgba(34,197,94,0.08)',
            borderRadius: '8px',
          }}
        >
          <span style={{ fontSize: '0.75rem', color: '#22c55e', fontWeight: 600 }}>
            Order is fully paid
          </span>
        </div>
      )}
    </div>
  );
}
