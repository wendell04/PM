'use client';
import { useState, useMemo } from 'react';
import { S, ICONS, PaginationBar, SearchBar, StatusBadge, EmptyState, SummaryCard, usePagination, formatCurrency, formatDate, CustomSelect } from './shared';

export default function GoodsStockTab({ materials, batches, badOrders }) {
  const [search,    setSearch]   = useState('');
  const [catFilter, setCat]      = useState('All');
  const [statusFilter, setStatus]= useState('All');
  const [expanded,  setExpanded] = useState(new Set());

  const categories = useMemo(() => ['All', ...new Set(materials.map(m => m.category))], [materials]);

  // per-material rollup
  const stockData = useMemo(() => {
    return materials.map(mat => {
      const mBatches   = (batches || []).filter(b => b.matId === mat.id).sort((a, b) => new Date(a.date) - new Date(b.date));
      const totalRcvd  = mBatches.reduce((s, b) => s + b.qtyReceived, 0);
      const physical   = mat.stockQty != null ? mat.stockQty : mBatches.reduce((s, b) => s + b.remainingQty, 0);
      const pendingBO  = (badOrders || []).filter(bo => bo.matId === mat.id && bo.status === 'pending').reduce((s, bo) => s + bo.qty, 0);
      const goodsStock = Math.max(0, physical - pendingBO);
      const firstBatch = mBatches.find(b => b.remainingQty > 0);
      const unitCost   = firstBatch?.unitCost ?? mat.baseCost;
      const stockValue = mBatches.reduce((s, b) => s + b.remainingQty * b.unitCost, 0);

      const status = goodsStock === 0 ? 'out_of_stock' : goodsStock <= mat.minStock ? 'low_stock' : 'in_stock';

      return { mat, totalRcvd, physical, pendingBO, goodsStock, unitCost, stockValue, status, batches: mBatches };
    });
  }, [materials, batches, badOrders]);

  const filtered = useMemo(() => {
    let list = stockData;
    if (catFilter !== 'All')      list = list.filter(d => d.mat.category === catFilter);
    if (statusFilter !== 'All')   list = list.filter(d => d.status === statusFilter.toLowerCase().replace(' ', '_'));
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(d => d.mat.name.toLowerCase().includes(q) || d.mat.sku?.toLowerCase().includes(q));
    }
    return list;
  }, [stockData, catFilter, statusFilter, search]);

  const { slice, page, perPage, total, setPage, setPerPage } = usePagination(filtered);

  const inStock  = stockData.filter(d => d.status === 'in_stock').length;
  const lowStock = stockData.filter(d => d.status === 'low_stock').length;
  const outStock = stockData.filter(d => d.status === 'out_of_stock').length;
  const totalVal = stockData.reduce((s, d) => s + d.stockValue, 0);

  const toggleExpand = (id) => setExpanded(prev => {
    const s = new Set(prev);
    s.has(id) ? s.delete(id) : s.add(id);
    return s;
  });

  return (
    <div style={S.col}>
      {/* summary */}
      <div style={{ display:'flex', gap:'12px', flexWrap:'wrap' }}>
        <SummaryCard label="In Stock"      value={inStock}  color="#2e7d32" accent />
        <SummaryCard label="Low Stock"     value={lowStock} color="#b45309" />
        <SummaryCard label="Out of Stock"  value={outStock} color="#c62828" />
        <SummaryCard label="Total Value"   value={formatCurrency(totalVal)} />
      </div>

      {/* toolbar */}
      <div style={{ ...S.card, ...S.rowBetween }}>
        <div style={{ display:'flex', gap:'8px', flexWrap:'wrap' }}>
          <SearchBar value={search} onChange={setSearch} placeholder="Search name or SKU…" style={{ width:'220px' }} />
          <CustomSelect value={catFilter} onChange={setCat}
            options={categories.map(c => ({ value:c, label:c }))}
            style={{ width:'160px' }} />
          <CustomSelect value={statusFilter} onChange={setStatus}
            options={['All','In Stock','Low Stock','Out of Stock']}
            style={{ width:'140px' }} />
        </div>
      </div>

      {/* table */}
      <div style={{ ...S.card, padding:0, overflow:'hidden' }}>
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr>
                <th style={{ ...S.th, width:'30px' }}></th>
                {[
                  {l:'SKU'},{l:'Material'},{l:'Category'},
                  {l:'Goods Stock',r:true},{l:'Min Level',r:true},
                  {l:'FIFO Cost',r:true},{l:'Stock Value',r:true},{l:'Status'},
                ].map(h => (
                  <th key={h.l} style={{ ...S.th, textAlign: h.r ? 'right' : 'left' }}>{h.l}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {slice.length === 0 ? (
                <tr><td colSpan={9}><EmptyState message="No stock data" sub="Receive stock first." /></td></tr>
              ) : slice.map(d => {
                const isExp = expanded.has(d.mat.id);
                return [
                  <tr key={d.mat.id} style={{ ...S.tr, background: isExp ? '#fffbe8' : '' }} onMouseEnter={e => { if (!isExp) e.currentTarget.style.background='#fafbfc'; }} onMouseLeave={e => { if (!isExp) e.currentTarget.style.background=''; }}>
                    <td style={{ ...S.td, textAlign:'center' }}>
                      {d.batches.length > 0 && (
                        <button onClick={() => toggleExpand(d.mat.id)} style={{ background:'none', border:'none', cursor:'pointer', color:'#9ca3af', display:'flex', margin:'auto' }}>
                          {isExp ? ICONS.chevU : ICONS.chevD}
                        </button>
                      )}
                    </td>
                    <td style={{ ...S.td, fontFamily:'monospace', fontSize:'12px', color:'#6b7280' }}>{d.mat.sku}</td>
                    <td style={{ ...S.td, fontWeight:500 }}>{d.mat.name}</td>
                    <td style={S.td}><span style={{ background:'#f3f4f6', borderRadius:'5px', padding:'2px 8px', fontSize:'12px' }}>{d.mat.category}</span></td>
                    <td style={{ ...S.td, textAlign:'right', fontWeight:700, color: d.status === 'out_of_stock' ? '#c62828' : d.status === 'low_stock' ? '#b45309' : '#2e7d32' }}>{d.goodsStock} {d.mat.unit}</td>
                    <td style={{ ...S.td, textAlign:'right', color:'#9ca3af', fontSize:'12px' }}>{d.mat.minStock} {d.mat.unit}</td>
                    <td style={{ ...S.td, textAlign:'right' }}>{formatCurrency(d.unitCost)}</td>
                    <td style={{ ...S.td, textAlign:'right', fontWeight:600 }}>{formatCurrency(d.stockValue)}</td>
                    <td style={S.td}><StatusBadge status={d.status} /></td>
                  </tr>,

                  isExp && (
                    <tr key={`exp_${d.mat.id}`}>
                      <td colSpan={9} style={{ padding:'0 16px 14px 40px', background:'#fafbfc' }}>
                        <div style={{ fontSize:'12px', fontWeight:600, color:'#6b7280', marginBottom:'8px', textTransform:'uppercase', letterSpacing:'.4px' }}>Batch History (FIFO order)</div>
                        <table style={{ width:'100%', borderCollapse:'collapse', border:'1px solid #e9eaeb', borderRadius:'7px', overflow:'hidden' }}>
                          <thead>
                            <tr>
                              {[
                                {l:'Date'},{l:'Invoice'},{l:'Vendor'},
                                {l:'Qty Received',r:true},{l:'Unit Cost',r:true},{l:'Remaining',r:true},
                                {l:'Notes'},
                              ].map(h => (
                                <th key={h.l} style={{ ...S.th, fontSize:'10px', padding:'6px 10px', textAlign: h.r ? 'right' : 'left' }}>{h.l}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {d.batches.map(b => (
                              <tr key={b.id}>
                                <td style={{ ...S.td, padding:'6px 10px', fontSize:'12px' }}>{formatDate(b.date)}</td>
                                <td style={{ ...S.td, padding:'6px 10px', fontSize:'11px', fontFamily:'monospace', color:'#6b7280' }}>{b.invoiceNo}</td>
                                <td style={{ ...S.td, padding:'6px 10px', fontSize:'12px', color:'#6b7280' }}>{b.vendorName}</td>
                                <td style={{ ...S.td, padding:'6px 10px', fontSize:'12px', textAlign:'right' }}>{b.qtyReceived} {d.mat.unit}</td>
                                <td style={{ ...S.td, padding:'6px 10px', fontSize:'12px', textAlign:'right' }}>{formatCurrency(b.unitCost)}</td>
                                <td style={{ ...S.td, padding:'6px 10px', fontSize:'12px', textAlign:'right', fontWeight:600, color: b.remainingQty < b.qtyReceived ? '#b45309' : '#2e7d32' }}>
                                  {b.remainingQty} {d.mat.unit}
                                </td>
                                <td style={{ ...S.td, padding:'6px 10px', fontSize:'11px', color:'#9ca3af' }}>{b.notes}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  ),
                ];
              })}
            </tbody>
          </table>
        </div>
        <div style={{ padding:'12px 16px', borderTop:'1px solid #f0f1f2' }}>
          <PaginationBar total={total} page={page} perPage={perPage} onPage={setPage} onPerPage={setPerPage} />
        </div>
      </div>
    </div>
  );
}
