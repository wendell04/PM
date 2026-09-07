'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';

const AddressBook = dynamic(() => import('@/components/profile/AddressBook'), { ssr: false });

/**
 * Pick a delivery address, and add one without leaving the page.
 *
 * The two screens that ask for an address had grown apart. The custom-order page had the better
 * card - a real radio, a Default badge, the shop's gold - but sent people to /shop/profile to add
 * one, and coming back meant reloading, which threw away every file they had just attached. The
 * quote checkout had the better behaviour - an AddressBook in a modal, refetch on save, nothing
 * lost - behind a blue link that belongs to no palette in this app.
 *
 * This is the card from one and the modal from the other, in one place, so they cannot drift again.
 */
export function formatAddress(addr) {
  return [
    addr.house_number && addr.street ? `${addr.house_number} ${addr.street}` : (addr.street || addr.house_number),
    addr.subdivision,
    addr.barangay ? `Brgy. ${addr.barangay}` : '',
    addr.city,
    addr.province,
    addr.zip,
  ].filter(Boolean).join(', ');
}

export default function AddressPicker({
  addresses = [],
  loading = false,
  selectedId,
  onSelect,
  onSaved,
  // The quote checkout needs the courier pin; the custom-order page does not care yet.
  requirePin = false,
}) {
  const [editing, setEditing] = useState(null);   // null = closed, {} = new, addr = edit
  const selected = addresses.find(a => a.id === selectedId) ?? null;

  const open  = (addr) => setEditing(addr ?? {});
  const close = () => setEditing(null);

  return (
    <>
      <h2 style={{ fontSize: '.74rem', fontWeight: 800, letterSpacing: '.03em', textTransform: 'uppercase', color: 'var(--gray)', marginBottom: '.85rem' }}>
        Delivery address
      </h2>

      {loading ? (
        <p style={{ color: 'var(--gray)', fontSize: '.85rem', margin: 0 }}>Loading addresses...</p>
      ) : addresses.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '1.25rem 0' }}>
          <p style={{ color: 'var(--gray)', fontSize: '.85rem', marginBottom: '.75rem' }}>No saved addresses yet.</p>
          <button type="button" onClick={() => open(null)}
            style={{ background: 'none', border: 'none', color: 'var(--gold)', fontWeight: 700, fontSize: '.85rem', cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>
            + Add an address
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '.5rem' }}>
          {addresses.map(addr => {
            const active  = addr.id === selectedId;
            const noPin   = requirePin && (!addr.lat || !addr.lng);
            return (
              <div key={addr.id} onClick={() => onSelect?.(addr.id)}
                style={{ padding: '.875rem 1rem', borderRadius: 10, cursor: 'pointer', display: 'flex', gap: '.75rem', alignItems: 'flex-start', transition: 'all .12s',
                  border: `1px solid ${active ? 'var(--gold)' : 'var(--border)'}`,
                  background: active ? 'rgba(212,168,67,0.06)' : 'transparent' }}>
                <div style={{ width: 16, height: 16, borderRadius: '50%', flexShrink: 0, marginTop: 2, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  border: `2px solid ${active ? 'var(--gold)' : 'var(--gray)'}` }}>
                  {active && <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--gold)' }} />}
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <p style={{ fontWeight: 700, fontSize: '.85rem', margin: '0 0 2px' }}>
                    {addr.label || 'Home'}
                    {addr.is_default && (
                      <span style={{ marginLeft: 6, fontSize: '.65rem', background: 'rgba(212,168,67,0.15)', color: 'var(--gold)', padding: '1px 6px', borderRadius: 999, fontWeight: 700 }}>
                        Default
                      </span>
                    )}
                  </p>
                  <p style={{ fontSize: '.8rem', color: 'var(--gray)', margin: 0 }}>{formatAddress(addr)}</p>
                  {addr.phone && <p style={{ fontSize: '.78rem', color: 'var(--gray)', margin: '2px 0 0' }}>{addr.phone}</p>}
                  {noPin && (
                    <button type="button"
                      onClick={(e) => { e.stopPropagation(); open(addr); }}
                      style={{ background: 'none', border: 'none', padding: 0, marginTop: 3, fontSize: '.72rem', fontWeight: 700, color: '#b45309', cursor: 'pointer', fontFamily: 'inherit' }}>
                      No map pin yet - pin it
                    </button>
                  )}
                </div>
                <button type="button"
                  onClick={(e) => { e.stopPropagation(); open(addr); }}
                  style={{ background: 'none', border: 'none', padding: '2px 0 0', fontSize: '.75rem', fontWeight: 700, color: 'var(--gold)', cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>
                  Edit
                </button>
              </div>
            );
          })}

          <button type="button" onClick={() => open(null)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: '.25rem', background: 'none', border: 'none', padding: 0, fontSize: '.8rem', color: 'var(--gold)', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Add address
          </button>
        </div>
      )}

      {requirePin && selected && (!selected.lat || !selected.lng) && (
        <p style={{ color: '#b45309', fontSize: '.78rem', margin: '8px 0 0' }}>
          This address has no map pin. The seller needs it to book your courier.
        </p>
      )}

      {editing && (
        // No backdrop-close: this holds a form, and a stray click would wipe it.
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 3000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '1rem', overflowY: 'auto' }}>
          <div style={{ background: 'var(--dark2)', border: '1px solid var(--border)', borderRadius: 16, padding: '1.5rem', width: '100%', maxWidth: 580, margin: '2rem 0' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
              <h2 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--white)', fontWeight: 700 }}>
                {editing.id ? 'Edit address' : 'Add address'}
              </h2>
              <button type="button" onClick={close}
                style={{ background: 'none', border: 'none', color: 'var(--gray)', cursor: 'pointer', padding: '.25rem', display: 'flex' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            {/* onSaved refetches in the parent - the page never reloads, so nothing already typed
                or attached is lost. That was the whole reason the profile link had to go. */}
            <AddressBook
              initialEditAddress={editing.id ? editing : null}
              onSaved={(saved) => { close(); onSaved?.(saved); }}
            />
          </div>
        </div>
      )}
    </>
  );
}
