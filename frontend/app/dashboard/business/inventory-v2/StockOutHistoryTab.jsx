'use client';
import { useMemo, useState } from 'react';
import { S, SearchBar, EmptyState, SummaryCard, PaginationBar, usePagination, CustomSelect } from './shared';

const REASON_LABEL = {
  sale_reserved: 'Sale',
  production:    'Production',
  damage:        'Damage',
  writeoff:      'Write-Off',
  scrap:         'Scrap',
  adjustment:    'Adjustment',
  lost:          'Lost',
};

function ReasonBadge({ reason }) {
  const colors = {
    sale_reserved: { bg:'#dcfce7', color:'#166534', border:'#bbf7d0' },
    production:    { bg:'#ede9fe', color:'#5b21b6', border:'#ddd6fe' },
    damage:        { bg:'#fee2e2', color:'#991b1b', border:'#fecaca' },
    writeoff:      { bg:'#fee2e2', color:'#991b1b', border:'#fecaca' },
    scrap:         { bg:'#ffedd5', color:'#9a3412', border:'#fed7aa' },
    adjustment:    { bg:'var(--dark2)', color:'var(--gray-light)', border:'var(--border)' },
    lost:          { bg:'var(--dark2)', color:'var(--gray-light)', border:'var(--border)' },
  };
  const c = colors[reason] ?? colors.adjustment;
  return (
    <span style={{ ...S.badge, background:c.bg, color:c.color, border:`1px solid ${c.border}`, fontSize:'10px' }}>
      {REASON_LABEL[reason] ?? reason}
    </span>
  );
}

function ChevronIcon({ open }) {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--gray)" strokeWidth="2.5"
      style={{ transform: open ? 'rotate(180deg)' : 'none', transition:'transform .2s', flexShrink:0 }}>
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

// ── By Order Tab ──────────────────────────────────────────────────────────────

