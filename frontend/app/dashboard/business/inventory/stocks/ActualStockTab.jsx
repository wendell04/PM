'use client';

import React, { useState, useMemo, useEffect } from 'react';
import CustomDropdown from '@/app/components/CustomDropdown';

// ── Storage Helpers ──────────────────────────────────────────────────────────────
function getStore(key) {
  if (typeof window === 'undefined') return [];
  try { return JSON.parse(localStorage.getItem(key) || '[]'); }
  catch { return []; }
}

// ── Shared Styles ──────────────────────────────────────────────────────────────
const thStyle = {
  padding: '0.875rem 1rem', textAlign: 'left', color: 'var(--gray)',
  fontWeight: 700, fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.1em',
};

function ChevronIcon({ open }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
      style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }}>
      <path d="M9 18l6-6-6-6"/>
    </svg>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ACTUAL STOCK TAB — Simplified User-Friendly View
// Shows: Total Stock (Goods + Damaged), In Transit/Pending PO, Summary Cards
// ══════════════════════════════════════════════════════════════════════════════
export default function ActualStockTab({ materials }) {
  const [expandedMaterial, setExpandedMaterial] = useState(null);
  const [search, setSearch]                     = useState('');
  const [categoryFilter, setCategoryFilter]     = useState('');
  const [currentPage, setCurrentPage]           = useState(1);
  const itemsPerPage = 10;
  const [pendingPOs, setPendingPOs]             = useState([]);

  // Load pending POs for In Transit calculation
  useEffect(() => {
    const allPOs = getStore('pmp_purchase_orders');
    setPendingPOs(allPOs.filter(p => p.status === 'pending' || p.status === 'partial'));
  }, []);

  // Calculate In Transit per material from pending/partial POs
  const inTransitMap = useMemo(() => {
    const map = {};
    pendingPOs.forEach(po => {
      (po.items || []).forEach(item => {
        const ordered = parseInt(item.qty) || 0;
        const received = parseInt(item.receivedQty) || 0;
        const inTransit = Math.max(0, ordered - received);
        if (inTransit > 0) {
          if (!map[item.materialId]) map[item.materialId] = 0;
          map[item.materialId] += inTransit;
        }
      });
    });
    return map;
  }, [pendingPOs]);

  // Summary cards: Total Goods Stock, Total Actual Stock, Total Waste, Total Goods Value, Total Waste Value, Backorders
  const summaryCards = useMemo(() => {
    let totalStock = 0, outOfStock = 0, lowStock = 0;
    let totalGoodsCost = 0, totalInventoryLoss = 0;
    let totalActualStock = 0, totalWaste = 0;
    let totalInTransit = 0, totalBackorders = 0;

    materials.forEach(m => {
      if (m.parentId) return; // Skip children - only process parent materials

      // Add In Transit from pending POs
      totalInTransit += inTransitMap[m.id] || 0;

      const batches = m.batches || [];
      const hasChildren = m.hasVariants;

      // For parents with variants, aggregate stock from children
      if (hasChildren) {
        const children = materials.filter(child => child.parentId === m.id);
        let parentGoodStock = 0, parentDamaged = 0;

        children.forEach(child => {
          const childBatches = child.batches || [];
          // Backward compatibility: check both qtyGood and goodQty
          const childGood = childBatches.reduce((s, b) => s + ((b.qtyGood || b.goodQty) || 0), 0);
          // Backward compatibility: check both qtyDamaged and damagedQty
          const childDamaged = childBatches.reduce((s, b) => s + ((b.qtyDamaged || b.damagedQty) || 0), 0);
          parentGoodStock += childGood;
          parentDamaged += childDamaged;
          totalWaste += childDamaged;

          // Calculate costs from children batches
          childBatches.forEach(b => {
            const remaining = b.remainingQty || 0;
            const damagedQty = (b.qtyDamaged || b.damagedQty) || 0;
            const cost = b.unitCost || 0;
            totalGoodsCost += remaining * cost;
            totalInventoryLoss += damagedQty * cost;
          });
        });

        const parentTotal = parentGoodStock + parentDamaged;
        totalStock += parentGoodStock;
        totalActualStock += parentTotal;

        const minStock = m.minStock || 10;
        if (parentGoodStock === 0 && m.procurementType !== 'on-demand') outOfStock++;
        else if (parentGoodStock > 0 && parentGoodStock < minStock && m.procurementType !== 'on-demand') lowStock++;
      } else {
        // For standalone materials (no variants), use their own batches
        // Backward compatibility: check both qtyGood and goodQty
        const goodStock = batches.reduce((s, b) => s + ((b.qtyGood || b.goodQty) || 0), 0);
        // Backward compatibility: check both qtyDamaged and damagedQty
        const damaged = batches.reduce((s, b) => s + ((b.qtyDamaged || b.damagedQty) || 0), 0);
        const total = goodStock + damaged;
        totalStock += goodStock;
        totalActualStock += total;
        totalWaste += damaged;

        const minStock = m.minStock || 10;
        if (goodStock === 0 && m.procurementType !== 'on-demand') outOfStock++;
        else if (goodStock > 0 && goodStock < minStock && m.procurementType !== 'on-demand') lowStock++;

        batches.forEach(b => {
          const remaining = b.remainingQty || 0;
          const damagedQty = (b.qtyDamaged || b.damagedQty) || 0;
          const cost = b.unitCost || 0;
          totalGoodsCost += remaining * cost;
          totalInventoryLoss += damagedQty * cost;
        });
      }
    });

    // Calculate total backorders
    const backorders = getStore('pmp_backorders');
    totalBackorders = backorders.filter(bo => bo.status === 'pending').reduce((sum, bo) => sum + (bo.qty || 0), 0);

    return { totalStock, outOfStock, lowStock, totalGoodsCost, totalActualStock, totalInventoryLoss, totalInTransit, totalWaste, totalBackorders };
  }, [materials, inTransitMap]);

  const categories = [...new Set(
    materials.filter(m => !m.parentId).map(m => m.category).filter(Boolean)
  )];

  // Filter parent materials only
  const filtered = materials.filter(m => {
    if (m.parentId) return false;
    if (categoryFilter && m.category !== categoryFilter) return false;
    const q = search.toLowerCase();
    if (q && !m.name.toLowerCase().includes(q) && !(m.sku || '').toLowerCase().includes(q)) return false;
    return true;
  });

  // Pagination
  const totalPages = Math.ceil(filtered.length / itemsPerPage);
  const paginatedItems = filtered.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  return (
    <div>
      {/* ── Summary Cards ── */}
      <div className="inventory-summary" style={{ marginBottom: '1.5rem' }}>
        <div className="summary-card">
          <div className="summary-content">
            <span className="summary-value">{summaryCards.totalStock}</span>
            <span className="summary-label">Total Goods Stock</span>
          </div>
        </div>
        <div className="summary-card">
          <div className="summary-content">
            <span className="summary-value">{summaryCards.totalActualStock}</span>
            <span className="summary-label">Total Actual Stock</span>
          </div>
        </div>
        <div className="summary-card">
          <div className="summary-content">
            <span className="summary-value" style={{ color: '#ef4444' }}>{summaryCards.totalWaste}</span>
            <span className="summary-label">Total Waste</span>
          </div>
        </div>
        <div className="summary-card">
          <div className="summary-content">
            <span className="summary-value" style={{ color: '#D4A843', fontSize: '1rem' }}>
              ₱{summaryCards.totalGoodsCost.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            <span className="summary-label">Total Goods Value</span>
          </div>
        </div>
        <div className="summary-card">
          <div className="summary-content">
            <span className="summary-value" style={{ color: '#ef4444', fontSize: '1rem' }}>
              ₱{summaryCards.totalInventoryLoss.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            <span className="summary-label">Total Waste Value</span>
          </div>
        </div>
      </div>

      {/* ── Toolbar ─ */}
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
          <input type="text" value={search} onChange={e => { setSearch(e.target.value); setCurrentPage(1); }}
            placeholder="Search materials..."
            style={{ width: '100%', padding: '0.6rem 1rem 0.6rem 2.5rem', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border)', borderRadius: '8px', color: '#E5E2E1', outline: 'none' }} />
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--gray)', pointerEvents: 'none' }}>
            <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
          </svg>
        </div>
        <CustomDropdown
          value={categoryFilter}
          onChange={(val) => { setCategoryFilter(val); setCurrentPage(1); }}
          options={[{ value: '', label: 'All Categories' }, ...categories.map(c => ({ value: c, label: c }))]}
          placeholder="All Categories"
          style={{ minWidth: '160px' }}
        />
      </div>

      {/* ── Main Table ── */}
      <div style={{ border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden', background: 'var(--dark)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
          <thead>
            <tr style={{ background: 'rgba(0,0,0,0.3)', borderBottom: '2px solid var(--border)' }}>
              <th style={{ ...thStyle, width: '40px' }}></th>
              <th style={thStyle}>SKU / Name</th>
              <th style={{ ...thStyle, textAlign: 'center' }}>Category</th>
              <th style={{ ...thStyle, textAlign: 'center' }}>Good Stock</th>
              <th style={{ ...thStyle, textAlign: 'center' }}>Damaged / Others</th>
              <th style={{ ...thStyle, textAlign: 'center' }}>Total</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>Unit Cost</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>Goods Value</th>
              <th style={{ ...thStyle, textAlign: 'center' }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {paginatedItems.length === 0 ? (
              <tr>
                <td colSpan={9} style={{ padding: '3rem', textAlign: 'center', color: 'var(--gray)' }}>
                  {materials.length === 0 ? 'No materials yet. Add materials in Master Data first.' : 'No materials match your filters.'}
                </td>
              </tr>
            ) : paginatedItems.map(mat => {
              // For parents with variants, aggregate stock from children
              const hasChildren = mat.hasVariants;
              let batches, goodStock, damaged, totalStock, avgCost, goodsValue, children;

              if (hasChildren) {
                // Get all children batches
                children = materials.filter(child => child.parentId === mat.id);
                const allChildrenBatches = children.flatMap(child => child.batches || []);
                batches = allChildrenBatches;
                goodStock = allChildrenBatches.reduce((s, b) => s + (b.qtyGood || 0), 0);
                damaged = allChildrenBatches.reduce((s, b) => s + (b.qtyDamaged || 0), 0);
                totalStock = goodStock + damaged;
                avgCost = allChildrenBatches.length > 0 ? allChildrenBatches.reduce((s, b) => s + (b.unitCost || 0), 0) / allChildrenBatches.length : (mat.baseCost || 0);
                goodsValue = goodStock * avgCost;
              } else {
                // Standalone material - use its own batches
                batches = mat.batches || [];
                goodStock = batches.reduce((s, b) => s + (b.qtyGood || 0), 0);
                damaged = batches.reduce((s, b) => s + (b.qtyDamaged || 0), 0);
                totalStock = goodStock + damaged;
                avgCost = batches.length > 0 ? batches.reduce((s, b) => s + (b.unitCost || 0), 0) / batches.length : (mat.baseCost || 0);
                goodsValue = goodStock * avgCost;
              }
              
              const isExpanded = expandedMaterial === mat.id;

              let status = 'Healthy';
              let statusColor = '#22c55e';
              if (batches.length === 0)                { status = 'No Batches';  statusColor = '#6b7280'; }
              else if (goodStock === 0 && damaged > 0) { status = 'All Damaged'; statusColor = '#ef4444'; }
              else if (goodStock === 0)                { status = 'Out of Stock'; statusColor = '#ef4444'; }
              else if (goodStock < (mat.minStock || 10)) { status = 'Low Stock'; statusColor = '#f59e0b'; }
              else if (damaged > 0)                    { status = 'Has Damage';  statusColor = '#f97316'; }

              return (
                <React.Fragment key={mat.id}>
                  <tr
                    style={{ borderBottom: isExpanded ? 'none' : '1px solid rgba(255,255,255,0.04)', cursor: batches.length > 0 ? 'pointer' : 'default' }}
                    onClick={() => batches.length > 0 && setExpandedMaterial(isExpanded ? null : mat.id)}
                    onMouseEnter={e => { if (!isExpanded) e.currentTarget.style.background = 'rgba(255,255,255,0.02)'; }}
                    onMouseLeave={e => { if (!isExpanded) e.currentTarget.style.background = 'transparent'; }}>
                    <td style={{ padding: '0.875rem 0.5rem 0.875rem 1rem' }}>
                      {batches.length > 0 && (
                        <button onClick={e => { e.stopPropagation(); setExpandedMaterial(isExpanded ? null : mat.id); }}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: isExpanded ? '#D4A843' : 'var(--gray)', padding: 0 }}>
                          <ChevronIcon open={isExpanded} />
                        </button>
                      )}
                    </td>
                    <td style={{ padding: '0.875rem 1rem' }}>
                      <div style={{ fontWeight: 600, color: '#E5E2E1', fontSize: '0.875rem' }}>{mat.name}</div>
                      {mat.sku && <div style={{ fontSize: '0.65rem', color: 'var(--gray)', fontFamily: 'monospace', marginTop: '0.1rem' }}>{mat.sku}</div>}
                    </td>
                    <td style={{ padding: '0.875rem 1rem', textAlign: 'center' }}>
                      {mat.category ? <span style={{ fontSize: '0.75rem', color: 'var(--gray)', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', padding: '0.15rem 0.5rem', borderRadius: '4px' }}>{mat.category}</span> : '—'}
                    </td>
                    <td style={{ padding: '0.875rem 1rem', textAlign: 'center', fontWeight: 700, color: '#E5E2E1', fontFamily: 'monospace' }}>
                      {goodStock} <span style={{ color: 'var(--gray)', fontWeight: 400, fontSize: '0.75rem' }}>{mat.uom || 'pcs'}</span>
                    </td>
                    <td style={{ padding: '0.875rem 1rem', textAlign: 'center', fontWeight: 700, color: damaged > 0 ? '#ef4444' : '#6b7280', fontFamily: 'monospace' }}>
                      {damaged} <span style={{ color: 'var(--gray)', fontWeight: 400, fontSize: '0.75rem' }}>{mat.uom || 'pcs'}</span>
                    </td>
                    <td style={{ padding: '0.875rem 1rem', textAlign: 'center', fontWeight: 700, color: '#E5E2E1', fontFamily: 'monospace' }}>
                      {totalStock} <span style={{ color: 'var(--gray)', fontWeight: 400, fontSize: '0.75rem' }}>{mat.uom || 'pcs'}</span>
                    </td>
                    <td style={{ padding: '0.875rem 1rem', textAlign: 'right', color: '#D4A843', fontFamily: 'monospace' }}>₱{avgCost.toFixed(2)}</td>
                    <td style={{ padding: '0.875rem 1rem', textAlign: 'right', fontWeight: 700, color: '#E5E2E1', fontFamily: 'monospace' }}>₱{goodsValue.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</td>
                    <td style={{ padding: '0.875rem 1rem', textAlign: 'center' }}>
                      <span style={{ fontSize: '0.7rem', fontWeight: 700, color: statusColor, background: `${statusColor}15`, padding: '0.15rem 0.5rem', borderRadius: '4px', border: `1px solid ${statusColor}30` }}>{status}</span>
                    </td>
                  </tr>
                  {/* Expanded: Batch Details */}
                  {isExpanded && batches.length > 0 && (
                    <tr>
                      <td colSpan={hasChildren ? 9 : 8} style={{ padding: 0, background: 'rgba(0,0,0,0.2)' }}>
                        <div style={{ padding: '0.75rem 1.25rem 0.75rem 3rem' }}>
                          <div style={{ fontSize: '0.62rem', color: '#D4A843', textTransform: 'uppercase', marginBottom: '0.6rem', fontWeight: 700, letterSpacing: '0.08em' }}>
                            {hasChildren ? 'Variant Batches' : 'Batch Breakdown'}
                          </div>
                          <div style={{ border: '1px solid rgba(255,255,255,0.06)', borderRadius: '8px', overflow: 'hidden' }}>
                            <table style={{ width: '100%', fontSize: '0.75rem', borderCollapse: 'collapse' }}>
                              <thead>
                                <tr style={{ background: 'rgba(0,0,0,0.3)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                                  {hasChildren && <th style={{ padding: '0.4rem 0.6rem', textAlign: 'left', color: '#D4A843', fontWeight: 700, fontSize: '0.6rem', textTransform: 'uppercase' }}>Variant</th>}
                                  <th style={{ padding: '0.4rem 0.6rem', textAlign: 'left', color: '#D4A843', fontWeight: 700, fontSize: '0.6rem', textTransform: 'uppercase' }}>Invoice</th>
                                  <th style={{ padding: '0.4rem 0.6rem', textAlign: 'center', color: '#D4A843', fontWeight: 700, fontSize: '0.6rem', textTransform: 'uppercase' }}>Date</th>
                                  <th style={{ padding: '0.4rem 0.6rem', textAlign: 'center', color: '#D4A843', fontWeight: 700, fontSize: '0.6rem', textTransform: 'uppercase' }}>Good</th>
                                  <th style={{ padding: '0.4rem 0.6rem', textAlign: 'center', color: '#D4A843', fontWeight: 700, fontSize: '0.6rem', textTransform: 'uppercase' }}>Damaged / Others</th>
                                  <th style={{ padding: '0.4rem 0.6rem', textAlign: 'center', color: '#D4A843', fontWeight: 700, fontSize: '0.6rem', textTransform: 'uppercase' }}>Actual</th>
                                  <th style={{ padding: '0.4rem 0.6rem', textAlign: 'right', color: '#D4A843', fontWeight: 700, fontSize: '0.6rem', textTransform: 'uppercase' }}>Unit Cost</th>
                                  <th style={{ padding: '0.4rem 0.6rem', textAlign: 'right', color: '#D4A843', fontWeight: 700, fontSize: '0.6rem', textTransform: 'uppercase' }}>Value</th>
                                </tr>
                              </thead>
                              <tbody>
                                {hasChildren ? (
                                  // For parents with variants, show batches grouped by child
                                  children.flatMap(child =>
                                    (child.batches || []).map((b, idx) => {
                                      const good = b.qtyGood || 0;
                                      // Backward compatibility: check both qtyDamaged and damagedQty
                                      const damaged = (b.qtyDamaged || b.damagedQty) || 0;
                                      const actual = good + damaged; // Actual = Goods + Damaged
                                      return (
                                        <tr key={`${child.id}-${b.invoiceNumber || b.batchId}-${idx}`} style={{ background: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                          <td style={{ padding: '0.4rem 0.6rem', color: '#E5E2E1', fontSize: '0.72rem', fontWeight: 600 }}>{child.name}</td>
                                          <td style={{ padding: '0.4rem 0.6rem', color: 'var(--gray)', fontSize: '0.72rem' }}>{b.invoiceNumber || '—'}</td>
                                          <td style={{ padding: '0.4rem 0.6rem', textAlign: 'center', color: 'var(--gray)' }}>{new Date(b.dateReceived).toLocaleDateString('en-PH')}</td>
                                          <td style={{ padding: '0.4rem 0.6rem', textAlign: 'center', color: '#E5E2E1', fontWeight: 600 }}>{good}</td>
                                          <td style={{ padding: '0.4rem 0.6rem', textAlign: 'center', color: damaged > 0 ? '#ef4444' : '#6b7280', fontWeight: 600 }}>{damaged}</td>
                                          <td style={{ padding: '0.4rem 0.6rem', textAlign: 'center', color: '#E5E2E1', fontWeight: 600 }}>{actual}</td>
                                          <td style={{ padding: '0.4rem 0.6rem', textAlign: 'right', color: '#D4A843', fontFamily: 'monospace' }}>₱{(b.unitCost || 0).toFixed(2)}</td>
                                          <td style={{ padding: '0.4rem 0.6rem', textAlign: 'right', color: '#E5E2E1', fontWeight: 600, fontFamily: 'monospace' }}>₱{(actual * (b.unitCost || 0)).toFixed(2)}</td>
                                        </tr>
                                      );
                                    })
                                  )
                                ) : (
                                  // For standalone materials, show batches normally
                                  batches.map((b, idx) => {
                                    const good = b.qtyGood || 0;
                                    // Backward compatibility: check both qtyDamaged and damagedQty
                                    const damaged = (b.qtyDamaged || b.damagedQty) || 0;
                                    const actual = good + damaged; // Actual = Goods + Damaged
                                    return (
                                      <tr key={`${b.invoiceNumber || b.batchId}-${idx}`} style={{ background: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                        <td style={{ padding: '0.4rem 0.6rem', color: 'var(--gray)', fontSize: '0.72rem' }}>{b.invoiceNumber || '—'}</td>
                                        <td style={{ padding: '0.4rem 0.6rem', textAlign: 'center', color: 'var(--gray)' }}>{new Date(b.dateReceived).toLocaleDateString('en-PH')}</td>
                                        <td style={{ padding: '0.4rem 0.6rem', textAlign: 'center', color: '#E5E2E1', fontWeight: 600 }}>{good}</td>
                                        <td style={{ padding: '0.4rem 0.6rem', textAlign: 'center', color: damaged > 0 ? '#ef4444' : '#6b7280', fontWeight: 600 }}>{damaged}</td>
                                        <td style={{ padding: '0.4rem 0.6rem', textAlign: 'center', color: '#E5E2E1', fontWeight: 600 }}>{actual}</td>
                                        <td style={{ padding: '0.4rem 0.6rem', textAlign: 'right', color: '#D4A843', fontFamily: 'monospace' }}>₱{(b.unitCost || 0).toFixed(2)}</td>
                                        <td style={{ padding: '0.4rem 0.6rem', textAlign: 'right', color: '#E5E2E1', fontWeight: 600, fontFamily: 'monospace' }}>₱{(actual * (b.unitCost || 0)).toFixed(2)}</td>
                                      </tr>
                                    );
                                  })
                                )}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
        {/* Pagination */}
        {totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem', padding: '0.75rem', borderTop: '1px solid var(--border)' }}>
            <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}
              style={{ padding: '0.35rem 0.75rem', background: currentPage === 1 ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.06)', border: '1px solid var(--border)', borderRadius: '6px', color: currentPage === 1 ? 'var(--gray)' : '#E5E2E1', cursor: currentPage === 1 ? 'not-allowed' : 'pointer', fontSize: '0.8rem' }}>‹ Prev</button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
              <button key={page} onClick={() => setCurrentPage(page)}
                style={{ padding: '0.35rem 0.65rem', background: currentPage === page ? 'var(--gold)' : 'rgba(255,255,255,0.06)', border: currentPage === page ? '1px solid var(--gold)' : '1px solid var(--border)', borderRadius: '6px', color: currentPage === page ? '#000' : '#E5E2E1', cursor: 'pointer', fontSize: '0.8rem', fontWeight: currentPage === page ? 700 : 400 }}>{page}</button>
            ))}
            <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}
              style={{ padding: '0.35rem 0.75rem', background: currentPage === totalPages ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.06)', border: '1px solid var(--border)', borderRadius: '6px', color: currentPage === totalPages ? 'var(--gray)' : '#E5E2E1', cursor: currentPage === totalPages ? 'not-allowed' : 'pointer', fontSize: '0.8rem' }}>Next ›</button>
          </div>
        )}
      </div>
    </div>
  );
}
