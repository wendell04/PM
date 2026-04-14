/**
 * BOM Verification Panel
 * Shows Bill of Materials stock check before JO creation
 */

export default function BOMVerification({ order, onClose }) {
  if (!order || !order.bom) return null;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, backdropFilter: 'blur(4px)' }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '16px', width: '90%', maxWidth: '520px', overflow: 'hidden', boxShadow: '0 24px 48px rgba(0,0,0,0.5)' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.25rem 1.5rem', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <div>
            <div style={{ fontSize: '0.6rem', color: '#22c55e', textTransform: 'uppercase', letterSpacing: '0.15em', fontWeight: 700, marginBottom: '0.25rem' }}>Bill of Materials</div>
            <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, color: '#E5E2E1' }}>BOM Verification</h2>
          </div>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', width: '36px', height: '36px', cursor: 'pointer', color: '#9ca3af', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '1.5rem' }}>
          {/* BOM Status Banner */}
          <div style={{ padding: '1rem', background: order.bom.verified ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)', borderRadius: '10px', border: `1px solid ${order.bom.verified ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}`, marginBottom: '1.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: order.bom.verified ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={order.bom.verified ? '#22c55e' : '#ef4444'} strokeWidth="2">
                  {order.bom.verified ? <><circle cx="12" cy="12" r="10" /><path d="M8 12l3 3 5-5" /></> : <><circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></>}
                </svg>
              </div>
              <div>
                <div style={{ fontSize: '0.9rem', fontWeight: 700, color: order.bom.verified ? '#22c55e' : '#ef4444' }}>
                  {order.bom.verified ? 'All Materials Available' : 'Insufficient Stock'}
                </div>
                <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '0.15rem' }}>
                  {order.bom.verified ? 'Ready to create Job Order' : 'Restock required before production'}
                </div>
              </div>
            </div>
          </div>

          {/* BOM Items Table */}
          {order.bom.items && order.bom.items.length > 0 && (
            <div>
              <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '0.7rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase' }}>Material Requirements</h4>
              <div style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                  <thead>
                    <tr style={{ background: 'rgba(0,0,0,0.3)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                      <th style={{ padding: '0.6rem 0.75rem', textAlign: 'left', color: '#9ca3af', fontWeight: 700, fontSize: '0.65rem', textTransform: 'uppercase' }}>Material</th>
                      <th style={{ padding: '0.6rem 0.75rem', textAlign: 'center', color: '#9ca3af', fontWeight: 700, fontSize: '0.65rem', textTransform: 'uppercase' }}>Required</th>
                      <th style={{ padding: '0.6rem 0.75rem', textAlign: 'center', color: '#9ca3af', fontWeight: 700, fontSize: '0.65rem', textTransform: 'uppercase' }}>Available</th>
                      <th style={{ padding: '0.6rem 0.75rem', textAlign: 'center', color: '#9ca3af', fontWeight: 700, fontSize: '0.65rem', textTransform: 'uppercase' }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {order.bom.items.map((item, idx) => {
                      const ok = item.available >= item.required;
                      return (
                        <tr key={idx} style={{ borderBottom: idx < order.bom.items.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                          <td style={{ padding: '0.6rem 0.75rem', color: '#E5E2E1', fontWeight: 600 }}>{item.name}</td>
                          <td style={{ padding: '0.6rem 0.75rem', textAlign: 'center', color: '#E5E2E1', fontFamily: 'monospace' }}>{item.required}</td>
                          <td style={{ padding: '0.6rem 0.75rem', textAlign: 'center', color: ok ? '#22c55e' : '#ef4444', fontFamily: 'monospace', fontWeight: 700 }}>{item.available}</td>
                          <td style={{ padding: '0.6rem 0.75rem', textAlign: 'center' }}>
                            <span style={{ fontSize: '0.65rem', fontWeight: 700, padding: '0.15rem 0.5rem', borderRadius: '4px', background: ok ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)', color: ok ? '#22c55e' : '#ef4444' }}>
                              {ok ? 'OK' : 'SHORT'}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {(!order.bom.items || order.bom.items.length === 0) && (
            <div style={{ textAlign: 'center', padding: '1.5rem', color: '#9ca3af', fontSize: '0.8rem' }}>
              No BOM items to display
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '1.25rem 1.5rem', borderTop: '1px solid rgba(255,255,255,0.08)', background: 'rgba(0,0,0,0.2)' }}>
          <button onClick={onClose} style={{ padding: '0.625rem 1.25rem', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#E5E2E1', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer' }}>Close</button>
        </div>
      </div>
    </div>
  );
}
