'use client';

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { formatPrice, formatNumber } from '../../../../src/utils/format';

// ──────────────────────────────────────────────────────────────────────────────
// SUPPLIER DETAILS MODAL (View Supplier - Grouped by Invoice)
// ──────────────────────────────────────────────────────────────────────────────
export function SupplierDetailsModal({ isOpen, onClose, supplier, inventory }) {
  const [activeTab, setActiveTab] = useState('transactions');
  const [dateFilter, setDateFilter] = useState('all');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [showDateDrop, setShowDateDrop] = useState(false);
  const [expandedInvoices, setExpandedInvoices] = useState(new Set());
  const [expandedProducts, setExpandedProducts] = useState(new Set());
  const dateRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setActiveTab('transactions');
      setDateFilter('all');
      setExpandedInvoices(new Set());
      setExpandedProducts(new Set());
      setCustomFrom('');
      setCustomTo('');
    }
  }, [isOpen]);

  useEffect(() => {
    const h = (e) => {
      if (dateRef.current && !dateRef.current.contains(e.target)) setShowDateDrop(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  // ── Derive all batches from this supplier ──────────────────────────────────
  const allBatches = useMemo(() => {
    if (!supplier) return [];
    const batches = [];
    inventory.forEach(item => {
      (item.batches || []).forEach(batch => {
        if (batch.supplierId === supplier.id || batch.supplierName === supplier.name) {
          batches.push({
            ...batch,
            itemName: item.name,
            itemCategory: item.category,
            itemId: item.id,
            sku: item.sku,
            variantCombo: item.variantCombo
          });
        }
      });
    });
    return batches.sort((a, b) => new Date(b.dateReceived) - new Date(a.dateReceived));
  }, [inventory, supplier]);

  // ── Date filter logic ──────────────────────────────────────────────────────
  const filterByDate = (batches) => {
    const now = new Date();
    const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
    return batches.filter(b => {
      const d = new Date(b.dateReceived);
      if (dateFilter === 'today') return d >= startOfDay(now);
      if (dateFilter === 'this-week') {
        const weekStart = new Date(now);
        weekStart.setDate(now.getDate() - now.getDay());
        return d >= startOfDay(weekStart);
      }
      if (dateFilter === 'this-month')
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      if (dateFilter === 'custom' && customFrom && customTo) {
        const from = new Date(customFrom);
        const to = new Date(customTo);
        to.setHours(23,59,59);
        return d >= from && d <= to;
      }
      // 'all' or no filter - return all batches
      return true;
    });
  };

  // ── Group batches by invoice ───────────────────────────────────────────────
  const groupedByInvoice = useMemo(() => {
    const filtered = filterByDate(allBatches);
    const groups = new Map();
    
    filtered.forEach(batch => {
      const invoiceKey = batch.invoiceNumber 
        ? `${batch.invoiceNumber}-${batch.dateReceived}` 
        : `${batch.batchId}-${batch.dateReceived}`;
      
      if (!groups.has(invoiceKey)) {
        groups.set(invoiceKey, {
          invoiceNumber: batch.invoiceNumber || 'N/A',
          dateReceived: batch.dateReceived,
          supplierName: batch.supplierName,
          batches: [],
          totalQty: 0,
          totalCost: 0,
          items: new Map()
        });
      }
      
      const group = groups.get(invoiceKey);
      group.batches.push(batch);
      group.totalQty += batch.originalQty || 0;
      group.totalCost += batch.totalCost || (batch.unitCost * batch.originalQty) || 0;
      
      const itemKey = batch.itemName;
      if (!group.items.has(itemKey)) {
        group.items.set(itemKey, {
          itemName: batch.itemName,
          itemCategory: batch.itemCategory,
          sku: batch.sku,
          variantCombo: batch.variantCombo,
          qty: 0,
          unitCost: batch.unitCost,
          totalCost: 0
        });
      }
      
      const item = group.items.get(itemKey);
      item.qty += batch.originalQty || 0;
      item.totalCost += batch.totalCost || (batch.unitCost * batch.originalQty) || 0;
    });
    
    return Array.from(groups.values()).sort(
      (a, b) => new Date(b.dateReceived) - new Date(a.dateReceived)
    );
  }, [allBatches, dateFilter, customFrom, customTo]);

  // ── Toggle invoice expansion ───────────────────────────────────────────────
  const toggleExpand = (invoiceKey) => {
    setExpandedInvoices(prev => {
      const next = new Set(prev);
      if (next.has(invoiceKey)) {
        next.delete(invoiceKey);
      } else {
        next.add(invoiceKey);
      }
      return next;
    });
  };

  // ── Summary stats ──────────────────────────────────────────────────────────
  const totalSpent = allBatches.reduce((s, b) => s + (b.totalCost || b.unitCost * b.originalQty || 0), 0);
  const totalBatches = allBatches.length;
  const lastPurchase = allBatches.length > 0 ? allBatches[0].dateReceived : null;
  const totalItems = allBatches.reduce((s, b) => s + (b.originalQty || 0), 0);

  const tabStyle = (tab) => ({
    padding: '0.5rem 1rem',
    fontSize: '0.8rem',
    fontWeight: 600,
    cursor: 'pointer',
    borderRadius: '6px',
    border: 'none',
    background: activeTab === tab ? 'var(--gold)' : 'transparent',
    color: activeTab === tab ? '#000' : 'var(--gray)',
    transition: 'all 0.15s',
  });

  // NOW do the early return (after all hooks)
  if (!isOpen || !supplier) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content" onClick={e => e.stopPropagation()}
        style={{ maxWidth: '900px', width: '95%', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>

        {/* Header */}
        <div className="modal-header" style={{ flexShrink: 0 }}>
          <div>
            <h2 className="modal-title">{supplier.name}</h2>
            <div style={{ fontSize: '0.75rem', color: 'var(--gray)', marginTop: '0.2rem' }}>
              {supplier.categories?.length > 0 ? supplier.categories.join(', ') : 'General — all categories'}
            </div>
          </div>
          <button className="modal-close" onClick={onClose}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <div className="modal-body" style={{ flex: 1, overflowY: 'auto' }}>

          {/* Contact info strip */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '0.75rem', padding: '0.875rem 1rem', background: 'rgba(0,0,0,0.2)', borderRadius: '8px', marginBottom: '1.25rem' }}>
            {[
              ['Contact Person', supplier.contact || '—'],
              ['Phone', supplier.phone || '—'],
              ['Address', supplier.address || '—'],
            ].map(([label, val]) => (
              <div key={label}>
                <div style={{ fontSize: '0.68rem', color: 'var(--gray)', textTransform: 'uppercase', marginBottom: '0.3rem' }}>{label}</div>
                <div style={{ fontWeight: 600, color: 'var(--white)', fontSize: '0.875rem' }}>{val}</div>
              </div>
            ))}
          </div>

          {/* Summary cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.75rem', marginBottom: '1.25rem' }}>
            {[
              ['Total Spent', `₱${formatPrice(totalSpent)}`, '#facc15'],
              ['Purchases', `${totalBatches} batch${totalBatches !== 1 ? 'es' : ''}`, 'var(--gold)'],
              ['Items Received', `${formatNumber(totalItems)} pcs`, 'var(--white)'],
            ].map(([label, val, color]) => (
              <div key={label} style={{ padding: '0.875rem', background: 'rgba(0,0,0,0.2)', borderRadius: '8px', textAlign: 'center' }}>
                <div style={{ fontSize: '0.68rem', color: 'var(--gray)', textTransform: 'uppercase', marginBottom: '0.4rem' }}>{label}</div>
                <div style={{ fontSize: '1rem', fontWeight: 700, color }}>{val}</div>
              </div>
            ))}
          </div>

          {/* Last purchase info */}
          {lastPurchase && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.25rem', fontSize: '0.8rem', color: 'var(--gray)' }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="4" width="18" height="18" rx="2"/>
                <line x1="16" y1="2" x2="16" y2="6"/>
                <line x1="8" y1="2" x2="8" y2="6"/>
                <line x1="3" y1="10" x2="21" y2="10"/>
              </svg>
              Last purchase: <strong style={{ color: 'var(--white)' }}>
                {new Date(lastPurchase).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })}
              </strong>
            </div>
          )}

          {groupedByInvoice.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--gray)', fontStyle: 'italic', fontSize: '0.875rem' }}>
              No purchase history yet for this supplier.
            </div>
          ) : (
            <>
              {/* Tab switcher */}
              <div style={{ display: 'flex', gap: '0.25rem', marginBottom: '1rem', background: 'rgba(0,0,0,0.2)', borderRadius: '8px', padding: '0.25rem', width: 'fit-content' }}>
                <button style={tabStyle('transactions')} onClick={() => setActiveTab('transactions')}>
                  Purchase Transactions
                </button>
                <button style={tabStyle('price-history')} onClick={() => setActiveTab('price-history')}>
                  Price History
                </button>
              </div>

              {/* ── TRANSACTIONS TAB (Grouped by Invoice) ──────────────────── */}
              {activeTab === 'transactions' && (
                <>
                  {/* Date filter */}
                  <div style={{ marginBottom: '1rem' }}>
                    <div ref={dateRef} style={{ position: 'relative', display: 'inline-block' }}>
                      <div onClick={() => setShowDateDrop(o => !o)}
                        style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.4rem 0.75rem', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border)', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem', color: 'var(--white)', userSelect: 'none', minWidth: '130px' }}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <rect x="3" y="4" width="18" height="18" rx="2"/>
                          <line x1="16" y1="2" x2="16" y2="6"/>
                          <line x1="8" y1="2" x2="8" y2="6"/>
                          <line x1="3" y1="10" x2="21" y2="10"/>
                        </svg>
                        <span style={{ flex: 1 }}>{{ 'all': 'All Time', 'today': 'Today', 'this-week': 'This Week', 'this-month': 'This Month', 'custom': 'Custom Range' }[dateFilter]}</span>
                        <span style={{ fontSize: '0.65rem', color: 'var(--gray)' }}>{showDateDrop ? '▲' : '▼'}</span>
                      </div>
                      {showDateDrop && (
                        <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 100, background: 'var(--dark2)', border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden', minWidth: '150px', boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}>
                          {[['all','All Time'],['today','Today'],['this-week','This Week'],['this-month','This Month'],['custom','Custom Range']].map(([val, label]) => (
                            <button key={val} type="button" onClick={() => { setDateFilter(val); setShowDateDrop(false); }}
                              style={{ display: 'block', width: '100%', padding: '0.6rem 1rem', textAlign: 'left', fontSize: '0.82rem', fontWeight: val===dateFilter?700:400, color: val===dateFilter?'var(--gold)':'var(--white)', background: val===dateFilter?'rgba(212,168,67,0.1)':'transparent', border: 'none', cursor: 'pointer' }}>
                              {label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    {/* Custom Date Range Inputs - shown outside dropdown */}
                    {dateFilter === 'custom' && (
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', marginLeft: '0.75rem' }}>
                        <div>
                          <input
                            type="date"
                            value={customFrom}
                            onChange={(e) => setCustomFrom(e.target.value)}
                            placeholder="From"
                            style={{
                              padding: '0.4rem 0.75rem',
                              fontSize: '0.8rem',
                              background: 'rgba(0,0,0,0.2)',
                              border: '1px solid var(--border)',
                              borderRadius: '6px',
                              color: 'var(--white)',
                              outline: 'none'
                            }}
                          />
                        </div>
                        <span style={{ color: 'var(--gray)', fontSize: '0.8rem' }}>to</span>
                        <div>
                          <input
                            type="date"
                            value={customTo}
                            onChange={(e) => setCustomTo(e.target.value)}
                            placeholder="To"
                            style={{
                              padding: '0.4rem 0.75rem',
                              fontSize: '0.8rem',
                              background: 'rgba(0,0,0,0.2)',
                              border: '1px solid var(--border)',
                              borderRadius: '6px',
                              color: 'var(--white)',
                              outline: 'none'
                            }}
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Grouped Invoice Table */}
                  <div style={{ border: '1px solid var(--border)', borderRadius: '10px', overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                      <thead>
                        <tr style={{ background: 'rgba(0,0,0,0.3)', borderBottom: '2px solid var(--border)' }}>
                          <th style={{ padding: '0.75rem', textAlign: 'left', color: 'var(--gray)', fontWeight: 600, width: '40px' }}></th>
                          <th style={{ padding: '0.75rem', textAlign: 'left', color: 'var(--gray)', fontWeight: 600 }}>Invoice / OR</th>
                          <th style={{ padding: '0.75rem', textAlign: 'center', color: 'var(--gray)', fontWeight: 600 }}>Date</th>
                          <th style={{ padding: '0.75rem', textAlign: 'center', color: 'var(--gray)', fontWeight: 600 }}>Items</th>
                          <th style={{ padding: '0.75rem', textAlign: 'center', color: 'var(--gray)', fontWeight: 600 }}>Qty Received</th>
                          <th style={{ padding: '0.75rem', textAlign: 'right', color: 'var(--gray)', fontWeight: 600 }}>Total Paid</th>
                        </tr>
                      </thead>
                      <tbody>
                        {groupedByInvoice.map((invoice, idx) => {
                          const isExpanded = expandedInvoices.has(invoice.invoiceNumber + '-' + invoice.dateReceived);
                          const itemsArray = Array.from(invoice.items.values());
                          
                          return (
                            <React.Fragment key={invoice.invoiceNumber + '-' + invoice.dateReceived}>
                              {/* Main Invoice Row */}
                              <tr style={{ borderBottom: isExpanded ? 'none' : '1px solid rgba(255,255,255,0.05)' }}>
                                <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                                  <button
                                    onClick={() => toggleExpand(invoice.invoiceNumber + '-' + invoice.dateReceived)}
                                    style={{ background: 'none', border: 'none', color: 'var(--gray)', cursor: 'pointer', padding: '0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                  >
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                                      style={{ transition: 'transform 0.2s', transform: isExpanded ? 'rotate(90deg)' : 'none' }}>
                                      <path d="M9 18l6-6-6-6"/>
                                    </svg>
                                  </button>
                                </td>
                                <td style={{ padding: '0.75rem', color: 'var(--white)', fontWeight: 600, fontFamily: 'monospace' }}>
                                  {invoice.invoiceNumber}
                                </td>
                                <td style={{ padding: '0.75rem', textAlign: 'center', color: 'var(--gray)', fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                                  {new Date(invoice.dateReceived).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
                                </td>
                                <td style={{ padding: '0.75rem', textAlign: 'center', color: 'var(--white)', fontWeight: 600 }}>
                                  {itemsArray.length} item{itemsArray.length !== 1 ? 's' : ''}
                                </td>
                                <td style={{ padding: '0.75rem', textAlign: 'center', color: '#D4A843', fontWeight: 700 }}>
                                  {formatNumber(invoice.totalQty)} pcs
                                </td>
                                <td style={{ padding: '0.75rem', textAlign: 'right', color: '#facc15', fontWeight: 700, fontSize: '0.9rem' }}>
                                  ₱{formatPrice(invoice.totalCost)}
                                </td>
                              </tr>
                              
                              {/* Expanded Row - Items in this invoice */}
                              {isExpanded && (
                                <tr>
                                  <td colSpan={6} style={{ padding: '0', background: 'rgba(0,0,0,0.15)' }}>
                                    <div style={{ padding: '1rem 1.5rem' }}>
                                      <div style={{ fontSize: '0.7rem', color: 'var(--gray)', textTransform: 'uppercase', marginBottom: '0.75rem', fontWeight: 600 }}>
                                        Items in this purchase ({itemsArray.length})
                                      </div>
                                      <div style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', overflow: 'hidden' }}>
                                        <table style={{ width: '100%', fontSize: '0.8rem' }}>
                                          <thead>
                                            <tr style={{ background: 'rgba(0,0,0,0.2)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                                              <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left', color: 'var(--gray)', fontWeight: 600 }}>Item</th>
                                              <th style={{ padding: '0.5rem 0.75rem', textAlign: 'center', color: 'var(--gray)', fontWeight: 600 }}>Category</th>
                                              <th style={{ padding: '0.5rem 0.75rem', textAlign: 'center', color: 'var(--gray)', fontWeight: 600 }}>Qty</th>
                                              <th style={{ padding: '0.5rem 0.75rem', textAlign: 'right', color: 'var(--gray)', fontWeight: 600 }}>Unit Cost</th>
                                              <th style={{ padding: '0.5rem 0.75rem', textAlign: 'right', color: 'var(--gray)', fontWeight: 600 }}>Subtotal</th>
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {itemsArray.map((item, itemIdx) => (
                                              <tr key={itemIdx} style={{ borderBottom: itemIdx < itemsArray.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                                                <td style={{ padding: '0.625rem 0.75rem', color: 'var(--white)', fontWeight: 600 }}>
                                                  {item.itemName}
                                                  {item.variantCombo && (
                                                    <div style={{ fontSize: '0.7rem', color: 'var(--gray)', fontFamily: 'monospace', marginTop: '0.2rem' }}>
                                                      {Object.values(item.variantCombo).join(' / ')}
                                                    </div>
                                                  )}
                                                </td>
                                                <td style={{ padding: '0.625rem 0.75rem', textAlign: 'center', color: 'var(--gray)', fontSize: '0.75rem' }}>
                                                  {item.itemCategory}
                                                </td>
                                                <td style={{ padding: '0.625rem 0.75rem', textAlign: 'center', color: '#D4A843', fontWeight: 600 }}>
                                                  {formatNumber(item.qty)} pcs
                                                </td>
                                                <td style={{ padding: '0.625rem 0.75rem', textAlign: 'right', color: 'var(--gray)', fontSize: '0.8rem' }}>
                                                  ₱{formatPrice(item.unitCost)}
                                                </td>
                                                <td style={{ padding: '0.625rem 0.75rem', textAlign: 'right', color: '#facc15', fontWeight: 700 }}>
                                                  ₱{formatPrice(item.totalCost)}
                                                </td>
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                      </div>

                                      {/* Receipt Image Section */}
                                      {invoice.batches.some(b => b.receiptImage) && (
                                        <div style={{ marginTop: '1rem', padding: '0.75rem', background: 'rgba(0,0,0,0.2)', borderRadius: '8px' }}>
                                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#D4A843" strokeWidth="2">
                                              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                                              <polyline points="14 2 14 8 20 8"/>
                                            </svg>
                                            <span style={{ fontSize: '0.7rem', color: '#D4A843', fontWeight: 600, textTransform: 'uppercase' }}>Receipt</span>
                                          </div>
                                          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                            {invoice.batches.filter(b => b.receiptImage).map((batch, idx) => (
                                              <img 
                                                key={idx}
                                                src={batch.receiptImage} 
                                                alt="Receipt" 
                                                style={{ 
                                                  width: '80px', 
                                                  height: '80px', 
                                                  objectFit: 'cover', 
                                                  borderRadius: '6px',
                                                  border: '1px solid rgba(255,255,255,0.1)'
                                                }}
                                              />
                                            ))}
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}

              {/* ── PRICE HISTORY TAB ───────────────────────────────────── */}
              {activeTab === 'price-history' && (
                <div style={{ border: '1px solid var(--border)', borderRadius: '10px', overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                    <thead>
                      <tr style={{ background: 'rgba(0,0,0,0.3)', borderBottom: '2px solid var(--border)' }}>
                        <th style={{ padding: '0.75rem', textAlign: 'left', color: 'var(--gray)', fontWeight: 600, width: '40px' }}></th>
                        <th style={{ padding: '0.75rem', textAlign: 'left', color: 'var(--gray)', fontWeight: 600 }}>Product</th>
                        <th style={{ padding: '0.75rem', textAlign: 'center', color: 'var(--gray)', fontWeight: 600 }}>Purchases</th>
                        <th style={{ padding: '0.75rem', textAlign: 'right', color: 'var(--gray)', fontWeight: 600 }}>Current Price</th>
                        <th style={{ padding: '0.75rem', textAlign: 'right', color: 'var(--gray)', fontWeight: 600 }}>Change</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        // Group by product with variant - show ALL history (no date filter)
                        const productHistory = {};
                        const seenBatches = new Set();

                        allBatches.forEach(batch => {
                          const key = `${batch.itemCategory} — ${batch.itemName}`;

                          if (!productHistory[key]) {
                            productHistory[key] = [];
                          }

                          const batchUniqueKey = `${batch.batchId || ''}-${batch.dateReceived}-${batch.unitCost}-${batch.invoiceNumber || ''}`;

                          if (!seenBatches.has(batchUniqueKey)) {
                            seenBatches.add(batchUniqueKey);
                            productHistory[key].push({
                              date: batch.dateReceived,
                              cost: batch.unitCost,
                              invoice: batch.invoiceNumber,
                              qty: batch.originalQty
                            });
                          }
                        });

                        // Sort each product's history by date (oldest first)
                        Object.values(productHistory).forEach(arr => {
                          arr.sort((a, b) => new Date(a.date) - new Date(b.date));
                        });

                        const products = Object.entries(productHistory);

                        if (products.length === 0) {
                          return (
                            <tr>
                              <td colSpan={5} style={{ padding: '2rem', textAlign: 'center', color: 'var(--gray)', fontStyle: 'italic' }}>
                                No price history available.
                              </td>
                            </tr>
                          );
                        }

                        return products.map(([productKey, history], idx) => {
                          const currentPrice = history[history.length - 1]?.cost || 0;
                          const firstPrice = history[0]?.cost || 0;
                          // Calculate change from first purchase to current
                          const priceChange = firstPrice > 0 ? ((currentPrice - firstPrice) / firstPrice) * 100 : 0;
                          const isPriceUp = priceChange >= 0;

                          const dashIndex = productKey.indexOf(' — ');
                          const category = productKey.substring(0, dashIndex);
                          const productName = productKey.substring(dashIndex + 3);

                          const productKeyForExpand = `product-${idx}`;
                          const isExpanded = expandedProducts.has(productKeyForExpand);

                          return (
                            <React.Fragment key={idx}>
                              <tr style={{ borderBottom: isExpanded ? 'none' : '1px solid rgba(255,255,255,0.05)' }}>
                                <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                                  <button
                                    onClick={() => {
                                      const next = new Set(expandedProducts);
                                      if (next.has(productKeyForExpand)) {
                                        next.delete(productKeyForExpand);
                                      } else {
                                        next.add(productKeyForExpand);
                                      }
                                      setExpandedProducts(next);
                                    }}
                                    style={{ background: 'none', border: 'none', color: 'var(--gray)', cursor: 'pointer', padding: '0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                  >
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                                      style={{ transition: 'transform 0.2s', transform: isExpanded ? 'rotate(90deg)' : 'none' }}>
                                      <path d="M9 18l6-6-6-6"/>
                                    </svg>
                                  </button>
                                </td>
                                <td style={{ padding: '0.75rem', color: 'var(--white)', fontWeight: 600 }}>
                                  {productName}
                                  <div style={{ fontSize: '0.7rem', color: 'var(--gray)', fontWeight: 400, marginTop: '0.15rem' }}>
                                    {category}
                                  </div>
                                </td>
                                <td style={{ padding: '0.75rem', textAlign: 'center', color: 'var(--gray)', fontSize: '0.8rem' }}>
                                  {history.length} purchase{history.length !== 1 ? 's' : ''}
                                </td>
                                <td style={{ padding: '0.75rem', textAlign: 'right', color: '#facc15', fontWeight: 700 }}>
                                  ₱{formatPrice(currentPrice)}
                                </td>
                                <td style={{ padding: '0.75rem', textAlign: 'right' }}>
                                  {history.length > 1 && priceChange !== 0 ? (
                                    <span style={{
                                      fontSize: '0.75rem',
                                      fontWeight: 700,
                                      color: isPriceUp ? '#f87171' : '#4ade80',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'flex-end',
                                      gap: '0.25rem'
                                    }}>
                                      {isPriceUp ? (
                                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                                          <path d="M18 15l-6-6-6 6"/>
                                        </svg>
                                      ) : (
                                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                                          <path d="M6 9l6 6 6-6"/>
                                        </svg>
                                      )}
                                      {Math.abs(priceChange).toFixed(1)}%
                                    </span>
                                  ) : (
                                    <span style={{ fontSize: '0.75rem', color: 'var(--gray)' }}>—</span>
                                  )}
                                </td>
                              </tr>

                              {/* Expanded Row - Price History Chips */}
                              {isExpanded && (
                                <tr>
                                  <td colSpan={5} style={{ padding: '0', background: 'rgba(0,0,0,0.15)' }}>
                                    <div style={{ padding: '1rem 1.5rem' }}>
                                      <div style={{ fontSize: '0.7rem', color: 'var(--gray)', textTransform: 'uppercase', marginBottom: '0.75rem', fontWeight: 600 }}>
                                        Price History ({history.length} purchases)
                                      </div>
                                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                                        {history.map((h, hIdx) => {
                                          const isLatest = hIdx === history.length - 1;
                                          const prevPrice = hIdx > 0 ? history[hIdx - 1].cost : null;
                                          const changeFromPrev = prevPrice !== null ? h.cost - prevPrice : null;
                                          const isUp = changeFromPrev !== null && changeFromPrev > 0;
                                          const isDown = changeFromPrev !== null && changeFromPrev < 0;
                                          const hasChange = changeFromPrev !== null && changeFromPrev !== 0;

                                          return (
                                            <div key={hIdx} style={{
                                              display: 'flex',
                                              flexDirection: 'column',
                                              alignItems: 'center',
                                              padding: '0.5rem 0.75rem',
                                              background: isLatest ? 'rgba(212,168,67,0.1)' : 'rgba(255,255,255,0.05)',
                                              border: isLatest ? '1px solid var(--gold)' : '1px solid rgba(255,255,255,0.1)',
                                              borderRadius: '6px',
                                              minWidth: '80px'
                                            }}>
                                              <span style={{
                                                color: isLatest ? 'var(--gold)' : 'var(--white)',
                                                fontWeight: 700,
                                                fontSize: '0.85rem'
                                              }}>
                                                ₱{formatPrice(h.cost)}
                                              </span>
                                              {hasChange && (
                                                <span style={{
                                                  fontSize: '0.65rem',
                                                  fontWeight: 700,
                                                  color: isUp ? '#f87171' : '#4ade80',
                                                  marginTop: '0.2rem',
                                                  display: 'flex',
                                                  alignItems: 'center',
                                                  gap: '0.2rem'
                                                }}>
                                                  {isUp ? (
                                                    <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                                                      <path d="M18 15l-6-6-6 6"/>
                                                    </svg>
                                                  ) : (
                                                    <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                                                      <path d="M6 9l6 6 6-6"/>
                                                    </svg>
                                                  )}
                                                  ₱{formatPrice(Math.abs(changeFromPrev))}
                                                </span>
                                              )}
                                              <span style={{
                                                color: 'var(--gray)',
                                                fontSize: '0.65rem',
                                                marginTop: '0.25rem'
                                              }}>
                                                {new Date(h.date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}
                                              </span>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          );
                        });
                      })()}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>

        <div className="modal-actions" style={{ flexShrink: 0 }}>
          <button type="button" className="btn-secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// MANAGE SUPPLIERS MODAL (Supplier Management - Add/Edit/Delete)
// ──────────────────────────────────────────────────────────────────────────────
export function ManageSuppliersModal({ isOpen, onClose, suppliers, categories, inventory, onAdd, onUpdate, onDelete }) {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editingInUse, setEditingInUse] = useState(false);
  const [form, setForm] = useState({ name: '', contact: '', phone: '', address: '', categories: [] });
  const [infoModal, setInfoModal] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [viewingSupplier, setViewingSupplier] = useState(null);
  const [expandedSuppliers, setExpandedSuppliers] = useState(new Set());

  useEffect(() => {
    if (isOpen) { 
      setShowForm(false); 
      setEditingId(null); 
      setEditingInUse(false); 
      setViewingSupplier(null); 
      setForm({ name: '', contact: '', phone: '', address: '', categories: [] }); 
    }
  }, [isOpen]);

  const toggleExpand = (supplierId) => {
    setExpandedSuppliers(prev => {
      const next = new Set(prev);
      if (next.has(supplierId)) next.delete(supplierId);
      else next.add(supplierId);
      return next;
    });
  };

  const getSupplierItemsWithHistory = (supplier) => {
    const batches = inventory.flatMap(i => (i.batches || []).map(b => ({
      ...b,
      itemName: i.name,
      itemCategory: i.category,
      itemId: i.id
    }))).filter(b => b.supplierId === supplier.id || b.supplierName === supplier.name);

    const itemMap = new Map();
    batches.forEach(batch => {
      const key = batch.itemName;
      if (!itemMap.has(key)) {
        itemMap.set(key, {
          itemName: batch.itemName,
          itemCategory: batch.itemCategory,
          priceHistory: []
        });
      }
      itemMap.get(key).priceHistory.push({
        unitCost: batch.unitCost,
        dateReceived: batch.dateReceived,
        invoiceNumber: batch.invoiceNumber
      });
    });

    return Array.from(itemMap.values()).map(item => ({
      ...item,
      priceHistory: item.priceHistory
        .sort((a, b) => new Date(a.dateReceived) - new Date(b.dateReceived))
        .slice(-5)
    })).sort((a, b) => a.itemName.localeCompare(b.itemName));
  };

  const handleEdit = (supplier) => {
    const inUse = inventory.some(i => i.lastSupplierId === supplier.id && i.isActive !== false);
    setEditingId(supplier.id);
    setEditingInUse(inUse);
    setForm({ name: supplier.name, contact: supplier.contact||'', phone: supplier.phone||'', address: supplier.address||'', categories: supplier.categories||[] });
    setShowForm(true);
  };

  const handleDeleteClick = (supplier) => {
    const inUse = inventory.some(i => i.lastSupplierId === supplier.id && i.isActive !== false);
    if (inUse) {
      setInfoModal({ title: 'Cannot Delete Supplier', message: `"${supplier.name}" is linked to active inventory items. Update those items to a different supplier first.` });
      return;
    }
    setDeleteConfirm(supplier);
  };

  const handleSubmit = () => {
    if (!form.name.trim()) { setInfoModal({ title: 'Validation Error', message: 'Please enter a supplier name.' }); return; }
    if (!form.contact.trim()) { setInfoModal({ title: 'Validation Error', message: 'Please enter a contact person.' }); return; }
    const isDup = suppliers.some(s => s.name.toLowerCase() === form.name.trim().toLowerCase() && s.id !== editingId);
    if (isDup) { setInfoModal({ title: 'Duplicate Supplier', message: `"${form.name.trim()}" already exists.` }); return; }
    if (editingId) onUpdate(editingId, { ...form, name: form.name.trim() });
    else onAdd({ ...form, name: form.name.trim() });
    setShowForm(false); setEditingId(null); setEditingInUse(false);
    setForm({ name: '', contact: '', phone: '', address: '', categories: [] });
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '1100px', width: '95%' }}>
        <div className="modal-header">
          <h2 className="modal-title">Supplier Management</h2>
          <button className="modal-close" onClick={onClose}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>
        <div className="modal-body" style={{ maxHeight: '75vh', overflowY: 'auto' }}>
          {!showForm ? (
            <>
              <button type="button" className="btn-primary" onClick={() => setShowForm(true)} style={{ marginBottom: '1rem' }}>+ Add New Supplier</button>
              {suppliers.length > 0 ? (
                <div style={{ border: '1px solid var(--border)', borderRadius: '6px' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid var(--border)' }}>
                        <th style={{ padding: '0.75rem', textAlign: 'left', color: 'var(--gray)', fontWeight: 600, width: '40px' }}></th>
                        <th style={{ padding: '0.75rem', textAlign: 'left', color: 'var(--gray)', fontWeight: 600 }}>Name</th>
                        <th style={{ padding: '0.75rem', textAlign: 'center', color: 'var(--gray)', fontWeight: 600 }}>Contact</th>
                        <th style={{ padding: '0.75rem', textAlign: 'center', color: 'var(--gray)', fontWeight: 600 }}>Phone</th>
                        <th style={{ padding: '0.75rem', textAlign: 'center', color: 'var(--gray)', fontWeight: 600 }}>Total Spent</th>
                        <th style={{ padding: '0.75rem', textAlign: 'center', color: 'var(--gray)', fontWeight: 600 }}>Last Purchase</th>
                        <th style={{ padding: '0.75rem', textAlign: 'center', color: 'var(--gray)', fontWeight: 600 }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {suppliers.map(s => {
                        const isExpanded = expandedSuppliers.has(s.id);
                        const supplierItems = getSupplierItemsWithHistory(s);
                        const totalSpent = inventory.flatMap(i => i.batches||[])
                          .filter(b => b.supplierId===s.id || b.supplierName===s.name)
                          .reduce((sum, b) => sum + (b.totalCost || b.unitCost*(b.originalQty||0) || 0), 0);
                        const allBatches = inventory.flatMap(i => i.batches||[])
                          .filter(b => b.supplierId===s.id || b.supplierName===s.name);
                        const lastPurchase = allBatches.length > 0
                          ? allBatches.sort((a,b) => new Date(b.dateReceived)-new Date(a.dateReceived))[0].dateReceived
                          : null;

                        return (
                          <React.Fragment key={s.id}>
                            <tr style={{ borderBottom: isExpanded ? 'none' : '1px solid rgba(255,255,255,0.05)' }}>
                              <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                                <button onClick={() => toggleExpand(s.id)}
                                  style={{ background: 'none', border: 'none', color: 'var(--gray)', cursor: 'pointer', padding: '0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                                    style={{ transition: 'transform 0.2s', transform: isExpanded ? 'rotate(90deg)' : 'none' }}>
                                    <path d="M9 18l6-6-6-6"/>
                                  </svg>
                                </button>
                              </td>
                              <td style={{ padding: '0.75rem', color: 'var(--white)', fontWeight: 600 }}>{s.name}</td>
                              <td style={{ padding: '0.75rem', textAlign: 'center', color: 'var(--white)', fontSize: '0.875rem', fontWeight: 500 }}>{s.contact||'—'}</td>
                              <td style={{ padding: '0.75rem', textAlign: 'center', color: 'var(--gray)' }}>{s.phone||'—'}</td>
                              <td style={{ padding: '0.75rem', textAlign: 'center', color: '#facc15', fontWeight: 600, fontSize: '0.82rem' }}>
                                {totalSpent > 0 ? `₱${formatPrice(totalSpent)}` : <em style={{ color: 'var(--gray)' }}>—</em>}
                              </td>
                              <td style={{ padding: '0.75rem', textAlign: 'center', color: 'var(--gray)', fontSize: '0.78rem', whiteSpace: 'nowrap' }}>
                                {lastPurchase ? new Date(lastPurchase).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : <em>—</em>}
                              </td>
                              <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                                <button type="button" onClick={() => setViewingSupplier(s)} 
                                  style={{ background: 'rgba(212,168,67,0.15)', border: '1px solid rgba(212,168,67,0.4)', color: 'var(--gold)', marginRight: '0.4rem', borderRadius: '6px', padding: '0.35rem 0.75rem', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer' }}>View</button>
                                <button type="button" onClick={() => handleEdit(s)} 
                                  style={{ background: 'var(--gold)', border: '1px solid var(--gold)', color: '#000', marginRight: '0.4rem', borderRadius: '6px', padding: '0.35rem 0.75rem', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer' }}>Edit</button>
                                <button type="button" onClick={() => handleDeleteClick(s)} 
                                  style={{ background: '#7f1d1d', border: '1px solid #ef4444', color: '#fca5a5', borderRadius: '6px', padding: '0.35rem 0.75rem', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer' }}>Delete</button>
                              </td>
                            </tr>
                            {isExpanded && (
                              <tr>
                                <td colSpan={7} style={{ padding: '0', background: 'rgba(0,0,0,0.2)' }}>
                                  <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                                    <h4 style={{ margin: '0 0 1rem 0', fontSize: '0.75rem', color: 'var(--gray)', textTransform: 'uppercase', fontWeight: 600 }}>
                                      Items Supplied and Price History
                                      {supplierItems.length > 0 && <span style={{ marginLeft: '0.5rem', color: 'var(--white)', fontWeight: 400 }}>({supplierItems.length} item{supplierItems.length !== 1 ? 's' : ''})</span>}
                                    </h4>
                                    {supplierItems.length > 0 ? (
                                      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                        {supplierItems.map((item, itemIdx) => {
                                          // Calculate price trend
                                          const firstPrice = item.priceHistory[0]?.unitCost || 0;
                                          const lastPrice = item.priceHistory[item.priceHistory.length - 1]?.unitCost || 0;
                                          const priceTrend = firstPrice > 0 ? ((lastPrice - firstPrice) / firstPrice) * 100 : 0;
                                          const isTrendUp = priceTrend >= 0;

                                          return (
                                          <div key={itemIdx}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                                              <span style={{ color: 'var(--gray)', fontSize: '0.75rem' }}>{item.itemCategory}</span>
                                              <span style={{ color: 'var(--gray)' }}>—</span>
                                              <span style={{ color: 'var(--white)', fontWeight: 600, fontSize: '0.85rem' }}>{item.itemName}</span>
                                              <span style={{ color: 'var(--gray)', fontSize: '0.7rem', marginLeft: '0.25rem' }}>
                                                ({item.priceHistory.length} purchase{item.priceHistory.length !== 1 ? 's' : ''})
                                              </span>
                                              {item.priceHistory.length > 1 && priceTrend !== 0 && (
                                                <span style={{
                                                  fontSize: '0.7rem',
                                                  fontWeight: 700,
                                                  color: isTrendUp ? '#f87171' : '#4ade80',
                                                  display: 'flex',
                                                  alignItems: 'center',
                                                  gap: '0.25rem',
                                                  marginLeft: '0.5rem'
                                                }}>
                                                  {isTrendUp ? (
                                                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                                                      <path d="M18 15l-6-6-6 6"/>
                                                    </svg>
                                                  ) : (
                                                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                                                      <path d="M6 9l6 6 6-6"/>
                                                    </svg>
                                                  )}
                                                  {Math.abs(priceTrend).toFixed(1)}%
                                                </span>
                                              )}
                                            </div>
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                                              {item.priceHistory.map((price, priceIdx) => {
                                                const isLatest = priceIdx === item.priceHistory.length - 1;
                                                // Calculate change from previous
                                                const prevPrice = priceIdx > 0 ? item.priceHistory[priceIdx - 1].unitCost : null;
                                                const changeFromPrev = prevPrice !== null ? price.unitCost - prevPrice : null;
                                                const isUp = changeFromPrev !== null && changeFromPrev > 0;
                                                const isDown = changeFromPrev !== null && changeFromPrev < 0;
                                                const hasChange = changeFromPrev !== null && changeFromPrev !== 0;

                                                return (
                                                  <div key={priceIdx} style={{
                                                    display: 'flex',
                                                    flexDirection: 'column',
                                                    alignItems: 'center',
                                                    padding: '0.5rem 0.6rem',
                                                    background: isLatest ? 'rgba(212,168,67,0.1)' : 'rgba(255,255,255,0.05)',
                                                    border: isLatest ? '1px solid var(--gold)' : '1px solid rgba(255,255,255,0.1)',
                                                    borderRadius: '6px',
                                                    minWidth: '70px'
                                                  }}>
                                                    <span style={{
                                                      color: isLatest ? 'var(--gold)' : 'var(--white)',
                                                      fontWeight: isLatest ? 700 : 500,
                                                      fontSize: '0.8rem'
                                                    }}>
                                                      ₱{formatPrice(price.unitCost)}
                                                    </span>
                                                    {hasChange && (
                                                      <span style={{
                                                        fontSize: '0.6rem',
                                                        fontWeight: 700,
                                                        color: isUp ? '#f87171' : '#4ade80',
                                                        marginTop: '0.2rem',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '0.15rem'
                                                      }}>
                                                        {isUp ? (
                                                          <svg width="6" height="6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                                                            <path d="M18 15l-6-6-6 6"/>
                                                          </svg>
                                                        ) : (
                                                          <svg width="6" height="6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                                                            <path d="M6 9l6 6 6-6"/>
                                                          </svg>
                                                        )}
                                                        ₱{formatPrice(Math.abs(changeFromPrev))}
                                                      </span>
                                                    )}
                                                    <span style={{
                                                      color: 'var(--gray)',
                                                      fontSize: '0.65rem',
                                                      marginTop: '0.1rem'
                                                    }}>
                                                      {new Date(price.dateReceived).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}
                                                    </span>
                                                  </div>
                                                );
                                              })}
                                            </div>
                                          </div>
                                        );
                                        })}
                                      </div>
                                    ) : (
                                      <p style={{ fontSize: '0.8rem', color: 'var(--gray)', fontStyle: 'italic', margin: 0 }}>No items supplied yet.</p>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--gray)', fontStyle: 'italic' }}>No suppliers yet.</div>
              )}
            </>
          ) : (
            <div>
              <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--white)', marginBottom: '1.25rem' }}>{editingId ? 'Edit Supplier' : 'Add New Supplier'}</h3>
              {editingInUse && (
                <div style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: '8px', padding: '0.75rem 1rem', marginBottom: '1rem', fontSize: '0.875rem', color: '#f59e0b' }}>
                  This supplier is linked to active items. Name cannot be changed.
                </div>
              )}
              <div className="form-group">
                <label className="form-label">Supplier Name <span className="required">*</span></label>
                <input type="text" className="form-input" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                  placeholder="e.g., SanRoque Trading" maxLength={80} autoFocus disabled={editingInUse}
                  style={editingInUse ? { opacity: 0.6, cursor: 'not-allowed' } : {}} />
              </div>
              <div className="form-group">
                <label className="form-label">Contact Person <span className="required">*</span></label>
                <input type="text" className="form-input" value={form.contact} onChange={e => setForm(p => ({ ...p, contact: e.target.value.slice(0, 60) }))}
                  placeholder="e.g., Juan Dela Cruz" maxLength={60} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="form-group">
                  <label className="form-label">Phone</label>
                  <input type="text" className="form-input" value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value.replace(/[^0-9-]/g, '').slice(0, 15) }))}
                    placeholder="09xx-xxx-xxxx" maxLength={15} inputMode="tel" />
                </div>
                <div className="form-group">
                  <label className="form-label">Address</label>
                  <input type="text" className="form-input" value={form.address} onChange={e => setForm(p => ({ ...p, address: e.target.value.slice(0, 100) }))}
                    placeholder="e.g., Marikina City" maxLength={100} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Product Categories Supplied</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.5rem' }}>
                  {categories.length > 0 ? (
                    categories.map(cat => {
                      const isSelected = form.categories.includes(cat);
                      return (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => {
                            if (isSelected) {
                              setForm(p => ({ ...p, categories: p.categories.filter(c => c !== cat) }));
                            } else {
                              setForm(p => ({ ...p, categories: [...p.categories, cat] }));
                            }
                          }}
                          style={{
                            padding: '0.4rem 0.75rem',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            background: isSelected ? 'var(--gold)' : 'rgba(255,255,255,0.05)',
                            color: isSelected ? '#000' : 'var(--gray)',
                            border: isSelected ? '1px solid var(--gold)' : '1px solid var(--border)',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            transition: 'all 0.15s'
                          }}
                        >
                          {cat}
                        </button>
                      );
                    })
                  ) : (
                    <span style={{ fontSize: '0.8rem', color: 'var(--gray)', fontStyle: 'italic' }}>No categories available. Add categories in Products first.</span>
                  )}
                </div>
                {form.categories.length > 0 && (
                  <div style={{ fontSize: '0.7rem', color: 'var(--gray)', marginTop: '0.5rem' }}>
                    Selected: {form.categories.join(', ')}
                  </div>
                )}
              </div>
              <div className="modal-actions" style={{ marginTop: '1.5rem' }}>
                <button type="button" className="btn-secondary" onClick={() => { setShowForm(false); setEditingId(null); setEditingInUse(false); }}>Cancel</button>
                <button type="button" className="btn-primary" onClick={handleSubmit}>{editingId ? 'Update Supplier' : 'Add Supplier'}</button>
              </div>
            </div>
          )}
        </div>
        {!showForm && (
          <div className="modal-actions" style={{ borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
            <button type="button" className="btn-secondary" onClick={onClose}>Close</button>
          </div>
        )}
      </div>

      {/* Nested View Supplier Modal */}
      <SupplierDetailsModal
        isOpen={!!viewingSupplier}
        onClose={() => setViewingSupplier(null)}
        supplier={viewingSupplier}
        inventory={inventory}
      />

      {/* Info Modal */}
      <div className="modal-overlay" style={{ display: infoModal ? 'flex' : 'none' }} onClick={() => setInfoModal(null)}>
        <div className="modal-content modal-content-sm" onClick={e => e.stopPropagation()} style={{ maxWidth: '400px' }}>
          <div className="modal-header">
            <h2 className="modal-title modal-title-warning">{infoModal?.title}</h2>
            <button className="modal-close" onClick={() => setInfoModal(null)}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12"/>
              </svg>
            </button>
          </div>
          <div className="modal-body">
            <p className="delete-confirm-text">{infoModal?.message}</p>
          </div>
          <div className="modal-actions">
            <button type="button" className="btn-primary" onClick={() => setInfoModal(null)}>OK</button>
          </div>
        </div>
      </div>

      {/* Delete Confirm Modal */}
      <div className="modal-overlay" style={{ display: deleteConfirm ? 'flex' : 'none' }} onClick={() => setDeleteConfirm(null)}>
        <div className="modal-content modal-content-sm" onClick={e => e.stopPropagation()} style={{ maxWidth: '400px' }}>
          <div className="modal-header">
            <h2 className="modal-title">Delete Supplier</h2>
            <button className="modal-close" onClick={() => setDeleteConfirm(null)}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12"/>
              </svg>
            </button>
          </div>
          <div className="modal-body">
            <p className="delete-confirm-text">Permanently delete "{deleteConfirm?.name}"? This cannot be undone.</p>
          </div>
          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={() => setDeleteConfirm(null)}>Cancel</button>
            <button type="button" className="btn-danger" onClick={() => { onDelete(deleteConfirm.id); setDeleteConfirm(null); }}>Delete</button>
          </div>
        </div>
      </div>
    </div>
  );
}
