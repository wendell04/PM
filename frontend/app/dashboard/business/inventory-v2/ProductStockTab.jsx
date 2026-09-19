'use client';
import { useMemo, useState } from 'react';
import { useIsPhone, KpiStrip, PhoneFilterBar, PhoneList, PhoneRow, PhoneSheet } from '@/components/dashboard/phone';
import { S, SearchBar, EmptyState, SummaryCard, StatusBadge, PaginationBar, usePagination, CustomSelect } from './shared';

// Availability is stock MINUS what open orders already hold. Counting raw stockQty made this screen
// say "100 can build" while the storefront said "Only 10 left" off the same materials, with nothing on
// either page to explain the gap - the reservations were invisible here.
export function freeStock(mat) {
  return Math.max(0, Number(mat?.stockQty ?? 0) - Number(mat?.reservedQty ?? 0));
}

// Cost-only materials get no vote. A box does not decide how many mugs the shop can make - it
// decides what goes on the To Buy list. Counting it here is what made all three mug variants read
// "50 can build" off one shelf of fifty boxes.
export function counts(mat) {
  return !!mat && !mat.isOnDemand;
}

function calcProducible(bom, matMap) {
  if (!bom?.items?.length) return 0;
  let min = Infinity;
  for (const item of bom.items) {
    const mat = matMap[item.matId];
    if (!counts(mat)) continue;
    const can = item.qty > 0 ? Math.floor(freeStock(mat) / item.qty) : Infinity;
    if (can < min) min = can;
  }
  return min === Infinity ? 0 : min;
}

// How much of a variant's build every material covers, the blank included. The blank sets the
// target (it is what "can build" counts); each material is then held against that target:
// 109 mugs need 109 boxes, and 10 boxes cover 9% of them. Anything under 100% is what the
// owner has to restock before that build is fully fulfillable - the "seek bar" he asked for.
function coverageOf(bom, producible, matMap) {
  const rows = [];
  for (const item of bom?.items ?? []) {
    const mat = matMap[item.matId];
    if (!mat || !(item.qty > 0)) continue;
    const need = producible * item.qty;
    const have = freeStock(mat);
    const ratio = need > 0 ? Math.min(1, have / need) : 1;
    rows.push({ matId: item.matId, name: mat.name, uom: mat.unit, need, have, ratio, restock: Math.max(0, Math.ceil(need - have)), counted: counts(mat) });
  }
  return rows;
}

