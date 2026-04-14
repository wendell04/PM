/**
 * Payment Tracker Component
 * Shows payment progress with progress bar
 */

function formatPeso(n) {
  return `₱${Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;
}

export default function PaymentTracker({ paid, total }) {
  const progress = total > 0 ? Math.min((paid / total) * 100, 100) : 0;
  const isFullyPaid = paid >= total;
  const balance = total - paid;

  return (
    <div style={{ background: isFullyPaid ? 'rgba(34,197,94,0.08)' : 'rgba(245,158,11,0.08)', borderRadius: '12px', border: `1px solid ${isFullyPaid ? 'rgba(34,197,94,0.25)' : 'rgba(245,158,11,0.25)'}`, padding: '1rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
        <h4 style={{ margin: 0, fontSize: '0.75rem', fontWeight: 700, color: '#E5E2E1' }}>Payment Status</h4>
        <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '0.2rem 0.6rem', borderRadius: '999px', background: isFullyPaid ? 'rgba(34,197,94,0.2)' : 'rgba(245,158,11,0.2)', color: isFullyPaid ? '#22c55e' : '#f59e0b' }}>
          {isFullyPaid ? 'Fully Paid' : paid > 0 ? 'Partial' : 'Unpaid'}
        </span>
      </div>

      {/* Progress Bar */}
      <div style={{ width: '100%', height: '8px', background: 'rgba(255,255,255,0.08)', borderRadius: '4px', overflow: 'hidden', marginBottom: '0.75rem' }}>
        <div style={{ width: `${progress}%`, height: '100%', background: isFullyPaid ? 'linear-gradient(90deg, #22c55e, #4ade80)' : 'linear-gradient(90deg, #f59e0b, #D4A843)', borderRadius: '4px', transition: 'width 0.3s' }} />
      </div>

      {/* Details */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem' }}>
        <div>
          <div style={{ fontSize: '0.65rem', color: '#9ca3af', marginBottom: '0.25rem', textTransform: 'uppercase' }}>Total</div>
          <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#E5E2E1', fontFamily: 'monospace' }}>{formatPeso(total)}</div>
        </div>
        <div>
          <div style={{ fontSize: '0.65rem', color: '#9ca3af', marginBottom: '0.25rem', textTransform: 'uppercase' }}>Paid</div>
          <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#22c55e', fontFamily: 'monospace' }}>{formatPeso(paid)}</div>
        </div>
        <div>
          <div style={{ fontSize: '0.65rem', color: '#9ca3af', marginBottom: '0.25rem', textTransform: 'uppercase' }}>Balance</div>
          <div style={{ fontSize: '0.95rem', fontWeight: 700, color: isFullyPaid ? '#6b7280' : '#ef4444', fontFamily: 'monospace' }}>{isFullyPaid ? '—' : formatPeso(balance)}</div>
        </div>
      </div>
    </div>
  );
}
