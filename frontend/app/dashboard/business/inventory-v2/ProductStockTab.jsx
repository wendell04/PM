'use client';
import { useMemo, useState } from 'react';
import { S, SearchBar, EmptyState, SummaryCard, StatusBadge, PaginationBar, usePagination, CustomSelect } from './shared';

function calcProducible(bom, matMap) {
  if (!bom?.items?.length) return 0;
  let min = Infinity;
  for (const item of bom.items) {
    const mat = matMap[item.matId];
    if (!mat) continue;
    const can = item.qty > 0 ? Math.floor(mat.stockQty / item.qty) : Infinity;
    if (can < min) min = can;
  }
  return min === Infinity ? 0 : min;
}

function stockStatus(n) {
  if (n === 0)  return 'out_of_stock';
  if (n <= 10)  return 'low_stock';
  return 'in_stock';
}

export default function ProductStockTab({ boms, materials, products }) {
  const [search,    setSearch]    = useState('');
  const [catFilter, setCatFilter] = useState('All');
  const [statFilter,setStatFilter]= useState('All');
  const [expanded,  setExpanded]  = useState(null);

  const matMap = useMemo(() => {
    const m = {};
    (materials || []).forEach(mat => { m[mat.id] = mat; });
    return m;
  }, [materials]);

  const bomMap = useMemo(() => {
    const m = {};
    (boms || []).forEach(b => { m[b.id] = b; });
    return m;
  }, [boms]);

  const { rows, usedBomIds } = useMemo(() => {
    const usedBomIds = new Set();
    const rows = (products || []).flatMap(p => {
      let variants = [];
      if (p.combinations?.length) {
        variants = p.combinations
          .filter(c => c.bomId && bomMap[c.bomId])
          .map(c => {
            usedBomIds.add(c.bomId);
            const bom = bomMap[c.bomId];
            return { label: c.name, bom, producible: calcProducible(bom, matMap) };
          });
      } else if (p.bomId && bomMap[p.bomId]) {
        usedBomIds.add(p.bomId);
        const bom = bomMap[p.bomId];
        variants = [{ label: null, bom, producible: calcProducible(bom, matMap) }];
      }
      if (!variants.length) return [];
      const minProd = Math.min(...variants.map(v => v.producible));
      return [{ id: p.id, name: p.name, category: p.category, variants, minProd, standalone: false }];
    });

    const standalone = (boms || [])
      .filter(b => !usedBomIds.has(b.id))
      .map(b => ({
        id: b.id, name: b.productName, category: '—',
        variants: [{ label: null, bom: b, producible: calcProducible(b, matMap) }],
        minProd: calcProducible(b, matMap), standalone: true,
      }));

    return { rows: [...rows, ...standalone], usedBomIds };
  }, [products, boms, bomMap, matMap]);

  const categories = useMemo(() => ['All', ...new Set(rows.filter(r => !r.standalone && r.category && r.category !== '—').map(r => r.category))], [rows]);

  const q = search.toLowerCase();
  const filtered = rows.filter(r => {
    if (q && !r.name.toLowerCase().includes(q) && !r.category?.toLowerCase().includes(q)) return false;
    if (catFilter !== 'All' && r.category !== catFilter) return false;
    if (statFilter !== 'All') {
      const n = r.minProd ?? 0;
      if (statFilter === 'out'  && n !== 0)            return false;
      if (statFilter === 'low'  && !(n > 0 && n <= 10)) return false;
      if (statFilter === 'ok'   && n <= 10)             return false;
    }
    return true;
  });

  const outCount = rows.filter(r => r.minProd === 0).length;
  const lowCount = rows.filter(r => r.minProd > 0 && r.minProd <= 10).length;

  const { slice, page, perPage, total, setPage, setPerPage } = usePagination(filtered);

  return (
    <div style={S.col}>
      <div style={{ display:'flex', gap:'12px', flexWrap:'wrap' }}>
        <SummaryCard label="Total Products"  value={rows.length} accent />
        <SummaryCard label="Out of Stock"    value={outCount}    color="#c62828" />
        <SummaryCard label="Low Stock"       value={lowCount}    color="#b45309" />
      </div>

      <div style={{ ...S.card, ...S.rowBetween }}>
        <div style={{ display:'flex', gap:'8px', flexWrap:'wrap' }}>
          <SearchBar value={search} onChange={setSearch} placeholder="Search product…" style={{ width:'220px' }} />
          <CustomSelect value={catFilter}
            onChange={v => { setCatFilter(v); setExpanded(null); }}
            options={categories.map(c => ({ value:c, label:c }))}
            style={{ width:'150px' }} />
          <CustomSelect value={statFilter}
            onChange={v => { setStatFilter(v); setExpanded(null); }}
            options={[{ value:'All', label:'All Status' },{ value:'ok', label:'In Stock' },{ value:'low', label:'Low Stock' },{ value:'out', label:'Out of Stock' }]}
            style={{ width:'140px' }} />
        </div>
        <span style={{ fontSize:'12px', color:'#6b7280' }}>{total} product{total !== 1 ? 's' : ''}</span>
      </div>

      <div style={{ ...S.card, padding:0, overflow:'hidden' }}>
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr>
                {['Product','Category','Variants','Status',''].map((h, i) => (
                  <th key={i} style={{ ...S.th, textAlign: i >= 3 ? 'center' : 'left', ...(i === 4 ? { width:40 } : {}) }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {total === 0 ? (
                <tr><td colSpan={5}><EmptyState message="No products found" sub="Link BOMs in Product Creation first." /></td></tr>
              ) : slice.map(row => (
                <>
                  <tr
                    key={row.id}
                    style={{ ...S.tr, cursor:'pointer' }}
                    onClick={() => setExpanded(expanded === row.id ? null : row.id)}
                    onMouseEnter={e => e.currentTarget.style.background='#fafbfc'}
                    onMouseLeave={e => e.currentTarget.style.background=''}
                  >
                    <td style={{ ...S.td, fontWeight:600 }}>{row.name}</td>
                    <td style={{ ...S.td, fontSize:'12px', color:'#6b7280' }}>{row.standalone ? <span style={{ color:'#9ca3af', fontStyle:'italic' }}>BOM only</span> : row.category}</td>
                    <td style={{ ...S.td, textAlign:'center', fontSize:'12px', color:'#6b7280' }}>
                      {row.variants.length > 1 ? `${row.variants.length} variants` : '—'}
                    </td>
                    <td style={{ ...S.td, textAlign:'center' }}>
                      <StatusBadge status={stockStatus(row.minProd)} />
                    </td>
                    <td style={{ ...S.td, textAlign:'center' }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2.5"
                        style={{ transform: expanded === row.id ? 'rotate(180deg)' : 'none', transition:'transform .2s' }}>
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    </td>
                  </tr>
                  {expanded === row.id && (
                    <tr key={`${row.id}_detail`}>
                      <td colSpan={5} style={{ padding:0, background:'#f8f9fa', borderBottom:'1px solid #e1e3e5' }}>
                        <DetailPanel variants={row.variants} matMap={matMap} />
                      </td>
                    </tr>
                  )}
                </>
              ))}
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

function DetailPanel({ variants, matMap }) {
  return (
    <div style={{ padding:'14px 20px', display:'flex', flexDirection:'column', gap:'14px' }}>
      {variants.map((v, vi) => {
        const bom  = v.bom;
        const prod = v.producible;
        if (!bom) return null;

        let bottleneckId = null, bottleneckMin = Infinity;
        for (const item of bom.items || []) {
          const mat = matMap[item.matId];
          if (!mat) continue;
          const can = item.qty > 0 ? Math.floor(mat.stockQty / item.qty) : Infinity;
          if (can < bottleneckMin) { bottleneckMin = can; bottleneckId = item.matId; }
        }

        return (
          <div key={vi}>
            {v.label && (
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'8px' }}>
                <span style={{ fontSize:'12px', fontWeight:700, color:'#374151' }}>{v.label}</span>
                <span style={{ fontSize:'12px', fontWeight:700, color: prod===0?'#c62828':prod<=10?'#b45309':'#1a7f3c' }}>{prod} can build</span>
              </div>
            )}
            <table style={{ width:'100%', borderCollapse:'collapse' }}>
              <thead>
                <tr>
                  {['Material','Stock','Need / unit','Can make'].map(h => (
                    <th key={h} style={{ fontSize:'10px', fontWeight:700, color:'#9ca3af', textTransform:'uppercase', letterSpacing:'.4px', padding:'4px 8px', textAlign:'left' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(bom.items || []).map((item, ii) => {
                  const mat = matMap[item.matId];
                  if (!mat) return null;
                  const can          = item.qty > 0 ? Math.floor(mat.stockQty / item.qty) : Infinity;
                  const isBottleneck = item.matId === bottleneckId;
                  return (
                    <tr key={ii}>
                      <td style={{ padding:'4px 8px', fontSize:'12px', color:'#374151', fontWeight: isBottleneck ? 600 : 400 }}>
                        {isBottleneck && <span style={{ fontSize:'9px', fontWeight:700, background:'#fde8e8', color:'#c62828', border:'1px solid #fca5a5', borderRadius:3, padding:'1px 4px', marginRight:5, textTransform:'uppercase' }}>limit</span>}
                        {mat.name}
                      </td>
                      <td style={{ padding:'4px 8px', fontSize:'12px', color:'#374151' }}>{mat.stockQty} {mat.unit}</td>
                      <td style={{ padding:'4px 8px', fontSize:'12px', color:'#6b7280' }}>{item.qty} {mat.unit}</td>
                      <td style={{ padding:'4px 8px', fontSize:'12px', fontWeight:600, color: can===0?'#c62828':can<=10?'#b45309':'#1a7f3c' }}>{can}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {vi < variants.length - 1 && <div style={{ borderTop:'1px solid #e1e3e5', marginTop:'10px' }} />}
          </div>
        );
      })}
    </div>
  );
}