// The worst-covered material across a product's variants, and which materials fall short.
function coverageSummary(variants) {
  let coverage = 1;
  const short = new Map();
  for (const v of variants) {
    for (const c of v.coverage ?? []) {
      if (c.ratio < coverage) coverage = c.ratio;
      if (c.ratio < 1) short.set(c.matId, c.name);
    }
  }
  return { coverage, shortNames: [...short.values()] };
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
            const producible = calcProducible(bom, matMap);
            return { label: c.name, bom, producible, coverage: coverageOf(bom, producible, matMap) };
          });
      } else if (p.bomId && bomMap[p.bomId]) {
        usedBomIds.add(p.bomId);
        const bom = bomMap[p.bomId];
        const producible = calcProducible(bom, matMap);
        variants = [{ label: null, bom, producible, coverage: coverageOf(bom, producible, matMap) }];
      }
      if (!variants.length) return [];
      const minProd = Math.min(...variants.map(v => v.producible));
      const cov = coverageSummary(variants);
      return [{ id: p.id, name: p.name, category: p.category, variants, minProd, standalone: false, ...cov }];
    });

    const standalone = (boms || [])
      .filter(b => !usedBomIds.has(b.id))
      .map(b => {
        const producible = calcProducible(b, matMap);
        const variants = [{ label: null, bom: b, producible, coverage: coverageOf(b, producible, matMap) }];
        return { id: b.id, name: b.productName, category: '-', variants, minProd: producible, standalone: true, ...coverageSummary(variants) };
      });

    return { rows: [...rows, ...standalone], usedBomIds };
  }, [products, boms, bomMap, matMap]);

  const categories = useMemo(() => ['All', ...new Set(rows.filter(r => !r.standalone && r.category && r.category !== '-').map(r => r.category))], [rows]);

  const q = search.toLowerCase();
  const filtered = rows.filter(r => {
    if (q && !r.name.toLowerCase().includes(q) && !r.category?.toLowerCase().includes(q)) return false;
    if (catFilter !== 'All' && r.category !== catFilter) return false;
    if (statFilter !== 'All') {
      const n = r.minProd ?? 0;
      if (statFilter === 'out'  && n !== 0)            return false;
      if (statFilter === 'low'  && !(n > 0 && n <= 10)) return false;
      if (statFilter === 'ok'   && n <= 10)             return false;
      if (statFilter === 'restock' && !(r.coverage < 1)) return false;
    }
    return true;
  }).sort((a, b) => (a.coverage - b.coverage) || (a.minProd - b.minProd) || a.name.localeCompare(b.name));
  // Least covered first: the product whose build the shelf can least fulfil - the mugs with ten
  // boxes for 484 blanks - is the one to see before anything else.

  const outCount = rows.filter(r => r.minProd === 0).length;
  const lowCount = rows.filter(r => r.minProd > 0 && r.minProd <= 10).length;
  const restockCount = rows.filter(r => r.coverage < 1).length;

  const { slice, page, perPage, total, setPage, setPerPage } = usePagination(filtered);
  const isPhone = useIsPhone();

  return (
    <div style={S.col}>
      {isPhone ? (
        <>
          <KpiStrip items={[
            { key:'All', label:'Products',     value: rows.length, active: statFilter === 'All', onClick: () => { setStatFilter('All'); setExpanded(null); } },
            { key:'out', label:'Out of stock', value: outCount, color:'#c62828', active: statFilter === 'out', onClick: () => { setStatFilter('out'); setExpanded(null); } },
            { key:'low', label:'Low stock',    value: lowCount, color:'#b45309', active: statFilter === 'low', onClick: () => { setStatFilter('low'); setExpanded(null); } },
            { key:'restock', label:'To fulfil', value: restockCount, color: restockCount > 0 ? '#b45309' : undefined, active: statFilter === 'restock', onClick: () => { setStatFilter('restock'); setExpanded(null); } },
          ]} />
          <PhoneFilterBar search={search} onSearch={setSearch} placeholder="Search product"
            filters={[
              { key:'cat', label:'Category', value:catFilter, defaultValue:'All', onChange: v => { setCatFilter(v); setExpanded(null); },
                options: categories.map(c => ({ value:c, label:c })) },
              { key:'stat', label:'Stock', value:statFilter, defaultValue:'All', onChange: v => { setStatFilter(v); setExpanded(null); },
                options: [{ value:'All', label:'All' }, { value:'ok', label:'In stock' }, { value:'low', label:'Low stock' }, { value:'out', label:'Out of stock' }, { value:'restock', label:'Needs restocking to fulfil' }] },
            ]}
            note={`${total} product${total !== 1 ? 's' : ''}`} />
        </>
      ) : (<>
      <div style={{ display:'flex', gap:'12px', flexWrap:'wrap' }}>
        <SummaryCard label="Total Products"  value={rows.length} accent />
        <SummaryCard label="Out of Stock"    value={outCount}    color="#c62828" />
        <SummaryCard label="Low Stock"       value={lowCount}    color="#b45309" />
        <SummaryCard label="Needs restocking to fulfil" value={restockCount} color={restockCount > 0 ? '#b45309' : undefined} sub="a material covers less than the blanks" />
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
            options={[{ value:'All', label:'All Status' },{ value:'ok', label:'In Stock' },{ value:'low', label:'Low Stock' },{ value:'out', label:'Out of Stock' },{ value:'restock', label:'Needs restocking to fulfil' }]}
            style={{ width:'190px' }} />
        </div>
        <span style={{ fontSize:'12px', color:'var(--gray)' }}>{total} product{total !== 1 ? 's' : ''}</span>
      </div>

      </>)}

      {isPhone ? (
        <>
          {slice.length === 0 ? (
            <div style={{ ...S.card, padding:0 }}><EmptyState message="No products found" sub="Link BOMs to products to see stock here." /></div>
          ) : (
            <PhoneList>
              {slice.map((row, i) => (
                <PhoneRow key={row.id} first={i === 0} mono={false} onClick={() => setExpanded(row.id)}
                  title={row.name} chip={<StatusBadge status={stockStatus(row.minProd)} />}
                  meta={row.standalone ? 'Standalone' : `${row.variants.length} variant${row.variants.length === 1 ? '' : 's'}`}
                  sub={[`${row.minProd} can build`, row.coverage < 1 ? `restock to fulfil: ${row.shortNames.join(', ')}` : null, row.category].filter(Boolean).join(' · ')} />
              ))}
            </PhoneList>
          )}
          <div style={{ padding:'12px 0' }}>
            <PaginationBar total={total} page={page} perPage={perPage} onPage={setPage} onPerPage={setPerPage} />
          </div>
          {(() => {
            const row = expanded ? rows.find(r => r.id === expanded) : null;
            return (
              <PhoneSheet open={!!row} onClose={() => setExpanded(null)} mono={false} title={row?.name ?? ''}
                subtitle={row ? (row.standalone ? 'Standalone' : `${row.variants.length} variants`) : ''}
                chip={row ? <StatusBadge status={stockStatus(row.minProd)} /> : null}>
                {row && <DetailPanel variants={row.variants} matMap={matMap} />}
              </PhoneSheet>
            );
          })()}
        </>
      ) : (
      <div style={{ ...S.card, padding:0, overflow:'hidden' }}>
        <div style={{ overflowX:'auto' }}>
          <table className="pmp-rt" style={{ width:'100%', borderCollapse:'collapse' }}>
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
                    onMouseEnter={e => e.currentTarget.style.background='var(--dark2)'}
                    onMouseLeave={e => e.currentTarget.style.background=''}
                  >
                    <td style={{ ...S.td, fontWeight:600 }}>{row.name}</td>
                    <td style={{ ...S.td, fontSize:'12px', color:'var(--gray)' }}>{row.standalone ? <span style={{ color:'var(--gray)', fontStyle:'italic' }}>BOM only</span> : row.category}</td>
                    <td style={{ ...S.td, textAlign:'center', fontSize:'12px', color:'var(--gray)' }}>
                      {row.variants.length > 1 ? `${row.variants.length} variants` : '-'}
                      {row.coverage < 1 && (
                        <div title={`Restock to fulfil: ${row.shortNames.join(', ')}`} style={{ marginTop: 4 }}>
                          <div style={{ height: 4, borderRadius: 2, background: 'var(--dark2)', overflow: 'hidden', maxWidth: 140, margin: '0 auto' }}>
                            <div style={{ width: `${Math.max(3, row.coverage * 100)}%`, height: '100%', background: row.coverage < 0.25 ? '#c62828' : '#b45309' }} />
                          </div>
                          <div style={{ fontSize: 10.5, color: '#b45309', marginTop: 2 }}>{Math.round(row.coverage * 100)}% fulfillable - {row.shortNames.join(', ')}</div>
                        </div>
                      )}
                    </td>
                    <td style={{ ...S.td, textAlign:'center' }}>
                      <StatusBadge status={stockStatus(row.minProd)} />
                    </td>
                    <td style={{ ...S.td, textAlign:'center' }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--gray)" strokeWidth="2.5"
                        style={{ transform: expanded === row.id ? 'rotate(180deg)' : 'none', transition:'transform .2s' }}>
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    </td>
                  </tr>
                  {expanded === row.id && (
                    <tr key={`${row.id}_detail`}>
                      <td colSpan={5} style={{ padding:0, background:'var(--dark2)', borderBottom:'1px solid var(--border)' }}>
                        <DetailPanel variants={row.variants} matMap={matMap} />
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ padding:'12px 16px', borderTop:'1px solid var(--border)' }}>
          <PaginationBar total={total} page={page} perPage={perPage} onPage={setPage} onPerPage={setPerPage} />
        </div>
      </div>
      )}
    </div>
  );
}

