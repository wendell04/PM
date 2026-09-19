'use client';

/**
 * TO BUY - what has to be purchased for work already committed to.
 *
 * A shortage is only worth showing when someone is already waiting on it, so this reads
 * from paid/part-paid orders that are not finished yet. It exists because the failure it
 * prevents is silent: the order is paid, production is ready, and nobody noticed the blank
 * shirts were never ordered.
 *
 * Grouped by supplier so one message can be sent per supplier instead of hunting item by
 * item. Uses the inventory-v2 shared kit - nothing new to learn.
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { S, ICONS, SearchBar, SummaryCard } from '../inventory-v2/shared';
import { updateMat } from '../inventory-v2/api';
import { useIsPhone, KpiStrip, PhoneRow , pesoShort } from '@/components/dashboard/phone';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';

const peso = (n) => `₱${(Number(n) || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const num  = (n) => Number(n) % 1 === 0 ? String(Number(n)) : String(Math.round(Number(n) * 100) / 100);

export default function ToBuyPage() {
  const { token } = useAuth();
  const [rows, setRows]       = useState([]);
  const [totals, setTotals]   = useState({ totalItems: 0, estimatedCost: 0 });
  // A finished good bought in and resold has no BOM, so it never produced a material line and
  // this page said nothing about it. It is a different question - buy the thing, not what it is
  // made of - so it gets its own tab rather than being mixed into the supplier groups.
  const [productRows, setProductRows] = useState([]);
  // Quotes a customer tried to pay while stock was short. Kept out of the totals - nothing was paid,
  // so it is not committed work - but listed first, because a customer who tried to pay is the
  // warmest sale on the page.
  const [waitingQuotes, setWaitingQuotes] = useState([]);
  const [quoteBusy, setQuoteBusy] = useState('');
  const [quoteNote, setQuoteNote] = useState({});
  // In the URL like every other tab in this dashboard, so a link to "no material plan" lands
  // there, the back button steps between them, and a reload does not throw the choice away.
  const router       = useRouter();
  const pathname     = usePathname();
  const searchParams = useSearchParams();
  const urlTab       = searchParams.get('tab');
  const [tab, setTab] = useState(urlTab === 'products' ? 'products' : 'materials');

  useEffect(() => {
    setTab(searchParams.get('tab') === 'products' ? 'products' : 'materials');
  }, [searchParams]);

  const selectTab = (id) => {
    setTab(id);
    router.replace(id === 'materials' ? pathname : pathname + '?tab=' + id, { scroll: false });
  };
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [search, setSearch]   = useState('');
  const [reason, setReason]   = useState('all');   // all | orders | minimum
  // Set the minimum where the shortage is seen. inventoryId -> the value being typed.
  const [minEdit, setMinEdit] = useState({});
  const [minSaving, setMinSaving] = useState(null);
  const closeMin = (id) => setMinEdit(prev => { const n = { ...prev }; delete n[id]; return n; });
  const saveMin = async (r) => {
    const v = Number(minEdit[r.inventoryId]);
    if (!Number.isFinite(v) || v < 0) return;
    setMinSaving(r.inventoryId);
    try {
      await updateMat(token, r.inventoryId, { minStockLevel: Math.round(v) });
      closeMin(r.inventoryId);
      await load();
    } catch (e) { setError(e.message); }
    finally { setMinSaving(null); }
  };
  // "Buy 30" is two decisions at once; say which is which.
  const breakdown = (r) => {
    const forOrders = Math.max(0, Number(r.needed) - Number(r.onHand));
    const toMin = Math.max(0, Number(r.shortfall) - forOrders);
    if (forOrders > 0 && toMin > 0) return `${num(forOrders)} for orders + ${num(toMin)} to reach minimum`;
    if (forOrders > 0) return `${num(forOrders)} short for orders`;
    return `${num(toMin)} to reach minimum ${num(r.minimum)}`;
  };
  const MinEditor = ({ r, compact }) => (
    minEdit[r.inventoryId] === undefined ? (
      <button type="button" onClick={() => setMinEdit(prev => ({ ...prev, [r.inventoryId]: String(r.minimum || '') }))}
        style={{ background: 'none', border: 'none', padding: 0, color: 'var(--gold)', fontSize: compact ? 12 : 11, fontWeight: 600, cursor: 'pointer', minHeight: compact ? 36 : undefined }}>
        {r.minimum > 0 ? 'Change minimum' : 'Set minimum'}
      </button>
    ) : (
      <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
        <input type="number" min="0" value={minEdit[r.inventoryId]} onChange={e => setMinEdit(prev => ({ ...prev, [r.inventoryId]: e.target.value }))}
          onKeyDown={e => { if (e.key === 'Enter') saveMin(r); if (e.key === 'Escape') closeMin(r.inventoryId); }}
          style={{ ...S.input, width: 84, minHeight: 36, padding: '4px 8px', fontSize: 16 }} aria-label="Minimum stock" autoFocus />
        <button type="button" onClick={() => saveMin(r)} disabled={minSaving === r.inventoryId} style={{ ...S.btnSm, minHeight: 36 }}>{minSaving === r.inventoryId ? 'Saving' : 'Save'}</button>
        <button type="button" onClick={() => closeMin(r.inventoryId)} style={{ ...S.btnSmGhost, minHeight: 36 }}>Cancel</button>
      </span>
    )
  );
  const isPhone = useIsPhone();

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true); setError('');
    try {
      const res = await fetch(`${API_URL}/api/admin/inventory/to-buy`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to load');
      const d = await res.json();
      const data = d?.data ?? d;
      setRows(Array.isArray(data?.items) ? data.items : []);
      setTotals({ totalItems: data?.totalItems ?? 0, estimatedCost: data?.estimatedCost ?? 0 });
      setProductRows(Array.isArray(data?.products) ? data.products : []);
      setWaitingQuotes(Array.isArray(data?.waitingQuotes) ? data.waitingQuotes : []);
    } catch {
      setError('Could not load purchase requirements.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(r =>
      (reason === 'all' || (r.reasons ?? ['orders']).includes(reason)) &&
      (!q || (r.name || '').toLowerCase().includes(q) ||
        (r.sku || '').toLowerCase().includes(q) ||
        (r.supplierName || '').toLowerCase().includes(q)));
  }, [rows, search, reason]);
  const countFor = (why) => rows.filter(r => (r.reasons ?? ['orders']).includes(why)).length;

  // One group per supplier - the unit of work is "message this supplier", not "buy this item".
  const groups = useMemo(() => {
    const by = {};
    visible.forEach(r => {
      const key = r.supplierName || 'No supplier set';
      (by[key] ??= { supplier: key, leadTimeDays: 0, items: [], cost: 0 });
      by[key].items.push(r);
      by[key].cost += Number(r.estimatedCost) || 0;
      by[key].leadTimeDays = Math.max(by[key].leadTimeDays, Number(r.leadTimeDays) || 0);
    });
    return Object.values(by).sort((a, b) => b.cost - a.cost);
  }, [visible]);

  const quoteAction = async (q, action) => {
    setQuoteBusy(q.id + action);
    setQuoteNote(n => ({ ...n, [q.id]: null }));
    try {
      const res = await fetch(`${API_URL}/api/admin/quotations/${q.id}/${action}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setQuoteNote(n => ({ ...n, [q.id]: { error: true, text: d?.message || 'That did not work. Try again.' } }));
        return;
      }
      setQuoteNote(n => ({ ...n, [q.id]: { error: false, text: d?.message || 'Done.' } }));
      await load();
    } finally {
      setQuoteBusy('');
    }
  };

  const daysLeft = (iso) => {
    if (!iso) return null;
    const d = Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000);
    return d <= 0 ? 'expires today' : `expires in ${d} day${d === 1 ? '' : 's'}`;
  };

  const copyList = (g) => {
    const text = [
      `Order request - ${g.supplier}`,
      ...g.items.map(i => `- ${i.name}${i.sku ? ` (${i.sku})` : ''}: ${num(i.shortfall)} ${i.uom || ''}`.trim()),
    ].join('\n');
    navigator.clipboard?.writeText(text);
  };

  return (
    <div style={{ ...S.page, padding: '24px' }}>
      {isPhone ? (
        <KpiStrip items={[
          { key: 'n', label: 'To buy',    value: totals.totalItems },
          { key: 'c', label: 'Est. cost', value: pesoShort(totals.estimatedCost), title: peso(totals.estimatedCost) },
          { key: 's', label: 'Suppliers', value: groups.length },
        ]} />
      ) : (
        <div style={{ ...S.row, marginBottom: '18px' }}>
          <SummaryCard label="Materials to buy" value={totals.totalItems} accent />
          <SummaryCard label="Estimated cost" value={peso(totals.estimatedCost)} />
          <SummaryCard label="Suppliers to contact" value={groups.length} />
        </div>
      )}

      {waitingQuotes.length > 0 && (
        <div style={{ ...S.card, padding: 0, overflow: 'hidden', marginBottom: '18px', borderColor: 'rgba(224,168,82,0.45)' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontSize: '14px', fontWeight: 700 }}>Waiting on stock ({waitingQuotes.length})</div>
            <div style={{ fontSize: '11px', color: 'var(--gray)', marginTop: '2px' }}>
              These customers tried to pay a quote, but stock ran short after it was sent. Not counted in the
              totals above - nothing is paid yet. Allow pre-order for the quote, confirm the stock is back,
              or send a new quote.
            </div>
          </div>
          {waitingQuotes.map(q => {
            const note = quoteNote[q.id];
            return (
              <div key={q.id} style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap', alignItems: 'baseline' }}>
                  <div style={{ fontSize: '13px', fontWeight: 700 }}>
                    Quote #{q.ref} <span style={{ color: 'var(--gray)', fontWeight: 500 }}>· {q.customerName || 'Customer'}</span>
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--gray)' }}>
                    {peso(q.total)}{daysLeft(q.expiresAt) ? ` · ${daysLeft(q.expiresAt)}` : ''}
                  </div>
                </div>

                {q.stillShort ? (
                  <div style={{ marginTop: '6px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    {(q.shortages || []).map(x => (
                      <div key={x.inventoryId} style={{ fontSize: '12px', color: 'var(--gray)' }}>
                        <span style={{ color: 'var(--white)', fontWeight: 600 }}>{x.name}</span>
                        {` - needs ${num(x.needed)}, ${num(x.available)} free, `}
                        <span style={{ color: '#e0a852', fontWeight: 700 }}>short {num(x.short)} {x.uom || ''}</span>
                        {x.leadTimeDays > 0 && ` · about ${x.leadTimeDays}d to restock`}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ marginTop: '6px', fontSize: '12px', color: '#4ade80', fontWeight: 600 }}>
                    Stock is back - tell the customer they can pay.
                  </div>
                )}

                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '10px' }}>
                  {q.stillShort && (
                    <button type="button" disabled={!!quoteBusy} onClick={() => quoteAction(q, 'allow-preorder')}
                      style={{ ...S.btnSm, background: 'var(--gold)', color: '#111', border: '1px solid var(--gold)', fontWeight: 700 }}
                      title="Only this quote - the product stays as it is on the storefront">
                      {quoteBusy === q.id + 'allow-preorder' ? 'Allowing…' : 'Allow pre-order for this quote'}
                    </button>
                  )}
                  <button type="button" disabled={!!quoteBusy} onClick={() => quoteAction(q, 'restocked')} style={{ ...S.btnSm }}>
                    {quoteBusy === q.id + 'restocked' ? 'Checking…' : 'Restocked - tell the customer'}
                  </button>
                  <a href="/dashboard/business/chat" style={{ ...S.btnSm, textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}
                    title="Send a new quote from the customer's conversation">
                    Send a new quote
                  </a>
                </div>
                {note && (
                  <div style={{ marginTop: '8px', fontSize: '12px', color: note.error ? '#e05252' : '#4ade80' }}>{note.text}</div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {tab === 'materials' && rows.length > 0 && (
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '10px', alignItems: 'center' }}>
          {[['all', `All (${rows.length})`], ['orders', `Short for orders (${countFor('orders')})`], ['minimum', `Below minimum (${countFor('minimum')})`]].map(([id, label]) => (
            <button key={id} type="button" onClick={() => setReason(id)}
              style={{ minHeight: 34, padding: '0 12px', borderRadius: 999, fontSize: 12.5, fontWeight: reason === id ? 700 : 500, cursor: 'pointer',
                background: reason === id ? 'var(--gold)' : 'var(--dark2)', color: reason === id ? '#1a1a1a' : 'var(--white)', border: reason === id ? '1px solid var(--gold)' : '1px solid var(--border)' }}>
              {label}
            </button>
          ))}
          <span style={{ fontSize: 11.5, color: 'var(--gray)', marginLeft: 'auto' }}>Buy = needed by orders + minimum - on hand</span>
        </div>
      )}

      <div style={{ display: 'flex', gap: '6px', marginBottom: '14px' }}>
        {[['materials', `By material (${totals.totalItems})`], ['products', `No material plan (${productRows.length})`]].map(([id, label]) => (
          <button key={id} type="button" onClick={() => selectTab(id)}
            style={{ ...S.btnSm, background: tab === id ? 'var(--gold)' : 'transparent',
              color: tab === id ? '#111' : 'var(--gray)', fontWeight: tab === id ? 700 : 600,
              border: `1px solid ${tab === id ? 'var(--gold)' : 'var(--border)'}` }}>
            {label}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px', flexWrap: 'wrap' }}>
        {tab === 'materials' && (
          <SearchBar value={search} onChange={setSearch} placeholder="Search material or supplier…" style={{ maxWidth: '340px', flex: '1 1 240px' }} />
        )}
        <button type="button" onClick={load} style={{ ...S.btnGhost, marginLeft: 'auto' }}>Refresh</button>
      </div>

      {error && (
        <div style={{ ...S.card, borderColor: '#c62828', color: '#e05252', fontSize: '13px' }}>
          {error} <button type="button" onClick={load} style={{ background: 'none', border: 'none', color: 'var(--gold)', cursor: 'pointer', fontWeight: 700 }}>Retry</button>
        </div>
      )}

      {!error && loading && (
        <div style={{ ...S.card, textAlign: 'center', color: 'var(--gray)', fontSize: '13px' }}>Loading…</div>
      )}

      {/* An empty list is the good outcome, so it should read like one. */}
      {!error && !loading && tab === 'products' && (
        productRows.length === 0 ? (
          <div style={{ ...S.card, textAlign: 'center', padding: '36px 20px' }}>
            <div style={{ fontSize: '15px', fontWeight: 700, marginBottom: '4px' }}>Every job has a material plan</div>
            <div style={{ fontSize: '13px', color: 'var(--gray)' }}>
              Nothing committed is being made from materials we are not tracking.
            </div>
          </div>
        ) : (
          <div style={{ ...S.card, padding: 0, overflow: 'hidden', marginBottom: '14px' }}>
            <div style={{ ...S.rowBetween, padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
              <div>
                <div style={{ fontSize: '14px', fontWeight: 700 }}>Jobs with no material plan</div>
                <div style={{ fontSize: '11px', color: 'var(--gray)', marginTop: '2px' }}>
                  Committed work whose product has no BOM - usually a quoted service. Attach its
                  materials on the quotation and it moves to By material.
                </div>
              </div>
              <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--gold)' }}>
                {peso(productRows.reduce((t, r) => t + (Number(r.estimatedCost) || 0), 0))}
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 90px 90px 90px 110px', gap: '8px',
              padding: '8px 16px', fontSize: '10px', fontWeight: 700, letterSpacing: '.05em',
              textTransform: 'uppercase', color: 'var(--gray)', borderBottom: '1px solid var(--border)' }}>
              <span>Product</span><span>Ordered</span><span>On hand</span><span>To buy</span><span>Est. cost</span>
            </div>
            {productRows.map(r => (
              <div key={r.productId + (r.variant || '')} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 90px 90px 90px 110px',
                gap: '8px', padding: '10px 16px', fontSize: '13px', borderBottom: '1px solid var(--border)', alignItems: 'center' }}>
                <span style={{ minWidth: 0 }}>
                  <span style={{ fontWeight: 600 }}>{r.name}</span>
                  {r.variant && <span style={{ color: 'var(--gray)' }}> - {r.variant}</span>}
                  <span style={{ display: 'block', fontSize: '11px', color: 'var(--gray)' }}>
                    {r.hasInventory ? r.supplierName : 'No inventory record - stock is not tracked for this one'}
                    {r.orders?.length ? ` · ${r.orders.join(', ')}` : ''}
                  </span>
                </span>
                <span>{r.needed}</span>
                <span>{r.onHand}</span>
                <span style={{ fontWeight: 700, color: 'var(--gold)' }}>{r.shortfall}</span>
                <span>{peso(r.estimatedCost)}</span>
              </div>
            ))}
          </div>
        )
      )}

      {!error && !loading && tab === 'materials' && groups.length === 0 && (
        <div style={{ ...S.card, textAlign: 'center', padding: '36px 20px' }}>
          <div style={{ fontSize: '15px', fontWeight: 700, marginBottom: '4px' }}>Nothing to buy</div>
          <div style={{ fontSize: '13px', color: 'var(--gray)' }}>
            Every committed order is covered by stock on hand.
          </div>
        </div>
      )}

      {!error && !loading && tab === 'materials' && groups.map(g => (
        <div key={g.supplier} style={{ ...S.card, marginBottom: '14px', padding: 0, overflow: 'hidden' }}>
          <div style={{ ...S.rowBetween, padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
            <div>
              <div style={{ fontSize: '14px', fontWeight: 700 }}>{g.supplier}</div>
              <div style={{ fontSize: '11px', color: 'var(--gray)', marginTop: '2px' }}>
                {g.items.length} item{g.items.length === 1 ? '' : 's'}
                {g.leadTimeDays > 0 && ` · ${g.leadTimeDays}d lead time`}
              </div>
            </div>
            <div style={{ ...S.row, gap: '10px', ...(isPhone ? { width: '100%', justifyContent: 'space-between' } : {}) }}>
              <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--gold)' }}>{peso(g.cost)}</span>
              <button type="button" onClick={() => copyList(g)} style={{ ...S.btnSm, ...(isPhone ? { minHeight: 40 } : {}) }} title="Copy this list to paste to the supplier">Copy</button>
              <a href="/dashboard/business/inventory-v2?tab=stockin"
                style={{ ...S.btnSm, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', ...(isPhone ? { minHeight: 40 } : {}) }}
                title="Record the delivery once it arrives">Stock In</a>
            </div>
          </div>

          {isPhone ? g.items.map((r, i) => (
            <div key={r.inventoryId}>
            <PhoneRow first={i === 0} mono={false}
              title={r.name}
              chip={<span style={{ fontSize: 12, fontWeight: 700, color: '#e0a852', whiteSpace: 'nowrap' }}>Buy {num(r.shortfall)} {r.uom}</span>}
              meta={`Buy ${num(r.shortfall)} = ${breakdown(r)}`}
              sub={[`have ${num(r.onHand)}${r.minimum > 0 ? ` · min ${num(r.minimum)}` : ''} ${r.uom} · ${peso(r.estimatedCost)}`, r.for?.length > 0 ? `for ${r.for.map(f => `${f.pieces} × ${f.product}`).join(', ')}` : null, r.orders?.length > 0 ? r.orders.join(', ') : null, r.isOnDemand ? 'buy per order' : null, !Number(r.unitCost) ? 'no cost set' : null].filter(Boolean).join(' · ')} />
            <div style={{ padding: '0 14px 10px' }}><MinEditor r={r} compact /></div>
            </div>
          )) : (<>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 90px 90px 90px 90px 110px', gap: '8px',
            padding: '8px 16px', fontSize: '10px', fontWeight: 700, letterSpacing: '.05em',
            textTransform: 'uppercase', color: 'var(--gray)', borderBottom: '1px solid var(--border)' }}>
            <span>Material</span>
            <span style={{ textAlign: 'right' }}>For orders</span>
            <span style={{ textAlign: 'right' }}>On hand</span>
            <span style={{ textAlign: 'right' }}>Minimum</span>
            <span style={{ textAlign: 'right' }}>Buy</span>
            <span style={{ textAlign: 'right' }}>Est. cost</span>
          </div>

          {g.items.map(r => (
            <div key={r.inventoryId} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 90px 90px 90px 90px 110px',
              gap: '8px', padding: '10px 16px', borderBottom: '1px solid var(--border)', alignItems: 'center' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '13px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 6 }}>
                  {r.name}
                  {(r.reasons ?? ['orders']).map(w => (
                    <span key={w} style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '.3px', textTransform: 'uppercase', padding: '2px 6px', borderRadius: 4,
                      background: w === 'orders' ? 'rgba(224,168,82,0.16)' : 'rgba(59,130,246,0.14)', color: w === 'orders' ? '#b45309' : '#1d4ed8' }}>
                      {w === 'orders' ? 'short for orders' : 'below minimum'}
                    </span>
                  ))}
                </div>
                <div style={{ fontSize: '10.5px', color: 'var(--gray)', marginTop: '1px' }}>
                  {[r.sku, r.category, r.isOnDemand ? 'buy per order' : null].filter(Boolean).join(' · ')}
                  {r.orders?.length > 0 && ` · ${r.orders.join(', ')}`}
                </div>
                {r.for?.length > 0 && (
                  <div style={{ fontSize: '11px', color: 'var(--gray-light)', marginTop: '2px' }}>
                    For {r.for.map(f => `${f.pieces} × ${f.product}`).join(', ')}
                  </div>
                )}
                <div style={{ fontSize: '11px', color: '#b45309', marginTop: '2px' }}>Buy {num(r.shortfall)} = {breakdown(r)}</div>
                {minEdit[r.inventoryId] !== undefined && (
                  <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--gray)' }}>
                    Minimum for this material: <MinEditor r={r} />
                  </div>
                )}
                {!Number(r.unitCost) && (
                  <div style={{ fontSize: '10.5px', color: '#e0a852', marginTop: '1px' }}>
                    No cost set - the estimate below is understated.
                  </div>
                )}
              </div>
              <span style={{ fontSize: '12px', textAlign: 'right', color: 'var(--gray)' }}>{num(r.needed)} {r.uom}</span>
              <span style={{ fontSize: '12px', textAlign: 'right', color: 'var(--gray)' }}>{num(r.onHand)} {r.uom}</span>
              <span style={{ fontSize: '12px', textAlign: 'right', color: 'var(--gray)', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                <span>{r.minimum > 0 ? `${num(r.minimum)} ${r.uom}` : '-'}</span>
                {minEdit[r.inventoryId] === undefined && <MinEditor r={r} />}
              </span>
              <span style={{ fontSize: '13px', textAlign: 'right', fontWeight: 700, color: '#e0a852' }} title={breakdown(r)}>{num(r.shortfall)} {r.uom}</span>
              <span style={{ fontSize: '13px', textAlign: 'right', fontWeight: 700 }}>{peso(r.estimatedCost)}</span>
            </div>
          ))}
          </>)}
        </div>
      ))}
    </div>
  );
}
