'use client';

import React, { useState, useMemo } from 'react';

// ── Stock Out Table Component ─────────────────────────────────────────────────
// Shows all items that have stock out movements (sold or damaged)
// Nested structure: Category → Product → Variants → Movement History

export function StockOutTable({ inventory, onExpandBatch, expandedBatches = new Set(), onExpandCategory, expandedCategories = new Set(), dateFilter = 'all' }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');

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
    }
    return { start: null, end: null }; // All time
  }, [dateFilter]);

  // Group items by category and product - show ALL inventory items
  const groupedData = useMemo(() => {
    const items = inventory
      .filter(item => item.isActive !== false)
      // Don't filter by movements - show ALL items
      .map(item => {
        const totalStockOut = (item.batches || []).reduce((sum, batch) => {
          const batchStockOut = (batch.movements || [])
            .filter(m => m.type === 'sold' || m.type === 'damaged' || m.type === 'writeoff')
            .reduce((s, m) => s + Math.abs(m.quantity), 0);
          return sum + batchStockOut;
        }, 0);

        const totalSold = (item.batches || []).reduce((sum, batch) => {
          const batchSold = (batch.movements || [])
            .filter(m => m.type === 'sold')
            .reduce((s, m) => s + Math.abs(m.quantity), 0);
          return sum + batchSold;
        }, 0);

        const totalDamaged = (item.batches || []).reduce((sum, batch) => {
          const batchDamaged = (batch.movements || [])
            .filter(m => m.type === 'damaged')
            .reduce((s, m) => s + Math.abs(m.quantity), 0);
          return sum + batchDamaged;
        }, 0);

        const totalWriteOff = (item.batches || []).reduce((sum, batch) => {
          const batchWriteOff = (batch.movements || [])
            .filter(m => m.type === 'writeoff')
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

    // Group by category → product name
    const groups = {};
    items.forEach(item => {
      if (!groups[item.category]) {
        groups[item.category] = {};
      }
      const baseName = item.name.split(/\s+(?:White|Black|Red|Blue|Purple|Pink|Orange|Yellow|Green|Cyan|Magenta|Navy|Gray|Grey|Brown|Beige|Gold|Silver|Bronze)\s*\/\s*\d+/i)[0].trim();
      if (!groups[item.category][baseName]) {
        groups[item.category][baseName] = [];
      }
      groups[item.category][baseName].push(item);
    });

    return groups;
  }, [inventory]);

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
    <div>
      {/* Table */}
      <div style={{ border: '1px solid var(--border)', borderRadius: '10px', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
          <thead>
            <tr style={{ background: 'rgba(0,0,0,0.3)', borderBottom: '2px solid var(--border)' }}>
              <th style={{ padding: '0.875rem', textAlign: 'left', color: 'var(--gray)', fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.08em', width: '40px' }}></th>
              <th style={{ padding: '0.875rem', textAlign: 'left', color: 'var(--gray)', fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Name</th>
              <th style={{ padding: '0.875rem', textAlign: 'center', color: 'var(--gray)', fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Current Stock</th>
              <th style={{ padding: '0.875rem', textAlign: 'center', color: 'var(--gray)', fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Stock Out</th>
              <th style={{ padding: '0.875rem', textAlign: 'center', color: 'var(--gray)', fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Sold</th>
              <th style={{ padding: '0.875rem', textAlign: 'center', color: 'var(--gray)', fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Damaged</th>
              <th style={{ padding: '0.875rem', textAlign: 'center', color: 'var(--gray)', fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Write-Off</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(groupedData).map(([categoryName, products]) => {
              const isCategoryExpanded = expandedCategories.has(categoryName);
              
              // Flatten all items under this category
              const allItems = Object.values(products).flat();
              const catCurrentStock = allItems.reduce((sum, i) => sum + (i.stockQty || 0), 0);
              const catTotalStockOut = allItems.reduce((sum, i) => sum + i.totalStockOut, 0);
              const catTotalSold = allItems.reduce((sum, i) => sum + i.totalSold, 0);
              const catTotalDamaged = allItems.reduce((sum, i) => sum + i.totalDamaged, 0);
              const catTotalWriteOff = allItems.reduce((sum, i) => sum + i.totalWriteOff, 0);
              
              return (
                <React.Fragment key={categoryName}>
                  {/* Category Row */}
                  <tr style={{ background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    <td style={{ padding: '0.875rem', textAlign: 'center' }}>
                      <button
                        onClick={() => onExpandCategory && onExpandCategory(categoryName)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.25rem', color: isCategoryExpanded ? '#D4A843' : 'var(--gray)' }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                          style={{ transition: 'transform 0.2s', transform: isCategoryExpanded ? 'rotate(90deg)' : 'none' }}>
                          <path d="M9 18l6-6-6-6"/>
                        </svg>
                      </button>
                    </td>
                    <td style={{ padding: '0.875rem' }}>
                      <div style={{ fontWeight: 700, color: '#D4A843', fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{categoryName}</div>
                    </td>
                    <td style={{ padding: '0.875rem', textAlign: 'center' }}>
                      <span style={{ fontWeight: 600, color: '#E5E2E1', fontSize: '0.9rem' }}>
                        {catCurrentStock} pcs
                      </span>
                    </td>
                    <td style={{ padding: '0.875rem', textAlign: 'center' }}>
                      <span style={{ fontWeight: 700, color: '#D4A843', fontSize: '0.9rem' }}>
                        {catTotalStockOut} pcs
                      </span>
                    </td>
                    <td style={{ padding: '0.875rem', textAlign: 'center' }}>
                      <span style={{ fontWeight: 600, color: '#D4A843', fontSize: '0.9rem' }}>
                        {catTotalSold} pcs
                      </span>
                    </td>
                    <td style={{ padding: '0.875rem', textAlign: 'center' }}>
                      <span style={{ fontWeight: 600, color: '#D4A843', fontSize: '0.9rem' }}>
                        {catTotalDamaged} pcs
                      </span>
                    </td>
                    <td style={{ padding: '0.875rem', textAlign: 'center' }}>
                      <span style={{ fontWeight: 600, color: '#D4A843', fontSize: '0.9rem' }}>
                        {catTotalWriteOff} pcs
                      </span>
                    </td>
                  </tr>
                  
                  {/* Variants under this category (directly, no product grouping) */}
                  {isCategoryExpanded && allItems.map((item, idx) => {
                    const expandKey = item.id;
                    const isExpanded = expandedBatches.has(expandKey);
                    
                    return (
                      <React.Fragment key={item.id}>
                        <tr style={{
                          background: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)',
                          borderBottom: '1px solid rgba(255,255,255,0.06)',
                        }}>
                          <td style={{ padding: '0.875rem', textAlign: 'center' }}>
                            <button
                              onClick={() => onExpandBatch(expandKey)}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.25rem', color: isExpanded ? '#D4A843' : 'var(--gray)' }}
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                                style={{ transition: 'transform 0.2s', transform: isExpanded ? 'rotate(90deg)' : 'none' }}>
                                <path d="M9 18l6-6-6-6"/>
                              </svg>
                            </button>
                          </td>
                          <td style={{ padding: '0.875rem' }}>
                            <div style={{ fontWeight: 600, color: '#E5E2E1', fontSize: '0.85rem' }}>{item.name}</div>
                            <div style={{ fontSize: '0.7rem', color: 'var(--gray)', fontFamily: 'monospace', marginTop: '0.25rem' }}>{item.sku}</div>
                          </td>
                          <td style={{ padding: '0.875rem', textAlign: 'center' }}>
                            <span style={{ fontWeight: 600, color: '#E5E2E1', fontSize: '0.85rem' }}>
                              {item.stockQty} pcs
                            </span>
                          </td>
                          <td style={{ padding: '0.875rem', textAlign: 'center' }}>
                            <span style={{ fontWeight: 700, color: '#E5E2E1', fontSize: '0.85rem' }}>
                              {item.totalStockOut} pcs
                            </span>
                          </td>
                          <td style={{ padding: '0.875rem', textAlign: 'center' }}>
                            <span style={{ fontWeight: 600, color: '#E5E2E1', fontSize: '0.85rem' }}>
                              {item.totalSold} pcs
                            </span>
                          </td>
                          <td style={{ padding: '0.875rem', textAlign: 'center' }}>
                            <span style={{ fontWeight: 600, color: '#E5E2E1', fontSize: '0.85rem' }}>
                              {item.totalDamaged} pcs
                            </span>
                          </td>
                          <td style={{ padding: '0.875rem', textAlign: 'center' }}>
                            <span style={{ fontWeight: 600, color: '#E5E2E1', fontSize: '0.85rem' }}>
                              {item.totalWriteOff} pcs
                            </span>
                          </td>
                        </tr>

                        {/* Expanded Row - Batch Details */}
                        {isExpanded && (
                          <tr>
                            <td colSpan={7} style={{ padding: 0, background: 'rgba(255,255,255,0.02)' }}>
                              <div style={{ padding: '1rem 1.5rem' }}>
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
                                              <tr key={`${batch.batchId}-${mIdx}`} style={{
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
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