// The second number, for the whole product rather than one variant at a time.
//
// "Can build" per variant counts the blank and deliberately ignores packaging, so three mug
// variants can each say 109 / 180 / 190 - true, if you built only that one. What none of them
// says is how many mugs can go out the door BOXED today, and that is one number for the whole
// product because every variant draws on the same shelf of boxes. It is the most the shop can
// ship complete before To Buy has to be acted on; it caps nothing and blocks nothing.
function shipCompleteAcross(variants, matMap) {
  const perUnit = {};   // cost-only material id -> the most any variant needs per unit
  for (const v of variants) {
    for (const item of v.bom?.items ?? []) {
      const mat = matMap[item.matId];
      if (!mat || counts(mat) || !(item.qty > 0)) continue;
      perUnit[item.matId] = Math.max(perUnit[item.matId] ?? 0, item.qty);
    }
  }
  let limit = null;
  for (const [id, qty] of Object.entries(perUnit)) {
    const can = Math.floor(freeStock(matMap[id]) / qty);
    if (limit === null || can < limit.can) limit = { can, name: matMap[id].name, id, uom: matMap[id].unit };
  }
  if (!limit) return null;
  // The owner's other question: to box EVERYTHING the blanks can make, how many more of the
  // limiting material would it take? A planning number, not a purchase - To Buy only buys for
  // orders taken and for the minimum. This tells him what minimum to set.
  let needAll = 0;
  for (const v of variants) {
    const item = (v.bom?.items ?? []).find(i => i.matId === limit.id);
    if (item) needAll += (v.producible ?? 0) * item.qty;
  }
  limit.toCoverAll = Math.max(0, Math.ceil(needAll - freeStock(matMap[limit.id])));
  return limit;
}