function ByOrderTab({ stockOuts, materials }) {
  const [search,    setSearch]    = useState('');
  const [expanded,  setExpanded]  = useState(null);
  const [expandedProduct, setExpandedProduct] = useState({});

  const matMap = useMemo(() => {
    const m = {};
    (materials || []).forEach(mat => { m[mat.id] = mat; });
    return m;
  }, [materials]);

  const { orders, manual } = useMemo(() => {
    const orderMap = {};
    const manual   = [];

    (stockOuts || []).forEach(so => {
      if (so.orderId) {
        if (!orderMap[so.orderId]) {
          orderMap[so.orderId] = {
            orderId:      so.orderId,
            ref:          so.ref,
            date:         so.date,
            customerName: so.customerName || 'Unknown',
            products:     {},
            totalCost:    0,
          };
        }
        const ord = orderMap[so.orderId];
        ord.totalCost += so.totalCost;
        const pkey = so.productId || '__noProduct';
        if (!ord.products[pkey]) {
          ord.products[pkey] = {
            productId:   so.productId,
            productName: so.productName || so.matName || '—',
            materials:   [],
          };
        }
        ord.products[pkey].materials.push(so);
      } else {
        manual.push(so);
      }
    });

    const orders = Object.values(orderMap)
      .sort((a, b) => new Date(b.date) - new Date(a.date));
    return { orders, manual };
  }, [stockOuts]);

  const q = search.toLowerCase();
  const filteredOrders = orders.filter(o =>
    !q ||
    o.customerName.toLowerCase().includes(q) ||
    o.orderId.toLowerCase().includes(q) ||
    Object.values(o.products).some(p => p.productName.toLowerCase().includes(q))
  );

  const { slice, page, perPage, total, setPage, setPerPage } = usePagination(filteredOrders);

  const toggleProduct = (orderId, pkey) => {
    const key = `${orderId}__${pkey}`;
    setExpandedProduct(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const totalSaleValue = orders.reduce((s, o) => s + o.totalCost, 0);
  const manualCount    = manual.length;

  return (
    <div style={S.col}>
      <div style={{ display:'flex', gap:'12px', flexWrap:'wrap' }}>
        <SummaryCard label="Orders with Deductions" value={orders.length} accent />
        <SummaryCard label="Manual / Adjustments"   value={manualCount} color="#b45309" />
        <SummaryCard label="Total Cost of Goods"
          value={`₱${totalSaleValue.toLocaleString('en-PH', { minimumFractionDigits:2, maximumFractionDigits:2 })}`}
          color="#166534" />
      </div>

      <div style={{ ...S.card, ...S.rowBetween }}>
        <SearchBar value={search} onChange={setSearch} placeholder="Search order, customer, product…" style={{ width:'280px' }} />
        <span style={{ fontSize:'12px', color:'var(--gray)' }}>{total} order{total !== 1 ? 's' : ''}</span>
      </div>

      <div style={{ ...S.card, padding:0, overflow:'hidden' }}>
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr>
                {['Date','Order Ref','Customer','Items','Cost of Goods',''].map((h, i) => (
                  <th key={i} style={{ ...S.th, textAlign: i >= 3 ? 'center' : 'left', ...(i === 5 ? { width:40 } : {}) }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {total === 0 ? (
                <tr><td colSpan={6}>
                  <EmptyState message="No order deductions yet" sub="Stock movements from orders will appear here." />
                </td></tr>
              ) : slice.map(ord => {
                const isOpen    = expanded === ord.orderId;
                const prodList  = Object.entries(ord.products);
                const itemCount = prodList.length;
                return (
                  <>
                    <tr key={ord.orderId}
                      style={{ ...S.tr, cursor:'pointer' }}
                      onClick={() => setExpanded(isOpen ? null : ord.orderId)}
                      onMouseEnter={e => e.currentTarget.style.background='var(--dark2)'}
                      onMouseLeave={e => e.currentTarget.style.background=''}
                    >
                      <td style={{ ...S.td, color:'var(--gray)', fontSize:'12px', whiteSpace:'nowrap' }}>{ord.date}</td>
                      <td style={{ ...S.td, fontWeight:600, fontFamily:'monospace', fontSize:'12px' }}>{ord.ref}</td>
                      <td style={{ ...S.td }}>{ord.customerName}</td>
                      <td style={{ ...S.td, textAlign:'center', color:'var(--gray)', fontSize:'12px' }}>{itemCount} product{itemCount !== 1 ? 's' : ''}</td>
                      <td style={{ ...S.td, textAlign:'center', fontWeight:600, color:'#166534', fontFamily:'monospace', fontSize:'12px' }}>
                        ₱{ord.totalCost.toLocaleString('en-PH', { minimumFractionDigits:2 })}
                      </td>
                      <td style={{ ...S.td, textAlign:'center' }}><ChevronIcon open={isOpen} /></td>
                    </tr>
                    {isOpen && (
                      <tr key={`${ord.orderId}_detail`}>
                        <td colSpan={6} style={{ padding:0, background:'var(--dark2)', borderBottom:'1px solid var(--border)' }}>
                          <div style={{ padding:'12px 20px', display:'flex', flexDirection:'column', gap:'8px' }}>
                            {prodList.map(([pkey, prod]) => {
                              const pExpanded = expandedProduct[`${ord.orderId}__${pkey}`];
                              const hasMaterials = prod.materials.length > 0;
                              const isFinishedGood = prod.materials.length === 1 && prod.materials[0].productName === prod.productName;
                              return (
                                <div key={pkey} style={{ background:'var(--dark)', border:'1px solid var(--border)', borderRadius:'8px', overflow:'hidden' }}>
                                  <div
                                    style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 14px', cursor: hasMaterials && !isFinishedGood ? 'pointer' : 'default' }}
                                    onClick={() => !isFinishedGood && toggleProduct(ord.orderId, pkey)}
                                  >
                                    <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
                                      {!isFinishedGood && <ChevronIcon open={pExpanded} />}
                                      <span style={{ fontWeight:600, fontSize:'13px', color:'var(--white)' }}>{prod.productName}</span>
                                      {isFinishedGood && (
                                        <span style={{ ...S.badge, background:'#eef4ff', color:'#2c4a8c', border:'1px solid #bfcfee', fontSize:'10px' }}>finished goods</span>
                                      )}
                                    </div>
                                    <span style={{ fontSize:'12px', color:'var(--gray)' }}>
                                      {prod.materials.length} material{prod.materials.length !== 1 ? 's' : ''} consumed
                                    </span>
                                  </div>
                                  {(pExpanded || isFinishedGood) && (
                                    <table style={{ width:'100%', borderCollapse:'collapse', borderTop:'1px solid var(--border)' }}>
                                      <thead>
                                        <tr>
                                          {['Material','Qty Deducted','Remaining','Unit Cost','Total Cost','Type'].map(h => (
                                            <th key={h} style={{ fontSize:'10px', fontWeight:700, color:'var(--gray)', textTransform:'uppercase', letterSpacing:'.4px', padding:'6px 14px', textAlign:'left', background:'var(--dark2)' }}>{h}</th>
                                          ))}
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {prod.materials.map((so, mi) => {
                                          const mat = matMap[so.matId];
                                          return (
                                            <tr key={mi} style={{ borderTop:'1px solid var(--border)' }}>
                                              <td style={{ padding:'7px 14px', fontSize:'12px', color:'var(--gray-light)', fontWeight:500 }}>
                                                {so.matName || mat?.name || '—'}
                                              </td>
                                              <td style={{ padding:'7px 14px', fontSize:'12px', color:'#c62828', fontWeight:600 }}>
                                                -{so.qty} {mat?.unit ?? 'pcs'}
                                              </td>
                                              <td style={{ padding:'7px 14px', fontSize:'12px', color:'var(--gray)' }}>
                                                {so.remainingQty} {mat?.unit ?? 'pcs'}
                                              </td>
                                              <td style={{ padding:'7px 14px', fontSize:'12px', color:'var(--gray)', fontFamily:'monospace' }}>
                                                ₱{so.unitCost.toFixed(2)}
                                              </td>
                                              <td style={{ padding:'7px 14px', fontSize:'12px', fontWeight:600, color:'#166534', fontFamily:'monospace' }}>
                                                ₱{so.totalCost.toLocaleString('en-PH', { minimumFractionDigits:2 })}
                                              </td>
                                              <td style={{ padding:'7px 14px' }}>
                                                <ReasonBadge reason={so.reason} />
                                              </td>
                                            </tr>
                                          );
                                        })}
                                      </tbody>
                                    </table>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
        {total > 0 && (
          <div style={{ padding:'12px 16px', borderTop:'1px solid var(--border)' }}>
            <PaginationBar total={total} page={page} perPage={perPage} onPage={setPage} onPerPage={setPerPage} />
          </div>
        )}
      </div>

      {manualCount > 0 && (
        <div style={{ ...S.card, padding:0, overflow:'hidden' }}>
          <div style={{ ...S.th, padding:'12px 16px', fontSize:'12px', letterSpacing:'.5px' }}>
            Manual / Adjustments — {manualCount} record{manualCount !== 1 ? 's' : ''}
          </div>
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr>
                {['Date','Material','Qty','Unit Cost','Type','Remarks'].map((h, i) => (
                  <th key={i} style={{ ...S.th }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {manual.map((so, i) => {
                const mat = matMap[so.matId];
                return (
                  <tr key={i}
                    style={{ ...S.tr }}
                    onMouseEnter={e => e.currentTarget.style.background='var(--dark2)'}
                    onMouseLeave={e => e.currentTarget.style.background=''}
                  >
                    <td style={{ ...S.td, color:'var(--gray)', fontSize:'12px', whiteSpace:'nowrap' }}>{so.date}</td>
                    <td style={{ ...S.td, fontWeight:500 }}>{so.matName || mat?.name || '—'}</td>
                    <td style={{ ...S.td, color:'#c62828', fontWeight:600 }}>-{so.qty} {mat?.unit ?? 'pcs'}</td>
                    <td style={{ ...S.td, fontFamily:'monospace', fontSize:'12px' }}>₱{so.unitCost.toFixed(2)}</td>
                    <td style={{ ...S.td }}><ReasonBadge reason={so.reason} /></td>
                    <td style={{ ...S.td, color:'var(--gray)', fontSize:'12px', maxWidth:'200px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{so.notes || '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── By Material Tab ───────────────────────────────────────────────────────────

function ByMaterialTab({ stockOuts, materials }) {
  const [search,   setSearch]   = useState('');
  const [expanded, setExpanded] = useState(null);

  const matMap = useMemo(() => {
    const m = {};
    (materials || []).forEach(mat => { m[mat.id] = mat; });
    return m;
  }, [materials]);

  const groups = useMemo(() => {
    const m = {};
    (stockOuts || []).forEach(so => {
      if (!m[so.matId]) {
        m[so.matId] = {
          matId:      so.matId,
          matName:    so.matName,
          unit:       matMap[so.matId]?.unit ?? 'pcs',
          stockQty:   matMap[so.matId]?.stockQty ?? 0,
          totalQty:   0,
          totalCost:  0,
          records:    [],
        };
      }
      m[so.matId].totalQty  += so.qty;
      m[so.matId].totalCost += so.totalCost;
      m[so.matId].records.push(so);
    });
    return Object.values(m).sort((a, b) => b.totalQty - a.totalQty);
  }, [stockOuts, matMap]);

  const q = search.toLowerCase();
  const filtered = groups.filter(g => !q || g.matName.toLowerCase().includes(q));

  const { slice, page, perPage, total, setPage, setPerPage } = usePagination(filtered);

  return (
    <div style={S.col}>
      <div style={{ display:'flex', gap:'12px', flexWrap:'wrap' }}>
        <SummaryCard label="Materials Tracked" value={groups.length} accent />
        <SummaryCard label="Total Qty Deducted"
          value={groups.reduce((s, g) => s + g.totalQty, 0).toLocaleString()}
          color="#c62828" />
        <SummaryCard label="Total Cost of Goods"
          value={`₱${groups.reduce((s, g) => s + g.totalCost, 0).toLocaleString('en-PH', { minimumFractionDigits:2 })}`}
          color="#166534" />
      </div>

      <div style={{ ...S.card, ...S.rowBetween }}>
        <SearchBar value={search} onChange={setSearch} placeholder="Search material…" style={{ width:'240px' }} />
        <span style={{ fontSize:'12px', color:'var(--gray)' }}>{total} material{total !== 1 ? 's' : ''}</span>
      </div>

      <div style={{ ...S.card, padding:0, overflow:'hidden' }}>
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr>
                {['Material','Current Stock','Total Deducted','Total Cost','Transactions',''].map((h, i) => (
                  <th key={i} style={{ ...S.th, textAlign: i >= 2 ? 'center' : 'left', ...(i === 5 ? { width:40 } : {}) }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {total === 0 ? (
                <tr><td colSpan={6}>
                  <EmptyState message="No stock deductions yet" sub="Material movements will appear here." />
                </td></tr>
              ) : slice.map(g => {
                const isOpen = expanded === g.matId;
                return (
                  <>
                    <tr key={g.matId}
                      style={{ ...S.tr, cursor:'pointer' }}
                      onClick={() => setExpanded(isOpen ? null : g.matId)}
                      onMouseEnter={e => e.currentTarget.style.background='var(--dark2)'}
                      onMouseLeave={e => e.currentTarget.style.background=''}
                    >
                      <td style={{ ...S.td, fontWeight:600 }}>{g.matName}</td>
                      <td style={{ ...S.td, textAlign:'center', fontFamily:'monospace', fontSize:'12px', color:'var(--gray-light)' }}>
                        {g.stockQty} {g.unit}
                      </td>
                      <td style={{ ...S.td, textAlign:'center', color:'#c62828', fontWeight:600, fontFamily:'monospace', fontSize:'12px' }}>
                        -{g.totalQty} {g.unit}
                      </td>
                      <td style={{ ...S.td, textAlign:'center', fontWeight:600, color:'#166534', fontFamily:'monospace', fontSize:'12px' }}>
                        ₱{g.totalCost.toLocaleString('en-PH', { minimumFractionDigits:2 })}
                      </td>
                      <td style={{ ...S.td, textAlign:'center', color:'var(--gray)', fontSize:'12px' }}>{g.records.length}</td>
                      <td style={{ ...S.td, textAlign:'center' }}><ChevronIcon open={isOpen} /></td>
                    </tr>
                    {isOpen && (
                      <tr key={`${g.matId}_detail`}>
                        <td colSpan={6} style={{ padding:0, background:'var(--dark2)', borderBottom:'1px solid var(--border)' }}>
                          <table style={{ width:'100%', borderCollapse:'collapse' }}>
                            <thead>
                              <tr>
                                {['Date','Order / Ref','Product','Customer','Qty','Cost','Type'].map(h => (
                                  <th key={h} style={{ fontSize:'10px', fontWeight:700, color:'var(--gray)', textTransform:'uppercase', letterSpacing:'.4px', padding:'6px 14px', textAlign:'left', background:'var(--dark2)' }}>{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {g.records
                                .slice()
                                .sort((a, b) => new Date(b.date) - new Date(a.date))
                                .map((so, ri) => (
                                <tr key={ri} style={{ borderTop:'1px solid var(--border)' }}>
                                  <td style={{ padding:'7px 14px', fontSize:'11px', color:'var(--gray)', whiteSpace:'nowrap' }}>{so.date}</td>
                                  <td style={{ padding:'7px 14px', fontSize:'11px', fontFamily:'monospace', color:'var(--gray-light)' }}>{so.ref}</td>
                                  <td style={{ padding:'7px 14px', fontSize:'12px', color:'var(--gray-light)' }}>{so.productName || '—'}</td>
                                  <td style={{ padding:'7px 14px', fontSize:'12px', color:'var(--gray)' }}>{so.customerName || '—'}</td>
                                  <td style={{ padding:'7px 14px', fontSize:'12px', color:'#c62828', fontWeight:600 }}>-{so.qty} {g.unit}</td>
                                  <td style={{ padding:'7px 14px', fontSize:'12px', fontFamily:'monospace', color:'#166534' }}>₱{so.totalCost.toFixed(2)}</td>
                                  <td style={{ padding:'7px 14px' }}><ReasonBadge reason={so.reason} /></td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
        {total > 0 && (
          <div style={{ padding:'12px 16px', borderTop:'1px solid var(--border)' }}>
            <PaginationBar total={total} page={page} perPage={perPage} onPage={setPage} onPerPage={setPerPage} />
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Export ───────────────────────────────────────────────────────────────

export default function StockOutHistoryTab({ stockOuts, materials }) {
  const [subTab, setSubTab] = useState('order');

  const SUB_TABS = [
    { id:'order',    label:'By Order'    },
    { id:'material', label:'By Material' },
  ];

  return (
    <div style={S.col}>
      <div style={{ display:'flex', gap:'4px', background:'var(--dark2)', borderRadius:'8px', padding:'3px', alignSelf:'flex-start' }}>
        {SUB_TABS.map(t => (
          <button key={t.id} onClick={() => setSubTab(t.id)}
            style={{
              padding:'6px 18px', borderRadius:'6px', border:'none', cursor:'pointer',
              fontWeight:600, fontSize:'12px',
              background: subTab === t.id ? 'var(--dark)' : 'transparent',
              color:      subTab === t.id ? 'var(--white)' : 'var(--gray)',
              boxShadow:  subTab === t.id ? '0 1px 3px rgba(0,0,0,.1)' : 'none',
              transition: 'all .15s',
            }}
          >{t.label}</button>
        ))}
      </div>

      {subTab === 'order'    && <ByOrderTab    stockOuts={stockOuts} materials={materials} />}
      {subTab === 'material' && <ByMaterialTab stockOuts={stockOuts} materials={materials} />}
    </div>
  );
}
