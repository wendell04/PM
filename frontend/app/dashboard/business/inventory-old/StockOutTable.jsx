'use client';

import React, { useState, useMemo } from 'react';

// ── Stock Out Table Component ─────────────────────────────────────────────────
// Shows all items that have stock out movements (sold or damaged)
// Nested structure: Category → Product → Variants → Movement History

export function StockOutTable({ inventory, onExpandBatch, expandedBatches = new Set(), onExpandCategory, expandedCategories, onExpandProduct, expandedProducts = new Set(), dateFilter = 'all', selectedCategory = '', customDateFrom = '', customDateTo = '' }) {
  const [searchQuery, setSearchQuery] = useState('');

  // Calculate date range based on filter
  const dateRange = useMemo(() => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    if (dateFilter === 'today') {
      return { start: today, end: now };
    } else if (dateFilter === 'this-week') {
      const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
      return { start: weekAgo, end: now };
    } else if (dateFilter === 'this-month') {
      const monthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
      return { start: monthAgo, end: now };
    } else if (dateFilter === 'custom' && customDateFrom && customDateTo) {
      const from = new Date(customDateFrom);
      from.setHours(0, 0, 0, 0);
      const to = new Date(customDateTo);
      to.setHours(23, 59, 59, 999);
      return { start: from, end: to };
    }
    return { start: null, end: null }; // All time
  }, [dateFilter, customDateFrom, customDateTo]);

  // Group items by category and product - show ALL inventory items
  const groupedData = useMemo(() => {
    const items = inventory
      // Don't filter by isActive - show ALL items including archived (for historical reporting)
      // Only show items that have stock out movements (sold, damaged, or writeoff)
      .map(item => {
        // Calculate totals WITH date filter
        const totalStockOut = (item.batches || []).reduce((sum, batch) => {
          const batchStockOut = (batch.movements || [])
            .filter(m => {
              // Filter by type
              if (m.type !== 'sold' && m.type !== 'damaged' && m.type !== 'writeoff') return false;
              // Filter by date
              if (dateRange.start && (new Date(m.createdAt) < dateRange.start || new Date(m.createdAt) > dateRange.end)) return false;
              return true;
            })
            .reduce((s, m) => s + Math.abs(m.quantity), 0);
          return sum + batchStockOut;
        }, 0);

        const totalSold = (item.batches || []).reduce((sum, batch) => {
          const batchSold = (batch.movements || [])
            .filter(m => {
              if (m.type !== 'sold') return false;
              if (dateRange.start && (new Date(m.createdAt) < dateRange.start || new Date(m.createdAt) > dateRange.end)) return false;
              return true;
            })
            .reduce((s, m) => s + Math.abs(m.quantity), 0);
          return sum + batchSold;
        }, 0);

        const totalDamaged = (item.batches || []).reduce((sum, batch) => {
          const batchDamaged = (batch.movements || [])
            .filter(m => {
              if (m.type !== 'damaged') return false;
              if (dateRange.start && (new Date(m.createdAt) < dateRange.start || new Date(m.createdAt) > dateRange.end)) return false;
              return true;
            })
            .reduce((s, m) => s + Math.abs(m.quantity), 0);
          return sum + batchDamaged;
        }, 0);

        const totalWriteOff = (item.batches || []).reduce((sum, batch) => {
          const batchWriteOff = (batch.movements || [])
            .filter(m => {
              if (m.type !== 'writeoff') return false;
              if (dateRange.start && (new Date(m.createdAt) < dateRange.start || new Date(m.createdAt) > dateRange.end)) return false;
              return true;
            })
            .reduce((s, m) => s + Math.abs(m.quantity), 0);
          return sum + batchWriteOff;
        }, 0);

        return {
          ...item,
          totalStockOut,
          totalSold,
          totalDamaged,
          totalWriteOff,
        };
      });

    // Group by SKU to merge duplicate items with same SKU
    // This handles the case where user created multiple inventory items with same SKU
    const uniqueItemsMap = new Map();
    
    items.forEach(item => {
      if (!uniqueItemsMap.has(item.sku)) {
        uniqueItemsMap.set(item.sku, { 
          ...item,
          allIds: [item.id] // Track all IDs that contributed
        });
      } else {
        // Merge stock and batches from duplicate SKU items
        const existing = uniqueItemsMap.get(item.sku);
        existing.stockQty = (existing.stockQty || 0) + (item.stockQty || 0);
        existing.totalStockOut += item.totalStockOut || 0;
        existing.totalSold += item.totalSold || 0;
        existing.totalDamaged += item.totalDamaged || 0;
        existing.totalWriteOff += item.totalWriteOff || 0;
        
        // Merge batches
        if (item.batches && item.batches.length > 0) {
          const existingBatchIds = new Set(existing.batches.map(b => b.batchId));
          item.batches.forEach(batch => {
            if (!existingBatchIds.has(batch.batchId)) {
              existing.batches.push(batch);
            }
          });
        }
        existing.allIds.push(item.id);
      }
    });
    
    const uniqueItems = Array.from(uniqueItemsMap.values());

    // Group by category → product name
    const groups = {};
    uniqueItems.forEach(item => {
      // Filter by selected category (from parent component)
      if (selectedCategory && item.category !== selectedCategory) return;
      
      if (!groups[item.category]) {
        groups[item.category] = {};
      }
      // Use masterlistProductName if available (most reliable), fallback to name parsing
      const baseName = item.masterlistProductName || item.name.split(/\s+(?:White|Black|Red|Blue|Purple|Pink|Orange|Yellow|Green|Cyan|Magenta|Navy|Gray|Grey|Brown|Beige|Gold|Silver|Bronze)\s*\/\s*\d+/i)[0].trim();
      if (!groups[item.category][baseName]) {
        groups[item.category][baseName] = [];
      }
      groups[item.category][baseName].push(item);
    });

    return groups;
  }, [inventory, selectedCategory]);

  if (Object.keys(groupedData).length === 0) {
    return (
      <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--gray)', fontSize: '0.9rem' }}>
        <div style={{ marginBottom: '1rem' }}>
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ margin: '0 auto', opacity: 0.5 }}>
            <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
          </svg>
        </div>
        <h3 style={{ margin: '0 0 0.5rem 0', color: 'var(--white)', fontSize: '1.1rem' }}>No Stock Out Items</h3>
        <p style={{ margin: 0, color: 'var(--gray)', fontSize: '0.85rem' }}>
          Items with sold or damaged movements will appear here.
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Separate container per category */}
      {Object.entries(groupedData).map(([categoryName, products]) => {
        // Default: all categories expanded (no collapse functionality in Stock Out view)
        const isCategoryExpanded = true;

        // Calculate category totals
        const allItems = Object.values(products).flat();
        const catCurrentStock = allItems.reduce((sum, i) => sum + (i.stockQty || 0), 0);
        const catTotalStockOut = allItems.reduce((sum, i) => sum + i.totalStockOut, 0);
        const catTotalSold = allItems.reduce((sum, i) => sum + i.totalSold, 0);
        const catTotalDamaged = allItems.reduce((sum, i) => sum + i.totalDamaged, 0);
        const catTotalWriteOff = allItems.reduce((sum, i) => sum + i.totalWriteOff, 0);

        return (
          <div key={categoryName} style={{
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '12px',
            overflow: 'hidden'
          }}>
            {/* Category Header */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '50px 1fr 120px 120px 120px 120px 120px',
                alignItems: 'center',
                padding: '1rem 1.25rem',
                background: 'rgba(0,0,0,0.3)',
                borderBottom: '1px solid rgba(255,255,255,0.1)',
                cursor: 'default',
                userSelect: 'none'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#D4A843" strokeWidth="2"
                  style={{ transform: 'rotate(90deg)' }}>
                  <path d="M9 18l6-6-6-6"/>
                </svg>
              </div>
              <div style={{ fontWeight: 700, color: '#D4A843', fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{categoryName}</div>
              <div style={{ textAlign: 'center', fontWeight: 700, fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--gray)' }}>Current Stock</div>
              <div style={{ textAlign: 'center', fontWeight: 700, fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--gray)' }}>Total Stock Out</div>
              <div style={{ textAlign: 'center', fontWeight: 700, fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--gray)' }}>Sold</div>
              <div style={{ textAlign: 'center', fontWeight: 700, fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--gray)' }}>Damaged</div>
              <div style={{ textAlign: 'center', fontWeight: 700, fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--gray)' }}>Write Off</div>
            </div>

            {/* Products under this category */}
            {isCategoryExpanded && (
              <div style={{ padding: '0.75rem' }}>
                {Object.entries(products).map(([productName, variants]) => {
                    const isProductExpanded = expandedProducts.has(productName);
                    const productItems = variants;
                    const prodCurrentStock = productItems.reduce((sum, i) => sum + (i.stockQty || 0), 0);
                    const prodTotalStockOut = productItems.reduce((sum, i) => sum + i.totalStockOut, 0);
                    const prodTotalSold = productItems.reduce((sum, i) => sum + i.totalSold, 0);
                    const prodTotalDamaged = productItems.reduce((sum, i) => sum + i.totalDamaged, 0);
                    const prodTotalWriteOff = productItems.reduce((sum, i) => sum + i.totalWriteOff, 0);

                    return (
                      <React.Fragment key={productName}>
                        {/* Product Row */}
                        <div
                          onClick={() => onExpandProduct && onExpandProduct(productName)}
                          style={{
                            display: 'grid',
                            gridTemplateColumns: '50px 1fr 120px 120px 120px 120px 120px',
                            alignItems: 'center',
                            padding: '0.75rem 1rem',
                            background: 'rgba(255,255,255,0.015)',
                            borderBottom: '1px solid rgba(255,255,255,0.04)',
                            cursor: 'pointer',
                            userSelect: 'none'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={isProductExpanded ? '#D4A843' : 'var(--gray)'} strokeWidth="2"
                              style={{ transition: 'transform 0.2s', transform: isProductExpanded ? 'rotate(90deg)' : 'none' }}>
                              <path d="M9 18l6-6-6-6"/>
                            </svg>
                          </div>
                          <div style={{ fontWeight: 600, color: '#E5E2E1', fontSize: '0.85rem' }}>{productName}</div>
                          <div style={{ textAlign: 'center', fontWeight: 600, color: '#E5E2E1', fontSize: '0.85rem' }}>{prodCurrentStock} pcs</div>
                          <div style={{ textAlign: 'center', fontWeight: 600, color: '#D4A843', fontSize: '0.85rem' }}>{prodTotalStockOut} pcs</div>
                          <div style={{ textAlign: 'center', fontWeight: 600, color: '#E5E2E1', fontSize: '0.85rem' }}>{prodTotalSold} pcs</div>
                          <div style={{ textAlign: 'center', fontWeight: 600, color: '#E5E2E1', fontSize: '0.85rem' }}>{prodTotalDamaged} pcs</div>
                          <div style={{ textAlign: 'center', fontWeight: 600, color: '#E5E2E1', fontSize: '0.85rem' }}>{prodTotalWriteOff} pcs</div>
                        </div>

                        {/* Variants under this product */}
                        {isProductExpanded && (
                          <div>
                            {productItems.map((item, idx) => {
                              const expandKey = item.id;
                              const isExpanded = expandedBatches.has(expandKey);

                              return (
                                <React.Fragment key={item.id}>
                                  <div style={{
                                display: 'grid',
                                gridTemplateColumns: '50px 1fr 120px 120px 120px 120px 120px',
                                alignItems: 'center',
                                padding: '0.75rem 1rem',
                                background: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)',
                                borderBottom: '1px solid rgba(255,255,255,0.04)',
                              }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', paddingLeft: '1rem' }}>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onExpandBatch(expandKey);
                                    }}
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.25rem', color: isExpanded ? '#D4A843' : 'var(--gray)' }}
                                  >
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                                      style={{ transition: 'transform 0.2s', transform: isExpanded ? 'rotate(90deg)' : 'none' }}>
                                      <path d="M9 18l6-6-6-6"/>
                                    </svg>
                                  </button>
                                </div>
                                <div>
                                  {/* Show variant combo if available, otherwise extract from name */}
                                  <div style={{ fontWeight: 600, color: '#E5E2E1', fontSize: '0.8rem' }}>
                                    {item.variantCombo 
                                      ? Object.values(item.variantCombo).join(' / ')
                                      : item.name.replace(item.masterlistProductName || '', '').trim() || item.name
                                    }
                                  </div>
                                  <div style={{ fontSize: '0.65rem', color: 'var(--gray)', fontFamily: 'monospace', marginTop: '0.2rem' }}>{item.sku}</div>
                                </div>
                                <div style={{ textAlign: 'center', fontWeight: 600, color: '#E5E2E1', fontSize: '0.8rem' }}>{item.stockQty} pcs</div>
                                <div style={{ textAlign: 'center', fontWeight: 600, color: '#E5E2E1', fontSize: '0.8rem' }}>{item.totalStockOut} pcs</div>
                                <div style={{ textAlign: 'center', fontWeight: 600, color: '#E5E2E1', fontSize: '0.8rem' }}>{item.totalSold} pcs</div>
                                <div style={{ textAlign: 'center', fontWeight: 600, color: '#E5E2E1', fontSize: '0.8rem' }}>{item.totalDamaged} pcs</div>
                                <div style={{ textAlign: 'center', fontWeight: 600, color: '#E5E2E1', fontSize: '0.8rem' }}>{item.totalWriteOff} pcs</div>
                              </div>

                              {/* Expanded Row - Batch Details */}
                              {isExpanded && (
                                <div style={{ padding: '1rem 1.5rem', background: 'rgba(255,255,255,0.02)' }}>
                                  {/* Check if there are any movements */}
                                  {(() => {
                                    const hasMovements = (item.batches || []).some(b =>
                                      (b.movements || []).some(m =>
                                        (m.type === 'sold' || m.type === 'damaged' || m.type === 'writeoff') &&
                                        (!dateRange.start || (new Date(m.createdAt) >= dateRange.start && new Date(m.createdAt) <= dateRange.end))
                                      )
                                    );

                                    if (!hasMovements) {
                                      return (
                                        <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--gray)', fontSize: '0.875rem' }}>
                                          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ margin: '0 auto 1rem', opacity: 0.3 }}>
                                            <path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
                                          </svg>
                                          <p>No stock out movements recorded yet.</p>
                                          <p style={{ fontSize: '0.75rem', marginTop: '0.5rem' }}>Sales, damages, and write-offs will appear here.</p>
                                        </div>
                                      );
                                    }

                                    return (
                                      <>
                                        <div style={{ fontSize: '0.7rem', color: 'var(--gray)', textTransform: 'uppercase', marginBottom: '0.75rem', fontWeight: 600 }}>
                                          Movement History by Batch
                                        </div>
                                        <div style={{
                                          border: '1px solid var(--border)',
                                          borderRadius: '8px',
                                          overflow: 'hidden',
                                          maxHeight: '280px',
                                          overflowY: 'auto',
                                        }}>
                                          <table style={{ width: '100%', fontSize: '0.8rem' }}>
                                            <thead style={{ position: 'sticky', top: 0, background: 'rgba(0,0,0,0.97)', zIndex: 2 }}>
                                              <tr style={{ background: 'rgba(0,0,0,0.3)', borderBottom: '1px solid var(--border)' }}>
                                                <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left', color: 'var(--gray)', fontWeight: 600 }}>Batch ID</th>
                                                <th style={{ padding: '0.5rem 0.75rem', textAlign: 'center', color: 'var(--gray)', fontWeight: 600 }}>Date</th>
                                                <th style={{ padding: '0.5rem 0.75rem', textAlign: 'center', color: 'var(--gray)', fontWeight: 600 }}>Type</th>
                                                <th style={{ padding: '0.5rem 0.75rem', textAlign: 'center', color: 'var(--gray)', fontWeight: 600 }}>Qty</th>
                                                <th style={{ padding: '0.5rem 0.75rem', textAlign: 'center', color: 'var(--gray)', fontWeight: 600 }}>Remaining After</th>
                                                <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left', color: 'var(--gray)', fontWeight: 600 }}>Notes</th>
                                              </tr>
                                            </thead>
                                            <tbody>
                                              {(item.batches || []).flatMap(batch =>
                                                (batch.movements || [])
                                                  .filter(m => {
                                                    // Filter by type
                                                    if (m.type !== 'sold' && m.type !== 'damaged' && m.type !== 'writeoff') return false;
                                                    // Filter by date
                                                    if (!dateRange.start) return true;
                                                    const movementDate = new Date(m.createdAt);
                                                    return movementDate >= dateRange.start && movementDate <= dateRange.end;
                                                  })
                                                  .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)) // Newest first
                                                  .map((movement, mIdx) => {
                                                    // Fix: Remove double ₱ - check if reason already has ₱
                                                    const notes = movement.reason || '—';
                                                    const cleanNotes = notes.replace(/₱₱/g, '₱');
                                                    // Format date with time
                                                    const movementDateTime = new Date(movement.createdAt);
                                                    const dateStr = movementDateTime.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
                                                    const timeStr = movementDateTime.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' });

                                                    return (
                                                      <tr key={`${batch.batchId}-${mIdx}-${movement.type}`} style={{
                                                        borderBottom: '1px solid rgba(255,255,255,0.04)',
                                                        background: mIdx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)'
                                                      }}>
                                                        <td style={{ padding: '0.5rem 0.75rem', fontFamily: 'monospace', color: '#D4A843', fontWeight: 600 }}>
                                                          {batch.batchId}
                                                        </td>
                                                        <td style={{ padding: '0.5rem 0.75rem', textAlign: 'center', color: 'var(--gray)', fontSize: '0.75rem' }}>
                                                          <div style={{ color: 'var(--white)', fontSize: '0.8rem' }}>{dateStr}</div>
                                                          <div style={{ fontSize: '0.7rem' }}>{timeStr}</div>
                                                        </td>
                                                        <td style={{ padding: '0.5rem 0.75rem', textAlign: 'center' }}>
                                                          <span style={{
                                                            padding: '0.2rem 0.6rem',
                                                            borderRadius: '4px',
                                                            fontSize: '0.7rem',
                                                            fontWeight: 600,
                                                            background: 'rgba(255,255,255,0.1)',
                                                            color: '#E5E2E1'
                                                          }}>
                                                            {movement.type}
                                                          </span>
                                                        </td>
                                                        <td style={{ padding: '0.5rem 0.75rem', textAlign: 'center', fontWeight: 600, color: '#E5E2E1' }}>
                                                          {Math.abs(movement.quantity)} pcs
                                                        </td>
                                                        <td style={{ padding: '0.5rem 0.75rem', textAlign: 'center', color: 'var(--gray)', fontSize: '0.8rem' }}>
                                                          {movement.remainingAfter} pcs
                                                        </td>
                                                        <td style={{ padding: '0.5rem 0.75rem', textAlign: 'left', color: 'var(--gray)', fontSize: '0.8rem' }}>
                                                          {cleanNotes}
                                                        </td>
                                                      </tr>
                                                    );
                                                  })
                                              )}
                                            </tbody>
                                          </table>
                                        </div>
                                      </>
                                    );
                                  })()}
                                </div>
                              )}
                            </React.Fragment>
                          );
                        })}
                          </div>
                        )}
                      </React.Fragment>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
}