function DetailPanel({ variants, matMap }) {
  const pooled = shipCompleteAcross(variants, matMap);
  const buildable = variants.reduce((s, v) => s + (v.producible ?? 0), 0);
  return (
    <div style={{ padding:'14px 20px', display:'flex', flexDirection:'column', gap:'14px' }}>
      {pooled && (
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', gap:12, flexWrap:'wrap',
          padding:'9px 12px', borderRadius:8, border:'1px solid var(--border)',
          background: pooled.can < buildable ? 'rgba(212,168,67,0.08)' : 'var(--dark)' }}>
          <div style={{ fontSize:'12px', color:'var(--gray-light)' }}>
            <b style={{ color: pooled.can === 0 ? '#c62828' : pooled.can < buildable ? '#b45309' : '#1a7f3c' }}>{pooled.can} can ship complete</b>
            {' '}- boxed, with consumables, {variants.length > 1 ? `across all ${variants.length} variants together` : 'for this product'}
          </div>
          <div style={{ fontSize:'11px', color:'var(--gray)' }}>
            Limited by <b style={{ color:'var(--gray-light)' }}>{pooled.name}</b>
            {pooled.toCoverAll > 0 && <> - <b style={{ color:'var(--gray-light)' }}>{pooled.toCoverAll} {pooled.uom}</b> more would box all {buildable} the blanks can make</>}.
            {' '}Packaging never blocks a sale; orders that need it show up in To Buy.
          </div>
        </div>
      )}
      {variants.map((v, vi) => {
        const bom  = v.bom;
        const prod = v.producible;
        if (!bom) return null;

        let bottleneckId = null, bottleneckMin = Infinity;
        for (const item of bom.items || []) {
          const mat = matMap[item.matId];
          if (!counts(mat)) continue;
          const can = item.qty > 0 ? Math.floor(freeStock(mat) / item.qty) : Infinity;
          if (can < bottleneckMin) { bottleneckMin = can; bottleneckId = item.matId; }
        }
        const countedNames = (bom.items || [])
          .map(i => matMap[i.matId]).filter(counts).map(m => m.name);
        const hasCostOnly = (bom.items || []).some(i => matMap[i.matId] && matMap[i.matId].isOnDemand);

        return (
          <div key={vi}>
            {v.label && (
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'8px' }}>
                <span style={{ fontSize:'12px', fontWeight:700, color:'var(--gray-light)' }}>{v.label}</span>
                <span style={{ fontSize:'12px', fontWeight:700, color: prod===0?'#c62828':prod<=10?'#b45309':'#1a7f3c' }}>{prod} can build</span>
              </div>
            )}
            <table className="pmp-rt" style={{ width:'100%', borderCollapse:'collapse' }}>
              <thead>
                <tr>
                  {['Material','Stock','Need / unit','Can make'].map(h => (
                    <th key={h} style={{ fontSize:'10px', fontWeight:700, color:'var(--gray)', textTransform:'uppercase', letterSpacing:'.4px', padding:'4px 8px', textAlign:'left' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(bom.items || []).map((item, ii) => {
                  const mat = matMap[item.matId];
                  if (!mat) return null;
                  const counted      = counts(mat);
                  const can          = item.qty > 0 ? Math.floor(freeStock(mat) / item.qty) : Infinity;
                  const isBottleneck = counted && item.matId === bottleneckId;
                  const cov          = (v.coverage ?? []).find(c => c.matId === item.matId);
                  return (
                    <tr key={ii} style={{ opacity: counted ? 1 : 0.62 }}>
                      <td style={{ padding:'4px 8px', fontSize:'12px', color:'var(--gray-light)', fontWeight: isBottleneck ? 600 : 400 }}>
                        <span style={{ color: counted ? '#1a7f3c' : 'var(--gray)', marginRight:5, fontSize:'10px' }}>{counted ? '●' : '○'}</span>
                        {isBottleneck && <span style={{ fontSize:'9px', fontWeight:700, background:'#fde8e8', color:'#c62828', border:'1px solid #fca5a5', borderRadius:3, padding:'1px 4px', marginRight:5, textTransform:'uppercase' }}>limit</span>}
                        {mat.name}
                      </td>
                      <td style={{ padding:'4px 8px', fontSize:'12px', color:'var(--gray-light)' }}>
                        {mat.stockQty} {mat.unit}
                        {Number(mat.reservedQty ?? 0) > 0 && (
                          <span style={{ color:'#b45309', fontSize:'11px' }}> ({mat.reservedQty} held)</span>
                        )}
                      </td>
                      <td style={{ padding:'4px 8px', fontSize:'12px', color:'var(--gray)' }}>{item.qty} {mat.unit}</td>
                      {/* A number here on a cost-only row answers a question it was never asked.
                          The dash says the row does not decide anything. */}
                      <td style={{ padding:'4px 8px', fontSize:'12px', fontWeight:600, color: !counted ? 'var(--gray)' : can===0?'#c62828':can<=10?'#b45309':'#1a7f3c' }}>
                        {counted ? can : '-'}
                        {!counted && <span style={{ marginLeft:6, fontSize:'10px', color:'var(--gray)' }}>cost only</span>}
                        {cov && (
                          <div style={{ marginTop: 4, minWidth: 120 }} title={`${cov.have} of ${cov.need} ${cov.uom ?? ''} needed to make all ${prod}`}>
                            <div style={{ height: 4, borderRadius: 2, background: 'var(--dark2)', overflow: 'hidden' }}>
                              <div style={{ width: `${Math.max(3, cov.ratio * 100)}%`, height: '100%', background: cov.ratio >= 1 ? '#2e7d32' : cov.ratio < 0.25 ? '#c62828' : '#b45309' }} />
                            </div>
                            {cov.ratio < 1 && <div style={{ fontSize: 10.5, color: '#b45309', marginTop: 2, fontWeight: 600 }}>restock {cov.restock} {cov.uom ?? ''} to fulfil all {prod}</div>}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div style={{ padding:'6px 8px 0', fontSize:'11px', color:'var(--gray)', lineHeight:1.5 }}>
              {countedNames.length
                ? <>Counted: <b style={{ color:'var(--gray-light)' }}>{countedNames.join(', ')}</b>.</>
                : <b style={{ color:'#b45309' }}>Nothing is counted - every material here is cost only, so this cannot say when it runs out.</b>}
              {hasCostOnly && countedNames.length > 0 &&
                ' Packaging and consumables are costed and appear in To Buy, but do not cap what you can sell.'}
            </div>
            {vi < variants.length - 1 && <div style={{ borderTop:'1px solid var(--border)', marginTop:'10px' }} />}
          </div>
        );
      })}
    </div>
  );
}
