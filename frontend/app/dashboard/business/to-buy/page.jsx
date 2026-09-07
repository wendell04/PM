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
import { useAuth } from '@/contexts/AuthContext';
import { S, ICONS, SearchBar, SummaryCard } from '../inventory-v2/shared';

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
  const [tab, setTab] = useState('materials');
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [search, setSearch]   = useState('');

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
    } catch {
      setError('Could not load purchase requirements.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(r =>
      (r.name || '').toLowerCase().includes(q) ||
      (r.sku || '').toLowerCase().includes(q) ||
      (r.supplierName || '').toLowerCase().includes(q));
  }, [rows, search]);

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

  const copyList = (g) => {
    const text = [
      `Order request - ${g.supplier}`,
      ...g.items.map(i => `- ${i.name}${i.sku ? ` (${i.sku})` : ''}: ${num(i.shortfall)} ${i.uom || ''}`.trim()),
    ].join('\n');
    navigator.clipboard?.writeText(text);
  };

  return (
    <div style={{ ...S.page, padding: '24px' }}>
      <div style={{ ...S.row, marginBottom: '18px' }}>
        <SummaryCard label="Materials to buy" value={totals.totalItems} accent />
        <SummaryCard label="Estimated cost" value={peso(totals.estimatedCost)} />
        <SummaryCard label="Suppliers to contact" value={groups.length} />
      </div>

      <div style={{ display: 'flex', gap: '6px', marginBottom: '14px' }}>
        {[['materials', `By material (${totals.totalItems})`], ['products', `By product (${productRows.length})`]].map(([id, label]) => (
          <button key={id} type="button" onClick={() => setTab(id)}
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
            <div style={{ fontSize: '15px', fontWeight: 700, marginBottom: '4px' }}>Nothing to restock</div>
            <div style={{ fontSize: '13px', color: 'var(--gray)' }}>
              Every ready-made item on an open order is covered by stock on hand.
            </div>
          </div>
        ) : (
          <div style={{ ...S.card, padding: 0, overflow: 'hidden', marginBottom: '14px' }}>
            <div style={{ ...S.rowBetween, padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ fontSize: '14px', fontWeight: 700 }}>Ready-made items to restock</div>
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
            <div style={{ ...S.row, gap: '10px' }}>
              <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--gold)' }}>{peso(g.cost)}</span>
              <button type="button" onClick={() => copyList(g)} style={{ ...S.btnSm }} title="Copy this list to paste to the supplier">Copy</button>
              <a href="/dashboard/business/inventory-v2?tab=stockin"
                style={{ ...S.btnSm, textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}
                title="Record the delivery once it arrives">Stock In</a>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 90px 90px 90px 110px', gap: '8px',
            padding: '8px 16px', fontSize: '10px', fontWeight: 700, letterSpacing: '.05em',
            textTransform: 'uppercase', color: 'var(--gray)', borderBottom: '1px solid var(--border)' }}>
            <span>Material</span>
            <span style={{ textAlign: 'right' }}>Needed</span>
            <span style={{ textAlign: 'right' }}>On hand</span>
            <span style={{ textAlign: 'right' }}>Buy</span>
            <span style={{ textAlign: 'right' }}>Est. cost</span>
          </div>

          {g.items.map(r => (
            <div key={r.inventoryId} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 90px 90px 90px 110px',
              gap: '8px', padding: '10px 16px', borderBottom: '1px solid var(--border)', alignItems: 'center' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '13px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {r.name}
                </div>
                <div style={{ fontSize: '10.5px', color: 'var(--gray)', marginTop: '1px' }}>
                  {[r.sku, r.category, r.isOnDemand ? 'buy per order' : null].filter(Boolean).join(' · ')}
                  {r.orders?.length > 0 && ` · for ${r.orders.join(', ')}`}
                </div>
                {!Number(r.unitCost) && (
                  <div style={{ fontSize: '10.5px', color: '#e0a852', marginTop: '1px' }}>
                    No cost set - the estimate below is understated.
                  </div>
                )}
              </div>
              <span style={{ fontSize: '12px', textAlign: 'right', color: 'var(--gray)' }}>{num(r.needed)} {r.uom}</span>
              <span style={{ fontSize: '12px', textAlign: 'right', color: 'var(--gray)' }}>{num(r.onHand)} {r.uom}</span>
              <span style={{ fontSize: '13px', textAlign: 'right', fontWeight: 700, color: '#e0a852' }}>{num(r.shortfall)} {r.uom}</span>
              <span style={{ fontSize: '13px', textAlign: 'right', fontWeight: 700 }}>{peso(r.estimatedCost)}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
