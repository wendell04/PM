'use client';

import React, { useState, useMemo } from 'react';
import CustomDropdown from '@/app/components/CustomDropdown';

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

function IssueTypeBadge({ type }) {
  const ISSUE_TYPES = {
    damage:     { label: 'Damage',         color: '#ef4444', bg: 'rgba(239,68,68,0.1)',   border: 'rgba(239,68,68,0.2)' },
    scrap:      { label: 'Scrap',          color: '#f97316', bg: 'rgba(249,115,22,0.1)',  border: 'rgba(249,115,22,0.2)' },
    production: { label: 'Production Use', color: '#8b5cf6', bg: 'rgba(139,92,246,0.1)',  border: 'rgba(139,92,246,0.2)' },
    lost:       { label: 'Lost/Missing',   color: '#f59e0b', bg: 'rgba(245,158,11,0.1)',  border: 'rgba(245,158,11,0.2)' },
    adjustment: { label: 'Adjustment',     color: '#9ca3af', bg: 'rgba(156,163,175,0.1)', border: 'rgba(156,163,175,0.2)' },
  };
  const cfg = ISSUE_TYPES[type] || ISSUE_TYPES.adjustment;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
      padding: '0.2rem 0.6rem', borderRadius: '6px',
      fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em',
      background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}`,
    }}>
      {cfg.label}
    </span>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// STOCK-OUT HISTORY TAB — Nested Category → Material → Movements
// With Date Filters, Pagination, and Audit Trail
// ══════════════════════════════════════════════════════════════════════════════
export default function StockOutHistoryTab({ stockOuts, materials }) {
  const [search, setSearch]           = useState('');
  const [typeFilter, setTypeFilter]   = useState('');
  const [dateFilter, setDateFilter]   = useState('all');
  const [customDateFrom, setCustomDateFrom] = useState('');
  const [customDateTo, setCustomDateTo]     = useState('');
  const [expandedCategory, setExpandedCategory] = useState(new Set());
  const [expandedMaterial, setExpandedMaterial] = useState(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Calculate date range based on filter
  const dateRange = useMemo(() => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (dateFilter === 'today') return { start: today, end: now };
    if (dateFilter === 'week') { const d = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000); return { start: d, end: now }; }
    if (dateFilter === 'month') { const d = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000); return { start: d, end: now }; }
    if (dateFilter === 'year') { const d = new Date(today.getTime() - 365 * 24 * 60 * 60 * 1000); return { start: d, end: now }; }
    if (dateFilter === 'custom' && customDateFrom && customDateTo) {
      const from = new Date(customDateFrom); from.setHours(0, 0, 0, 0);
      const to = new Date(customDateTo); to.setHours(23, 59, 59, 999);
      return { start: from, end: to };
    }
    return { start: null, end: null };
  }, [dateFilter, customDateFrom, customDateTo]);

  // Filter and group stock-outs by category → material
  const groupedData = useMemo(() => {
    const filtered = stockOuts.filter(so => {
      const matchSearch = !search || (so.materialName || '').toLowerCase().includes(search.toLowerCase()) || (so.sku || '').toLowerCase().includes(search.toLowerCase());
      const matchType = !typeFilter || so.issueType === typeFilter;
      const matchDate = !dateRange.start || (new Date(so.dateIssued || so.createdAt) >= dateRange.start && new Date(so.dateIssued || so.createdAt) <= dateRange.end);
      return matchSearch && matchType && matchDate;
    }).sort((a, b) => new Date(b.dateIssued || b.createdAt) - new Date(a.dateIssued || a.createdAt));

    // Group by category
    const groups = {};
    filtered.forEach(so => {
      const mat = materials?.find(m => m.id === so.materialId);
      const category = mat?.category || so.category || 'Uncategorized';
      if (!groups[category]) groups[category] = {};
      if (!groups[category][so.materialName]) groups[category][so.materialName] = [];
      groups[category][so.materialName].push(so);
    });

    return groups;
  }, [stockOuts, materials, search, typeFilter, dateRange]);

  // Flatten for pagination
  const flatList = useMemo(() => {
    const items = [];
    Object.entries(groupedData).forEach(([cat, mats]) => {
      Object.entries(mats).forEach(([matName, records]) => {
        items.push({ category: cat, materialName: matName, records });
      });
    });
    return items;
  }, [groupedData]);

  const totalPages = Math.ceil(flatList.length / itemsPerPage);
  const paginatedItems = flatList.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  // Summary stats
  const summaryStats = useMemo(() => {
    const filtered = stockOuts.filter(so => {
      const matchDate = !dateRange.start || (new Date(so.dateIssued || so.createdAt) >= dateRange.start && new Date(so.dateIssued || so.createdAt) <= dateRange.end);
      return matchDate;
    });
    return {
      totalRecords: filtered.length,
      totalQty: filtered.reduce((s, so) => s + (so.quantity || 0), 0),
      totalLoss: filtered.reduce((s, so) => s + (so.totalLoss || 0), 0),
    };
  }, [stockOuts, dateRange]);

  const toggleCategory = (cat) => {
    setExpandedCategory(prev => {
      const next = new Set(prev);
      next.has(cat) ? next.delete(cat) : next.add(cat);
      return next;
    });
  };

  const toggleMaterial = (key) => {
    setExpandedMaterial(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  return (
    <div>
      {/* ── Summary Cards ── */}
      <div className="inventory-summary" style={{ marginBottom: '1.5rem' }}>
        <div className="summary-card" style={{ background: 'rgba(255,255,255,0.05)', borderColor: 'rgba(255,255,255,0.15)' }}>
          <div className="summary-content">
            <span className="summary-value" style={{ color: '#E5E2E1' }}>{summaryStats.totalRecords}</span>
            <span className="summary-label">Total Records</span>
          </div>
        </div>
        <div className="summary-card summary-card-danger">
          <div className="summary-content">
            <span className="summary-value">{summaryStats.totalQty} pcs</span>
            <span className="summary-label">Total Qty Deducted</span>
          </div>
        </div>
        <div className="summary-card" style={{ background: 'rgba(212,168,67,0.08)', borderColor: 'rgba(212,168,67,0.3)' }}>
          <div className="summary-content">
            <span className="summary-value" style={{ color: '#D4A843' }}>
              ₱{summaryStats.totalLoss.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            <span className="summary-label">Total Loss Value</span>
          </div>
        </div>
      </div>

      {/* ── Toolbar ── */}
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
          <input type="text" value={search} onChange={e => { setSearch(e.target.value); setCurrentPage(1); }}
            placeholder="Search stock-out records..."
            style={{ width: '100%', padding: '0.6rem 1rem 0.6rem 2.5rem', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border)', borderRadius: '8px', color: '#E5E2E1', outline: 'none' }} />
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--gray)', pointerEvents: 'none' }}>
            <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
          </svg>
        </div>
        <CustomDropdown
          value={typeFilter}
          onChange={(val) => { setTypeFilter(val); setCurrentPage(1); }}
          options={[
            { value: '', label: 'All Types' },
            { value: 'damage', label: 'Damage' },
            { value: 'scrap', label: 'Scrap' },
            { value: 'production', label: 'Production Use' },
            { value: 'lost', label: 'Lost/Missing' },
            { value: 'adjustment', label: 'Adjustment' },
          ]}
          placeholder="All Types"
          style={{ minWidth: '140px' }}
        />
        <CustomDropdown
          value={dateFilter}
          onChange={(val) => { setDateFilter(val); setCurrentPage(1); }}
          options={[
            { value: 'all', label: 'All Time' },
            { value: 'today', label: 'Today' },
            { value: 'week', label: 'This Week' },
            { value: 'month', label: 'This Month' },
            { value: 'year', label: 'This Year' },
            { value: 'custom', label: 'Custom Range' },
          ]}
          placeholder="All Time"
          style={{ minWidth: '140px' }}
        />
        {dateFilter === 'custom' && (
          <>
            <input type="date" value={customDateFrom} onChange={e => { setCustomDateFrom(e.target.value); setCurrentPage(1); }}
              style={{ padding: '0.6rem 0.75rem', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border)', borderRadius: '8px', color: '#E5E2E1', outline: 'none' }} />
            <input type="date" value={customDateTo} onChange={e => { setCustomDateTo(e.target.value); setCurrentPage(1); }}
              style={{ padding: '0.6rem 0.75rem', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border)', borderRadius: '8px', color: '#E5E2E1', outline: 'none' }} />
          </>
        )}
      </div>

      {/* ── Nested Table ── */}
      <div style={{ border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden', background: 'var(--dark)' }}>
        {Object.keys(groupedData).length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--gray)' }}>
            <div style={{ marginBottom: '1rem' }}>
              <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ margin: '0 auto', opacity: 0.5 }}>
                <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
              </svg>
            </div>
            <h3 style={{ margin: '0 0 0.5rem 0', color: 'var(--white)', fontSize: '1.1rem' }}>No Stock Out Items</h3>
            <p style={{ margin: 0, color: 'var(--gray)', fontSize: '0.85rem' }}>Items with stock-out movements will appear here.</p>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '1rem' }}>
              {paginatedItems.map(({ category, materialName, records }) => {
                const isCatExpanded = expandedCategory.has(category);
                const catTotalQty = records.reduce((s, r) => s + (r.quantity || 0), 0);
                const catTotalLoss = records.reduce((s, r) => s + (r.totalLoss || 0), 0);

                return (
                  <div key={category} style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', overflow: 'hidden' }}>
                    {/* Category Header */}
                    <div onClick={() => toggleCategory(category)}
                      style={{ display: 'grid', gridTemplateColumns: '40px 1fr 120px 120px 120px', alignItems: 'center', padding: '1rem 1.25rem', background: 'rgba(0,0,0,0.3)', cursor: 'pointer', userSelect: 'none' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <ChevronIcon open={isCatExpanded} />
                      </div>
                      <div style={{ fontWeight: 700, color: '#D4A843', fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{category}</div>
                      <div style={{ textAlign: 'center', fontWeight: 700, color: '#ef4444', fontSize: '0.85rem' }}>{catTotalQty} pcs</div>
                      <div style={{ textAlign: 'center', fontWeight: 700, color: '#D4A843', fontSize: '0.85rem' }}>₱{catTotalLoss.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</div>
                      <div style={{ textAlign: 'center', color: 'var(--gray)', fontSize: '0.75rem' }}>{records.length} records</div>
                    </div>

                    {/* Materials under category */}
                    {isCatExpanded && (
                      <div style={{ padding: '0.75rem' }}>
                        {Object.entries(groupedData[category]).map(([matName, matRecords]) => {
                          const matKey = `${category}-${matName}`;
                          const isMatExpanded = expandedMaterial.has(matKey);
                          const matTotalQty = matRecords.reduce((s, r) => s + (r.quantity || 0), 0);
                          const matTotalLoss = matRecords.reduce((s, r) => s + (r.totalLoss || 0), 0);

                          return (
                            <div key={matKey} style={{ marginBottom: '0.5rem' }}>
                              {/* Material Row */}
                              <div onClick={() => toggleMaterial(matKey)}
                                style={{ display: 'grid', gridTemplateColumns: '40px 1fr 100px 100px 100px', alignItems: 'center', padding: '0.75rem 1rem', background: 'rgba(255,255,255,0.015)', borderRadius: '8px', cursor: 'pointer', userSelect: 'none' }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                  <ChevronIcon open={isMatExpanded} />
                                </div>
                                <div style={{ fontWeight: 600, color: '#E5E2E1', fontSize: '0.85rem' }}>{matName}</div>
                                <div style={{ textAlign: 'center', fontWeight: 600, color: '#ef4444', fontSize: '0.8rem' }}>{matTotalQty} pcs</div>
                                <div style={{ textAlign: 'center', fontWeight: 600, color: '#D4A843', fontSize: '0.8rem' }}>₱{matTotalLoss.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</div>
                                <div style={{ textAlign: 'center', color: 'var(--gray)', fontSize: '0.7rem' }}>{matRecords.length} txns</div>
                              </div>

                              {/* Transaction Records */}
                              {isMatExpanded && (
                                <div style={{ marginTop: '0.5rem', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '8px', overflow: 'hidden' }}>
                                  <table style={{ width: '100%', fontSize: '0.78rem', borderCollapse: 'collapse' }}>
                                    <thead>
                                      <tr style={{ background: 'rgba(0,0,0,0.3)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                                        <th style={{ ...thStyle, width: '30px' }}></th>
                                        <th style={{ ...thStyle, textAlign: 'left' }}>Date</th>
                                        <th style={{ ...thStyle, textAlign: 'center' }}>Type</th>
                                        <th style={{ ...thStyle, textAlign: 'center' }}>Qty</th>
                                        <th style={{ ...thStyle, textAlign: 'right' }}>Loss</th>
                                        <th style={{ ...thStyle, textAlign: 'center' }}>Performed By</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {matRecords.map((so, idx) => (
                                        <tr key={so.id} style={{ background: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                          <td style={{ padding: '0.5rem 0.5rem', textAlign: 'center' }}>
                                            <ChevronIcon open={false} />
                                          </td>
                                          <td style={{ padding: '0.5rem 0.75rem', color: 'var(--gray)', fontSize: '0.75rem' }}>
                                            {new Date(so.dateIssued || so.createdAt).toLocaleDateString('en-PH')}
                                          </td>
                                          <td style={{ padding: '0.5rem 0.75rem', textAlign: 'center' }}><IssueTypeBadge type={so.issueType} /></td>
                                          <td style={{ padding: '0.5rem 0.75rem', textAlign: 'center', fontWeight: 700, color: '#ef4444' }}>-{so.quantity} {so.uom || 'pcs'}</td>
                                          <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right', color: '#ef4444', fontWeight: 600, fontFamily: 'monospace' }}>₱{(so.totalLoss || 0).toFixed(2)}</td>
                                          <td style={{ padding: '0.5rem 0.75rem', textAlign: 'center', color: '#E5E2E1', fontSize: '0.75rem' }}>{so.performedBy || 'Unknown'}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

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
          </>
        )}
      </div>
    </div>
  );
}
