'use client';

import React, { useState } from 'react';
import { formatPrice } from '../../../../src/utils/format';

// ── 3-Level Nested Inventory Table (Invoice-Centric Batching) ─────────────────
// Level 1: Product (Master Row) - Clean, with +/- buttons
// Level 2: Variant Summary (Inline Header) - Shows when expanded
// Level 3: Batch/Invoice (Delivery History) - One row per invoice

function extractBaseProductName(fullName) {
  const patterns = [
    /\s+[A-Za-z]+\s*\/\s*\d+oz.*$/i,
    /\s+[A-Za-z]+\s*\/\s*\d+ml.*$/i,
    /\s+\d+oz\s*\/.*$/i,
    /\s+\d+ml\s*\/.*$/i,
  ];
  for (const pattern of patterns) {
    const match = fullName.match(pattern);
    if (match) return fullName.substring(0, match.index).trim();
  }
  return fullName.trim();
}

function extractVariantName(fullName, baseProductName) {
  const variantName = fullName.replace(baseProductName, '').trim();
  return variantName.replace(/^[\s\/-]+/, '').trim();
}

export function NestedInventoryTable({ 
  inventory, 
  onExpandProduct, 
  onExpandBatch,
  onEditItem, 
  onRemoveItem,
  onAddStock,
  onReduceStock,
  expandedProducts = new Set(),
  expandedBatches = new Set(),
  expandedBatchSections = new Set(),
  onExpandBatchSection
}) {
  const productsMap = inventory.reduce((acc, item) => {
    const baseProductName = extractBaseProductName(item.name);
    
    if (!acc[baseProductName]) {
      acc[baseProductName] = {
        name: baseProductName,
        category: item.category,
        variants: new Map(),
        batches: new Map(),
        hasMultipleVariantTypes: false
      };
    }
    
    if (item.variantCombo && Object.keys(item.variantCombo).length > 1) {
      acc[baseProductName].hasMultipleVariantTypes = true;
    }
    
    const variantKey = item.sku;
    if (!acc[baseProductName].variants.has(variantKey)) {
      acc[baseProductName].variants.set(variantKey, {
        sku: item.sku,
        name: extractVariantName(item.name, baseProductName),
        category: item.category,
        variantCombo: item.variantCombo,
        minStockLevel: item.minStockLevel || 10,
        totalStock: 0
      });
    }
    
    const variant = acc[baseProductName].variants.get(variantKey);
    variant.totalStock += item.stockQty || 0;
    
    if (item.batches && item.batches.length > 0) {
      item.batches.forEach(batch => {
        // FIX 1: Unified batchKey construction — always use the same format
        const batchKey = batch.invoiceNumber 
          ? `${batch.invoiceNumber}-${batch.supplierId || 'general'}-${batch.dateReceived}`
          : `${batch.batchId}-${batch.supplierId || 'general'}-${batch.dateReceived}`;
        
        if (!acc[baseProductName].batches.has(batchKey)) {
          acc[baseProductName].batches.set(batchKey, {
            // Store the unified key so we can reference it consistently later
            batchKey,
            batchId: batch.batchId,
            supplierName: batch.supplierName,
            supplierId: batch.supplierId,
            invoiceNumber: batch.invoiceNumber,
            dateReceived: batch.dateReceived,
            items: [],
            totalQty: 0,
            // FIX 2: Don't pre-seed totalCost from batch.totalCost to avoid double-counting;
            // we'll sum it from item-level costs instead
            totalCost: 0
          });
        }
        
        const existingBatch = acc[baseProductName].batches.get(batchKey);
        const existingItem = existingBatch.items.find(i => i.sku === item.sku);
        const itemCost = (batch.remainingQty || 0) * (batch.unitCost || 0);
        
        if (existingItem) {
          existingItem.remainingQty += batch.remainingQty || 0;
          existingItem.goodQty += batch.goodQty || 0;
          existingItem.damagedQty += batch.damagedQty || 0;
          // FIX 2: Recalculate totalCost from quantities rather than accumulating raw batch.totalCost
          existingItem.totalCost = existingItem.remainingQty * existingItem.unitCost;
        } else {
          existingBatch.items.push({
            sku: item.sku,
            variantName: extractVariantName(item.name, baseProductName),
            remainingQty: batch.remainingQty || 0,
            goodQty: batch.goodQty || 0,
            damagedQty: batch.damagedQty || 0,
            unitCost: batch.unitCost || 0,
            totalCost: itemCost
          });
        }
        
        existingBatch.totalQty += batch.remainingQty || 0;
        // FIX 2: Sum totalCost from item-level cost (remainingQty * unitCost) to avoid double-counting
        existingBatch.totalCost += itemCost;
      });
    }
    
    return acc;
  }, {});

  const products = Object.values(productsMap);

  if (products.length === 0) {
    return (
      <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--gray)', fontSize: '0.9rem' }}>
        No inventory items found. Click "Add New Item" to get started.
      </div>
    );
  }

  // The parent table always has 6 columns
  const PARENT_COL_COUNT = 6;

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
      <thead>
        <tr style={{ background: 'rgba(0,0,0,0.3)' }}>
          <th style={{ width: '40px', padding: '0.875rem', textAlign: 'center', color: 'var(--gray)', fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}></th>
          <th style={{ padding: '0.875rem', textAlign: 'left', color: 'var(--gray)', fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Product Name</th>
          <th style={{ padding: '0.875rem', textAlign: 'center', color: 'var(--gray)', fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.08em', width: '120px' }}>Category</th>
          <th style={{ padding: '0.875rem', textAlign: 'center', color: 'var(--gray)', fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.08em', width: '160px' }}>Total Stock</th>
          <th style={{ padding: '0.875rem', textAlign: 'center', color: 'var(--gray)', fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.08em', width: '120px' }}>Status</th>
          <th style={{ padding: '0.875rem', textAlign: 'center', color: 'var(--gray)', fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.08em', width: '180px' }}>Actions</th>
        </tr>

      </thead>
      <tbody>
        {products.map((product) => {
          const isProductExpanded = expandedProducts.has(product.name);
          
          const productTotalStock = Array.from(product.variants.values()).reduce((sum, v) => sum + v.totalStock, 0);
          const hasLowStock = Array.from(product.variants.values()).some(v => v.totalStock <= v.minStockLevel);
          const hasOutOfStock = Array.from(product.variants.values()).some(v => v.totalStock === 0);
          const productStatus = hasOutOfStock ? 'out' : hasLowStock ? 'low' : 'ok';
          
          return (
            <React.Fragment key={product.name}>

              {/* LEVEL 1: PRODUCT ROW */}
              <tr style={{ 
                background: isProductExpanded ? 'rgba(255,255,255,0.03)' : 'transparent',
                borderBottom: '1px solid rgba(255,255,255,0.08)'
              }}>
                <td style={{ padding: '0.875rem', textAlign: 'center', borderLeft: isProductExpanded ? '3px solid #D4A843' : 'none' }}>
                  <button
                    onClick={() => onExpandProduct(product.name)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.25rem', color: isProductExpanded ? '#D4A843' : 'var(--gray)', transition: 'color 0.2s' }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                      style={{ transition: 'transform 0.2s', transform: isProductExpanded ? 'rotate(90deg)' : 'none' }}>
                      <path d="M9 18l6-6-6-6"/>
                    </svg>
                  </button>
                </td>
                <td style={{ padding: '0.875rem' }}>
                  <div style={{ fontWeight: 700, color: '#E5E2E1', fontSize: '0.9rem' }}>{product.name}</div>
                </td>
                <td style={{ padding: '0.875rem', textAlign: 'center' }}>
                  <span style={{ background: 'rgba(212,168,67,0.15)', color: '#D4A843', padding: '0.25rem 0.75rem', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 600 }}>
                    {product.category}
                  </span>
                </td>
                <td style={{ padding: '0.875rem', textAlign: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                    <button 
                      onClick={() => onReduceStock(product)}
                      style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171', borderRadius: '6px', padding: '0.25rem 0.65rem', fontSize: '1rem', fontWeight: 700, cursor: 'pointer', lineHeight: '1' }}
                      title="Reduce Stock"
                    >−</button>
                    <span style={{ fontWeight: 700, color: '#D4A843', fontSize: '1rem' }}>
                      {productTotalStock}
                      <span style={{ fontSize: '0.7rem', color: 'var(--gray)', marginLeft: '0.25rem' }}>pcs</span>
                    </span>
                    <button 
                      onClick={() => onAddStock(product)}
                      style={{ background: 'rgba(74,222,128,0.15)', border: '1px solid rgba(74,222,128,0.3)', color: '#4ade80', borderRadius: '6px', padding: '0.25rem 0.65rem', fontSize: '1rem', fontWeight: 700, cursor: 'pointer', lineHeight: '1' }}
                      title="Add Stock"
                    >+</button>
                  </div>
                </td>
                <td style={{ padding: '0.875rem', textAlign: 'center' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 600, color: productStatus === 'ok' ? '#4ade80' : productStatus === 'low' ? '#fbbf24' : '#ef4444' }}>
                    {productStatus === 'ok' ? 'In Stock' : productStatus === 'low' ? 'Low Stock' : 'Out of Stock'}
                  </span>
                </td>
                <td style={{ padding: '0.875rem', textAlign: 'center' }}>
                  <button 
                    onClick={() => onEditItem(product)}
                    style={{ background: '#D4A843', border: 'none', color: '#000', borderRadius: '6px', padding: '0.35rem 0.85rem', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', marginRight: '0.25rem' }}
                  >Edit</button>
                  <button 
                    onClick={() => onRemoveItem(product)}
                    style={{ background: '#7f1d1d', border: '1px solid #ef4444', color: '#fca5a5', borderRadius: '6px', padding: '0.35rem 0.85rem', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer' }}
                  >Remove</button>
                </td>
              </tr>
              
              {/* LEVEL 2: VARIANT SUMMARY & BATCH LIST (when product expanded) */}
              {isProductExpanded && (
                <React.Fragment>

                  {/* Variant Summary Cards */}
                  {/* FIX 3: colSpan matches PARENT_COL_COUNT (6) consistently throughout */}
                  <tr>
                    <td colSpan={PARENT_COL_COUNT} style={{ padding: '1rem 2rem', background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                      <div style={{ fontSize: '0.75rem', color: 'var(--gray)', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.05em', marginBottom: '0.75rem' }}>
                        Variant Summary
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                        {Array.from(product.variants.values()).map(v => (
                          <div key={v.sku} style={{ background: 'rgba(0,0,0,0.2)', padding: '0.5rem 0.75rem', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.08)' }}>
                            <div style={{ fontWeight: 600, color: '#E5E2E1', fontSize: '0.8rem' }}>{v.name}</div>
                            <div style={{ fontSize: '0.65rem', color: 'var(--gray)', fontFamily: 'monospace' }}>{v.sku}</div>
                            <div style={{ fontSize: '0.7rem', color: 'var(--gray)', marginTop: '0.25rem' }}>
                              Stock: <strong style={{ color: '#D4A843' }}>{v.totalStock} pcs</strong>
                              <span style={{ margin: '0 0.35rem', color: 'var(--gray)' }}>|</span>
                              Min: <strong style={{ color: v.totalStock <= v.minStockLevel ? '#fbbf24' : 'var(--gray)' }}>{v.minStockLevel}</strong>
                            </div>
                          </div>
                        ))}
                      </div>
                    </td>
                  </tr>
                  
                  {/* ── BATCH / INVOICE HISTORY TOGGLE HEADER ── */}
                  {Array.from(product.batches.values()).length > 0 && (
                    <tr
                      onClick={() => onExpandBatchSection(product.name)}
                      style={{ cursor: 'pointer', userSelect: 'none' }}
                    >
                      {/* FIX 3: colSpan matches PARENT_COL_COUNT (6) */}
                      <td colSpan={PARENT_COL_COUNT} style={{ padding: '0.5rem 2rem', background: 'rgba(0,0,0,0.2)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                            style={{ transition: 'transform 0.2s', transform: expandedBatchSections.has(product.name) ? 'rotate(90deg)' : 'none', flexShrink: 0, color: 'var(--gray)' }}>
                            <path d="M9 18l6-6-6-6"/>
                          </svg>
                          <span style={{ fontSize: '0.65rem', color: 'var(--gray)', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.08em' }}>
                            Batch / Invoice History
                          </span>
                        </div>
                      </td>
                    </tr>
                  )}

                  {/* ── BATCH ROWS — only visible when batch section is open ── */}
                  {expandedBatchSections.has(product.name) && (() => {
                    const batchList = Array.from(product.batches.values());
                    const thCell = (label, align = 'left') => (
                      <th style={{ padding: '0.5rem 0.75rem', textAlign: align, color: '#6b7280', fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>
                        {label}
                      </th>
                    );
                    return (
                      <tr>
                        <td colSpan={PARENT_COL_COUNT} style={{ padding: 0 }}>
                          {/* Single shared sub-table so all batch rows align under one header */}
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', tableLayout: 'fixed' }}>
                            <colgroup>
                              <col style={{ width: '40px' }} />
                              <col style={{ width: '18%' }} />
                              <col style={{ width: '14%' }} />
                              <col style={{ width: '14%' }} />
                              <col style={{ width: '13%' }} />
                              <col style={{ width: '11%' }} />
                              <col style={{ width: '14%' }} />
                              <col style={{ width: '16%' }} />
                            </colgroup>
                            <thead>
                              <tr style={{ background: 'rgba(0,0,0,0.25)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                                <th style={{ width: '40px' }} />
                                {thCell('Batch ID')}
                                {thCell('Supplier')}
                                {thCell('Invoice')}
                                {thCell('Delivery Date', 'center')}
                                {thCell('Total Qty', 'center')}
                                {thCell(product.hasMultipleVariantTypes ? 'Combos' : 'Variants', 'center')}
                                {thCell('Batch Total', 'right')}
                              </tr>
                            </thead>
                            <tbody>
                              {batchList.map((batch) => {
                                const expandKey = `${product.name}-${batch.batchKey}`;
                                const isBatchExpanded = expandedBatches.has(expandKey);
                                return (
                                  <React.Fragment key={expandKey}>
                                    <tr style={{
                                      borderBottom: '1px solid rgba(255,255,255,0.06)',
                                      background: isBatchExpanded ? 'rgba(212,168,67,0.04)' : 'transparent'
                                    }}>
                                      <td style={{ padding: '0.75rem 0.5rem 0.75rem 1.5rem', textAlign: 'center' }}>
                                        <button
                                          onClick={() => onExpandBatch(expandKey)}
                                          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.25rem', color: 'var(--gray)' }}
                                        >
                                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                                            style={{ transition: 'transform 0.2s', transform: isBatchExpanded ? 'rotate(90deg)' : 'none', display: 'block' }}>
                                            <path d="M9 18l6-6-6-6"/>
                                          </svg>
                                        </button>
                                      </td>
                                      <td style={{ padding: '0.75rem' }}>
                                        <span style={{ fontFamily: 'monospace', color: '#D4A843', fontWeight: 600, fontSize: '0.85rem' }}>{batch.batchId}</span>
                                      </td>
                                      <td style={{ padding: '0.75rem', color: '#d1d5db' }}>{batch.supplierName || 'General'}</td>
                                      <td style={{ padding: '0.75rem', color: '#d1d5db', fontFamily: 'monospace' }}>{batch.invoiceNumber || '—'}</td>
                                      <td style={{ padding: '0.75rem', textAlign: 'center', color: '#d1d5db' }}>
                                        {new Date(batch.dateReceived).toLocaleDateString()}
                                      </td>
                                      <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                                        <span style={{ fontWeight: 700, color: '#f3f4f6', fontSize: '0.95rem' }}>{batch.totalQty}</span>
                                        <span style={{ fontSize: '0.7rem', color: '#6b7280', marginLeft: '0.25rem' }}>pcs</span>
                                      </td>
                                      <td style={{ padding: '0.75rem', textAlign: 'center', color: '#d1d5db' }}>
                                        {batch.items.length} {product.hasMultipleVariantTypes ? 'combo ' : ''}variant{batch.items.length !== 1 ? 's' : ''}
                                      </td>
                                      <td style={{ padding: '0.75rem', textAlign: 'right', color: '#D4A843', fontWeight: 600, fontSize: '0.85rem' }}>
                                        {formatPrice(batch.totalCost)}
                                      </td>
                                    </tr>

                                    {/* LEVEL 3: BATCH ITEMS BREAKDOWN — inside the shared sub-table */}
                                    {isBatchExpanded && (
                                      <tr>
                                        <td colSpan={8} style={{ padding: 0, background: 'rgba(0,0,0,0.2)' }}>
                                          <div style={{ padding: '0.75rem 1.5rem 0.75rem 3rem' }}>
                                            <div style={{ fontSize: '0.65rem', color: 'var(--gray)', textTransform: 'uppercase', marginBottom: '0.6rem', fontWeight: 600, letterSpacing: '0.08em' }}>
                                              Items in this Batch
                                            </div>
                                            <div style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', overflow: 'hidden' }}>
                                              <table style={{ width: '100%', fontSize: '0.75rem' }}>
                                                <thead>
                                                  <tr style={{ background: 'rgba(0,0,0,0.3)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                                                    <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left', color: 'var(--gray)', fontWeight: 600 }}>Variant</th>
                                                    <th style={{ padding: '0.5rem 0.75rem', textAlign: 'center', color: 'var(--gray)', fontWeight: 600 }}>SKU</th>
                                                    <th style={{ padding: '0.5rem 0.75rem', textAlign: 'center', color: 'var(--gray)', fontWeight: 600 }}>Good</th>
                                                    <th style={{ padding: '0.5rem 0.75rem', textAlign: 'center', color: 'var(--gray)', fontWeight: 600 }}>Damaged</th>
                                                    <th style={{ padding: '0.5rem 0.75rem', textAlign: 'center', color: 'var(--gray)', fontWeight: 600 }}>Remaining</th>
                                                    <th style={{ padding: '0.5rem 0.75rem', textAlign: 'center', color: 'var(--gray)', fontWeight: 600 }}>Unit Cost</th>
                                                  </tr>
                                                </thead>
                                                <tbody>
                                                  {batch.items.map((item, itemIdx) => (
                                                    <tr key={item.sku} style={{ 
                                                      background: itemIdx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)',
                                                      borderBottom: '1px solid rgba(255,255,255,0.04)'
                                                    }}>
                                                      <td style={{ padding: '0.5rem 0.75rem', fontWeight: 600, color: '#E5E2E1' }}>{item.variantName}</td>
                                                      <td style={{ padding: '0.5rem 0.75rem', textAlign: 'center', fontFamily: 'monospace', color: 'var(--gray)' }}>{item.sku}</td>
                                                      <td style={{ padding: '0.5rem 0.75rem', textAlign: 'center', fontWeight: 600, color: '#4ade80' }}>{item.goodQty}</td>
                                                      <td style={{ padding: '0.5rem 0.75rem', textAlign: 'center', fontWeight: 600, color: '#F87171' }}>{item.damagedQty}</td>
                                                      <td style={{ padding: '0.5rem 0.75rem', textAlign: 'center', fontWeight: 700, color: '#E5E2E1' }}>{item.remainingQty}</td>
                                                      <td style={{ padding: '0.5rem 0.75rem', textAlign: 'center', color: '#D4A843', fontWeight: 600 }}>{formatPrice(item.unitCost)}</td>
                                                    </tr>
                                                  ))}
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
                        </td>
                      </tr>
                    );
                  })()}
                  
                  {product.batches.size === 0 && (
                    <tr>
                      <td colSpan={PARENT_COL_COUNT} style={{ padding: '2rem', textAlign: 'center', color: 'var(--gray)', fontSize: '0.8rem', background: 'rgba(0,0,0,0.1)' }}>
                        No batches found for this product. Add stock to create your first batch.
                      </td>
                    </tr>
                  )}

                </React.Fragment>
              )}
            </React.Fragment>
          );
        })}
      </tbody>
    </table>
  );
}