/**
 * Create Job Order Modal
 * Shows BOM info, design preview, and JO creation form
 */

function formatPeso(n) {
  return `₱${Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;
}

export default function CreateJOModal({ order, onClose }) {
  if (!order) return null;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, backdropFilter: 'blur(4px)' }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '16px', width: '90%', maxWidth: '560px', overflow: 'hidden', boxShadow: '0 24px 48px rgba(0,0,0,0.5)' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.25rem 1.5rem', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <div>
            <div style={{ fontSize: '0.6rem', color: '#D4A843', textTransform: 'uppercase', letterSpacing: '0.15em', fontWeight: 700, marginBottom: '0.25rem' }}>Production</div>
            <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, color: '#E5E2E1' }}>Create Job Order</h2>
          </div>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', width: '36px', height: '36px', cursor: 'pointer', color: '#9ca3af', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '1.5rem' }}>
          {/* Order Info */}
          <div style={{ padding: '1rem', background: 'rgba(212,168,67,0.08)', borderRadius: '10px', border: '1px solid rgba(212,168,67,0.2)', marginBottom: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#E5E2E1' }}>Order #{order.id}</div>
                <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '0.25rem' }}>{order.customer.name} | {order.items.length} item(s)</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#D4A843', fontFamily: 'monospace' }}>{formatPeso(order.total)}</div>
                <div style={{ fontSize: '0.7rem', color: '#9ca3af' }}>{formatPeso(order.paid)} paid</div>
              </div>
            </div>
          </div>

          {/* BOM Status */}
          {order.bom && (
            <div style={{ padding: '0.75rem', background: order.bom.verified ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)', borderRadius: '8px', border: `1px solid ${order.bom.verified ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}`, marginBottom: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={order.bom.verified ? '#22c55e' : '#ef4444'} strokeWidth="2">
                  {order.bom.verified ? <><circle cx="12" cy="12" r="10" /><path d="M8 12l3 3 5-5" /></> : <><circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></>}
                </svg>
                <span style={{ fontSize: '0.75rem', color: order.bom.verified ? '#22c55e' : '#ef4444', fontWeight: 600 }}>
                  {order.bom.verified ? 'BOM verified — all materials available' : 'BOM not verified — check stock before creating JO'}
                </span>
              </div>
            </div>
          )}

          {/* Design Files */}
          {order.designs.length > 0 && (
            <div style={{ marginBottom: '1rem' }}>
              <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.7rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase' }}>Design Files</h4>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                {order.designs.map((d, idx) => (
                  <div key={idx} style={{ padding: '0.5rem 0.75rem', background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.3)', borderRadius: '8px', color: '#6366f1', fontSize: '0.75rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>
                    {d.name}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Items Summary */}
          <div style={{ marginBottom: '1rem' }}>
            <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.7rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase' }}>Items to Produce</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
              {order.items.map((item, idx) => (
                <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0.75rem', background: 'rgba(255,255,255,0.03)', borderRadius: '6px' }}>
                  <span style={{ fontSize: '0.8rem', color: '#E5E2E1' }}>{item.name} × {item.qty}</span>
                  <span style={{ fontSize: '0.8rem', color: '#D4A843', fontFamily: 'monospace' }}>{formatPeso(item.total)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Notes */}
          {order.notes && (
            <div>
              <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.7rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase' }}>Order Notes</h4>
              <div style={{ padding: '0.75rem', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', fontSize: '0.8rem', color: '#E5E2E1', lineHeight: 1.5 }}>{order.notes}</div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', padding: '1.25rem 1.5rem', borderTop: '1px solid rgba(255,255,255,0.08)', background: 'rgba(0,0,0,0.2)' }}>
          <button onClick={onClose} style={{ padding: '0.625rem 1.25rem', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#E5E2E1', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
          <button onClick={onClose} style={{ padding: '0.625rem 1.5rem', background: 'linear-gradient(135deg, #FFDF9F 0%, #D4A843 100%)', border: 'none', borderRadius: '8px', color: '#000', fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer' }}>
            Create & Assign JO
          </button>
        </div>
      </div>
    </div>
  );
}
