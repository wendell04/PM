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
    /\s+\d+oz$/i,      // Standalone oz (e.g., "Inner Color Mugs 11oz")
    /\s+\d+ml$/i,      // Standalone ml
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
  onExpandBatchSection,
  onUpdateMinStock,
  onArchiveVariant,
  onDeleteVariant
}) {
  const [editVariantModal, setEditVariantModal] = useState({ isOpen: false, variant: null, minStockLevel: 0 });
  const [actionMenuOpen, setActionMenuOpen] = useState(null); // SKU of open menu
  const [archiveConfirmModal, setArchiveConfirmModal] = useState({ isOpen: false, variant: null, product: null, checkResult: null });

  // Get variant status for border styling
  const getVariantStatus = (variant) => {
    const stock = variant.totalStock || variant.stock || 0;
    const minStock = variant.minStockLevel || 10;
    if (stock === 0) return 'out-of-stock';
    if (stock < minStock) return 'low-stock';
    return 'in-stock';
  };

  // Get border color based on status
  const getVariantBorderColor = (variant) => {
    const status = getVariantStatus(variant);
    if (status === 'out-of-stock') return '#ef4444';
    if (status === 'low-stock') return '#D4A843';
    return 'transparent';
  };

  // Check if variant can be deleted/archived
  const checkVariantReferences = (variant) => {
    const hasStock = variant.totalStock > 0;

    // Check sales history
    const sales = JSON.parse(localStorage.getItem('pmp_sales') || '[]');
    const hasSales = sales.some(s =>
      s.inventoryId === variant.sku ||
      s.variantSku === variant.sku ||
      s.items?.some(i => i.sku === variant.sku)
    );

    // Check linked products (storefront)
    const products = JSON.parse(localStorage.getItem('pmp_products') || '[]');
    const hasProducts = products.some(p =>
      p.variantSku === variant.sku ||
      p.sku === variant.sku
    );

    // Check batches with remaining stock
    const inventoryItems = inventory.filter(i => i.sku === variant.sku);
    const hasBatches = inventoryItems.some(i =>
      (i.batches || []).some(b => (b.remainingQty || 0) > 0)
    );

    return {
      hasStock,
      hasSales,
      hasProducts,
      hasBatches,
      canHardDelete: !hasStock && !hasSales && !hasProducts && !hasBatches,
      canArchive: !hasStock,
    };
  };

  // Handle variant card click - open edit modal
  const handleVariantClick = (variant, product) => {
    const inventoryItem = inventory.find(item => item.sku === variant.sku || item.id === variant.id);
    setEditVariantModal({
      isOpen: true,
      variant,
      product,
      minStockLevel: inventoryItem?.minStockLevel || variant.minStockLevel || 10
    });
  };

  // Handle action menu click
  const handleActionMenuClick = (e, variant, product) => {
    e.stopPropagation();
    setActionMenuOpen(actionMenuOpen === variant.sku ? null : variant.sku);
  };

  // Handle archive variant
  const handleArchiveVariantClick = (e, variant, product) => {
    e.stopPropagation();
    const checkResult = checkVariantReferences(variant);

    if (checkResult.hasStock) {
      setArchiveConfirmModal({ isOpen: true, variant, product, checkResult, mode: 'blocked' });
    } else {
      setArchiveConfirmModal({ isOpen: true, variant, product, checkResult, mode: 'archive' });
    }
    setActionMenuOpen(null);
  };

  // Confirm archive
  const confirmArchive = () => {
    if (archiveConfirmModal.variant && onArchiveVariant) {
      onArchiveVariant(archiveConfirmModal.variant, archiveConfirmModal.product);
      setArchiveConfirmModal({ isOpen: false, variant: null, product: null, checkResult: null });
    }
  };

  // Handle save min stock level
  const handleSaveMinStock = () => {
    if (editVariantModal.variant && onUpdateMinStock) {
      onUpdateMinStock(editVariantModal.variant.sku, editVariantModal.minStockLevel);
      setEditVariantModal({ isOpen: false, variant: null, minStockLevel: 0 });
    }
  };

  // Close action menu when clicking outside
  React.useEffect(() => {
    const handleClickOutside = () => setActionMenuOpen(null);
    if (actionMenuOpen) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [actionMenuOpen]);

  const productsMap = inventory.reduce((acc, item) => {
    const baseProductName = extractBaseProductName(item.name);

    if (!acc[baseProductName]) {
      acc[baseProductName] = {
        name: baseProductName,
        category: item.category,
        variants: new Map(),
        batches: new Map(),
        hasMultipleVariantTypes: false,
        rawItems: []
      };
    }
    acc[baseProductName].rawItems.push(item);

    if (item.variantCombo && Object.keys(item.variantCombo).length > 1) {
      acc[baseProductName].hasMultipleVariantTypes = true;
    }

    const variantKey = item.sku;
    if (!acc[baseProductName].variants.has(variantKey)) {
      const rawVariantName = extractVariantName(item.name, baseProductName);
      const variantName = rawVariantName || baseProductName;

      acc[baseProductName].variants.set(variantKey, {
        sku: item.sku,
        name: variantName,
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
        const batchKey = batch.invoiceNumber
          ? `${batch.invoiceNumber}-${batch.supplierId || 'general'}-${batch.dateReceived}`
          : `${batch.batchId}-${batch.supplierId || 'general'}-${batch.dateReceived}`;

        if (!acc[baseProductName].batches.has(batchKey)) {
          acc[baseProductName].batches.set(batchKey, {
            batchKey,
            batchId: batch.batchId,
            supplierName: batch.supplierName,
            supplierId: batch.supplierId,
            invoiceNumber: batch.invoiceNumber,
            dateReceived: batch.dateReceived,
            items: [],
            totalQty: 0,
            totalCost: 0
          });
        }

        const existingBatch = acc[baseProductName].batches.get(batchKey);
        const existingItem = existingBatch.items.find(i => i.sku === item.sku);
        const itemCost = (batch.remainingQty || 0) * (batch.unitCost || 0);

        // Calculate damaged qty from movements for this batch
        const damagedFromMovements = (batch.movements || [])
          .filter(m => m.type === 'damaged')
          .reduce((sum, m) => sum + Math.abs(m.quantity), 0);

        const rawVariantName = extractVariantName(item.name, baseProductName);
        const variantName = rawVariantName || baseProductName;

        if (existingItem) {
          existingItem.remainingQty += batch.remainingQty || 0;
          existingItem.goodQty += batch.goodQty || 0;
          existingItem.damagedQty += damagedFromMovements;
          existingItem.totalCost = existingItem.remainingQty * existingItem.unitCost;
        } else {
          existingBatch.items.push({
            sku: item.sku,
            variantName: variantName,
            remainingQty: batch.remainingQty || 0,
            goodQty: batch.goodQty || 0,
            damagedQty: damagedFromMovements,
            unitCost: batch.unitCost || 0,
            totalCost: itemCost
          });
        }

        existingBatch.totalQty += batch.remainingQty || 0;
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

  const PARENT_COL_COUNT = 5;

  return (
    <>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
        <thead>
          <tr style={{ background: 'rgba(0,0,0,0.3)' }}>
            <th style={{ width: '40px', padding: '0.875rem', textAlign: 'center', color: 'var(--gray)', fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}></th>
            <th style={{ padding: '0.875rem', textAlign: 'left', color: 'var(--gray)', fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Product Name</th>
            <th style={{ padding: '0.875rem', textAlign: 'center', color: 'var(--gray)', fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.08em', width: '120px' }}>Category</th>
            <th style={{ padding: '0.875rem', textAlign: 'center', color: 'var(--gray)', fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.08em', width: '160px' }}>Total Stock</th>
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
                        onClick={() => onReduceStock({ ...product, rawItems: product.rawItems })}
                        style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171', borderRadius: '6px', padding: '0.25rem 0.65rem', fontSize: '1rem', fontWeight: 700, cursor: 'pointer', lineHeight: '1' }}
                        title="Reduce Stock"
                      >−</button>
                      <span style={{ fontWeight: 700, color: '#D4A843', fontSize: '1rem' }}>
                        {productTotalStock}
                        <span style={{ fontSize: '0.7rem', color: 'var(--gray)', marginLeft: '0.25rem' }}>pcs</span>
                      </span>
                      <button
                        onClick={() => onAddStock({ ...product, rawItems: product.rawItems })}
                        style={{ background: 'rgba(74,222,128,0.15)', border: '1px solid rgba(74,222,128,0.3)', color: '#4ade80', borderRadius: '6px', padding: '0.25rem 0.65rem', fontSize: '1rem', fontWeight: 700, cursor: 'pointer', lineHeight: '1' }}
                        title="Add Stock"
                      >+</button>
                    </div>
                  </td>
                  <td style={{ padding: '0.875rem', textAlign: 'center' }}>
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
                    <tr>
                      <td colSpan={PARENT_COL_COUNT} style={{ padding: '1rem 2rem', background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                        <div style={{ fontSize: '0.75rem', color: 'var(--gray)', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.05em', marginBottom: '0.75rem' }}>
                          Variant Summary
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                          {Array.from(product.variants.values()).map(v => {
                            const borderColor = getVariantBorderColor(v);
                            const status = getVariantStatus(v);
                            const isMenuOpen = actionMenuOpen === v.sku;

                            return (
                              <div
                                key={v.sku}
                                onClick={() => handleVariantClick(v, product)}
                                style={{
                                  background: 'rgba(0,0,0,0.2)',
                                  padding: '0.5rem 0.75rem',
                                  borderRadius: '6px',
                                  border: `2px solid ${borderColor}`,
                                  cursor: 'pointer',
                                  transition: 'all 0.2s',
                                  opacity: status === 'out-of-stock' ? 0.7 : 1,
                                  position: 'relative'
                                }}
                                onMouseEnter={e => {
                                  e.currentTarget.style.transform = 'translateY(-2px)';
                                  e.currentTarget.style.boxShadow = `0 4px 8px ${borderColor}40`;
                                }}
                                onMouseLeave={e => {
                                  e.currentTarget.style.transform = 'translateY(0)';
                                  e.currentTarget.style.boxShadow = 'none';
                                }}
                              >
                                {/* Action Menu Button */}
                                <div
                                  onClick={(e) => handleActionMenuClick(e, v, product)}
                                  style={{
                                    position: 'absolute',
                                    top: '4px',
                                    right: '4px',
                                    width: '24px',
                                    height: '24px',
                                    borderRadius: '4px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    cursor: 'pointer',
                                    background: isMenuOpen ? 'rgba(212,168,67,0.2)' : 'transparent',
                                    color: isMenuOpen ? '#D4A843' : 'var(--gray)',
                                    transition: 'all 0.2s'
                                  }}
                                  onMouseEnter={e => {
                                    e.stopPropagation();
                                    e.currentTarget.style.background = 'rgba(212,168,67,0.2)';
                                    e.currentTarget.style.color = '#D4A843';
                                  }}
                                  onMouseLeave={e => {
                                    e.stopPropagation();
                                    e.currentTarget.style.background = isMenuOpen ? 'rgba(212,168,67,0.2)' : 'transparent';
                                    e.currentTarget.style.color = isMenuOpen ? '#D4A843' : 'var(--gray)';
                                  }}
                                  title="Variant actions"
                                >
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                                    <circle cx="12" cy="5" r="2"/>
                                    <circle cx="12" cy="12" r="2"/>
                                    <circle cx="12" cy="19" r="2"/>
                                  </svg>
                                </div>

                                {/* Action Menu Dropdown */}
                                {isMenuOpen && (
                                  <div
                                    onClick={(e) => e.stopPropagation()}
                                    style={{
                                      position: 'absolute',
                                      top: '32px',
                                      right: '0',
                                      background: '#1a1a1a',
                                      border: '1px solid rgba(255,255,255,0.1)',
                                      borderRadius: '6px',
                                      boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
                                      zIndex: 100,
                                      minWidth: '160px',
                                      overflow: 'hidden'
                                    }}
                                  >
                                    <button
                                      onClick={(e) => { e.stopPropagation(); handleVariantClick(v, product); setActionMenuOpen(null); }}
                                      style={{ width: '100%', padding: '0.5rem 0.75rem', background: 'transparent', border: 'none', textAlign: 'left', color: '#E5E2E1', fontSize: '0.75rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                                      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
                                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                                    >
                                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                                      </svg>
                                      Edit Min Stock
                                    </button>
                                    <button
                                      onClick={(e) => handleArchiveVariantClick(e, v, product)}
                                      style={{ width: '100%', padding: '0.5rem 0.75rem', background: 'transparent', border: 'none', textAlign: 'left', color: '#fbbf24', fontSize: '0.75rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                                      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(251,191,36,0.1)'; }}
                                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                                    >
                                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                                        <polyline points="7 10 12 15 17 10"/>
                                        <line x1="12" y1="15" x2="12" y2="3"/>
                                      </svg>
                                      Archive
                                    </button>
                                  </div>
                                )}

                                <div style={{ fontWeight: 600, color: '#E5E2E1', fontSize: '0.8rem', paddingRight: '20px' }}>
                                  {v.name || v.sku || 'Variant'}
                                </div>
                                <div style={{ fontSize: '0.65rem', color: 'var(--gray)', fontFamily: 'monospace', marginTop: '2px' }}>{v.sku}</div>
                                <div style={{ fontSize: '0.7rem', color: 'var(--gray)', marginTop: '0.25rem' }}>
                                  Stock: <strong style={{ color: '#D4A843' }}>{v.totalStock} pcs</strong>
                                  <span style={{ margin: '0 0.35rem', color: 'var(--gray)' }}>|</span>
                                  Min: <strong style={{ color: v.totalStock <= v.minStockLevel ? '#fbbf24' : 'var(--gray)' }}>{v.minStockLevel}</strong>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </td>
                    </tr>

                    {/* BATCH / INVOICE HISTORY TOGGLE HEADER */}
                    {Array.from(product.batches.values()).length > 0 && (
                      <tr
                        onClick={() => onExpandBatchSection(product.name)}
                        style={{ cursor: 'pointer', userSelect: 'none' }}
                      >
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

                    {/* BATCH ROWS — scrollable, shows ~4 rows then scrolls */}
                    {expandedBatchSections.has(product.name) && (() => {
                      // Filter out depleted batches (0 total qty) from main view
                      const batchList = Array.from(product.batches.values())
                        .filter(batch => batch.totalQty > 0)  // Hide depleted batches
                        .sort((a, b) => new Date(a.dateReceived) - new Date(b.dateReceived));
                      const thCell = (label, align = 'left') => (
                        <th style={{ padding: '0.5rem 0.75rem', textAlign: align, color: '#6b7280', fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>
                          {label}
                        </th>
                      );
                      return (
                        <tr>
                          <td colSpan={PARENT_COL_COUNT} style={{ padding: 0 }}>
                            {/* Scrollable wrapper — shows ~4 batch rows then scrolls */}
                            <div style={{ maxHeight: '224px', overflowY: 'auto', overflowX: 'hidden' }}>
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
                                {/* Sticky header stays visible while scrolling */}
                                <thead style={{ position: 'sticky', top: 0, zIndex: 2 }}>
                                  <tr style={{ background: 'rgba(20,20,20,0.98)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
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

                                        {/* LEVEL 3: BATCH ITEMS BREAKDOWN */}
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
                                                        <th style={{ padding: '0.5rem 0.75rem', textAlign: 'center', color: 'var(--gray)', fontWeight: 600 }}>Initial Good</th>
                                                        <th style={{ padding: '0.5rem 0.75rem', textAlign: 'center', color: 'var(--gray)', fontWeight: 600 }}>Stock Out</th>
                                                        <th style={{ padding: '0.5rem 0.75rem', textAlign: 'center', color: 'var(--gray)', fontWeight: 600 }}>Remaining</th>
                                                        <th style={{ padding: '0.5rem 0.75rem', textAlign: 'center', color: 'var(--gray)', fontWeight: 600 }}>Unit Cost</th>
                                                      </tr>
                                                    </thead>
                                                    <tbody>
                                                      {batch.items.map((item, itemIdx) => {
                                                        // Stock Out = Sold + Damaged (all movements out)
                                                        const stockOutQty = Math.max(0, (item.goodQty || 0) - (item.remainingQty || 0));
                                                        return (
                                                          <tr key={item.sku} style={{
                                                            background: itemIdx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)',
                                                            borderBottom: '1px solid rgba(255,255,255,0.04)'
                                                          }}>
                                                            <td style={{ padding: '0.5rem 0.75rem', fontWeight: 600, color: '#E5E2E1' }}>{item.variantName}</td>
                                                            <td style={{ padding: '0.5rem 0.75rem', textAlign: 'center', fontFamily: 'monospace', color: 'var(--gray)' }}>{item.sku}</td>
                                                            <td style={{ padding: '0.5rem 0.75rem', textAlign: 'center', fontWeight: 600, color: '#E5E2E1' }}>{item.goodQty || 0}</td>
                                                            <td style={{ padding: '0.5rem 0.75rem', textAlign: 'center', fontWeight: 600, color: '#E5E2E1' }}>
                                                              {stockOutQty > 0 ? stockOutQty : '0'}
                                                            </td>
                                                            <td style={{ padding: '0.5rem 0.75rem', textAlign: 'center', fontWeight: 700, color: '#E5E2E1' }}>{item.remainingQty || 0}</td>
                                                            <td style={{ padding: '0.5rem 0.75rem', textAlign: 'center', color: '#D4A843', fontWeight: 600 }}>{formatPrice(item.unitCost)}</td>
                                                          </tr>
                                                        );
                                                      })}
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
                            </div>{/* end scrollable wrapper */}
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

      {/* Edit Variant Modal */}
      {editVariantModal.isOpen && editVariantModal.variant && (
        <div className="modal-overlay" onClick={() => setEditVariantModal({ isOpen: false, variant: null, minStockLevel: 0 })}>
          <div className="modal-content modal-content-sm" onClick={e => e.stopPropagation()} style={{ maxWidth: '450px' }}>
            <div className="modal-header">
              <h2 className="modal-title">Edit Variant — {editVariantModal.variant.name || editVariantModal.variant.sku}</h2>
              <button className="modal-close" onClick={() => setEditVariantModal({ isOpen: false, variant: null, minStockLevel: 0 })}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>
            </div>
            <div className="modal-body">
              <div style={{ marginBottom: '1rem' }}>
                <div style={{ fontSize: '0.7rem', color: 'var(--gray)', textTransform: 'uppercase', marginBottom: '0.25rem' }}>SKU</div>
                <div style={{ fontFamily: 'monospace', color: 'var(--gray)', fontSize: '0.85rem' }}>{editVariantModal.variant.sku}</div>
              </div>
              <div style={{ marginBottom: '1rem' }}>
                <div style={{ fontSize: '0.7rem', color: 'var(--gray)', textTransform: 'uppercase', marginBottom: '0.25rem' }}>Current Stock</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#D4A843' }}>{editVariantModal.variant.totalStock} pcs</div>
                <div style={{ fontSize: '0.7rem', color: 'var(--gray)', marginTop: '0.25rem' }}>Stock is read-only. Use + or - buttons to adjust.</div>
              </div>
              <div style={{ marginBottom: '1rem' }}>
                <label className="form-label">Min Stock Level <span className="required">*</span></label>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  className="form-input"
                  value={editVariantModal.minStockLevel === 0 ? '' : editVariantModal.minStockLevel}
                  onChange={e => {
                    const val = e.target.value;
                    if (val === '' || /^\d+$/.test(val)) {
                      if (val === '' || parseInt(val) <= 999999) {
                        setEditVariantModal({ ...editVariantModal, minStockLevel: val === '' ? 0 : parseInt(val) });
                      }
                    }
                  }}
                  onKeyDown={e => { if (['e', 'E', '+', '-', '.'].includes(e.key)) e.preventDefault(); }}
                  min={0}
                  max={999999}
                  placeholder="10"
                  autoFocus
                />
                <p className="form-hint">Alert triggers when stock falls below this level.</p>
              </div>
            </div>
            <div className="modal-actions">
              <button type="button" className="btn-secondary" onClick={() => setEditVariantModal({ isOpen: false, variant: null, minStockLevel: 0 })}>Cancel</button>
              <button type="button" className="btn-primary" onClick={handleSaveMinStock}>Save Changes</button>
            </div>
          </div>
        </div>
      )}

      {/* Archive Confirm Modal */}
      {archiveConfirmModal.isOpen && archiveConfirmModal.variant && (
        <div className="modal-overlay" onClick={() => setArchiveConfirmModal({ isOpen: false, variant: null, product: null, checkResult: null })}>
          <div className="modal-content modal-content-sm" onClick={e => e.stopPropagation()} style={{ maxWidth: '500px' }}>
            <div className="modal-header">
              {archiveConfirmModal.mode === 'blocked' && <h2 className="modal-title modal-title-warning">Cannot Archive Variant</h2>}
              {archiveConfirmModal.mode === 'archive' && <h2 className="modal-title modal-title-warning">Archive Variant</h2>}
              {archiveConfirmModal.mode === 'delete'  && <h2 className="modal-title">Delete Variant</h2>}
              <button className="modal-close" onClick={() => setArchiveConfirmModal({ isOpen: false, variant: null, product: null, checkResult: null })}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>
            </div>
            <div className="modal-body">
              <div style={{ marginBottom: '1rem' }}>
                <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#E5E2E1', marginBottom: '0.25rem' }}>
                  {archiveConfirmModal.variant.name || archiveConfirmModal.variant.sku}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--gray)', fontFamily: 'monospace' }}>{archiveConfirmModal.variant.sku}</div>
              </div>

              {archiveConfirmModal.mode === 'blocked' && (
                <>
                  <div style={{ padding: '1rem', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '8px', marginBottom: '1rem' }}>
                    <div style={{ fontSize: '0.8rem', color: '#ef4444', fontWeight: 700, marginBottom: '0.5rem' }}>Action Required</div>
                    {archiveConfirmModal.checkResult.hasStock && (
                      <div style={{ fontSize: '0.8rem', color: '#E5E2E1' }}>
                        This variant has <strong style={{ color: '#D4A843' }}>{archiveConfirmModal.variant.totalStock} pcs</strong> remaining stock.
                        <br /><br />
                        Please reduce stock to 0 first via Stock Reduction (−) button.
                      </div>
                    )}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--gray)' }}>
                    Steps to archive:
                    <ol style={{ margin: '0.5rem 0 0 1.25rem', padding: 0 }}>
                      <li>Click the <strong>−</strong> button on this product</li>
                      <li>Select this variant and enter quantity: <strong>{archiveConfirmModal.variant.totalStock}</strong></li>
                      <li>Complete the stock reduction</li>
                      <li>Then try to archive this variant again</li>
                    </ol>
                  </div>
                </>
              )}

              {archiveConfirmModal.mode === 'archive' && (
                <>
                  <div style={{ padding: '1rem', background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.3)', borderRadius: '8px', marginBottom: '1rem' }}>
                    <div style={{ fontSize: '0.8rem', color: '#fbbf24', fontWeight: 700, marginBottom: '0.5rem' }}>Has References</div>
                    <div style={{ fontSize: '0.8rem', color: '#E5E2E1' }}>
                      This variant is referenced by:
                      <ul style={{ margin: '0.5rem 0 0 1.25rem', padding: 0 }}>
                        {archiveConfirmModal.checkResult.hasSales && <li style={{ color: '#E5E2E1' }}>Sales orders (preserved for history)</li>}
                        {archiveConfirmModal.checkResult.hasProducts && <li style={{ color: '#E5E2E1' }}>Storefront products (will show as "Out of Stock")</li>}
                      </ul>
                    </div>
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--gray)', marginBottom: '1rem' }}>
                    Archiving will:
                    <ul style={{ margin: '0.5rem 0 0 1.25rem', padding: 0 }}>
                      <li>Hide this variant from inventory list</li>
                      <li>Preserve all sales history</li>
                      <li>Preserve product links (shows "Out of Stock")</li>
                      <li>Preserve batch records for reporting</li>
                    </ul>
                  </div>
                  <div style={{ fontSize: '0.7rem', color: '#fbbf24', fontStyle: 'italic' }}>
                    This action can be reversed by restoring from archived items.
                  </div>
                </>
              )}

              {archiveConfirmModal.mode === 'delete' && (
                <>
                  <div style={{ padding: '1rem', background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.3)', borderRadius: '8px', marginBottom: '1rem' }}>
                    <div style={{ fontSize: '0.8rem', color: '#4ade80', fontWeight: 700, marginBottom: '0.5rem' }}>Safe to Delete</div>
                    <div style={{ fontSize: '0.8rem', color: '#E5E2E1' }}>
                      This variant has no references:
                      <ul style={{ margin: '0.5rem 0 0 1.25rem', padding: 0 }}>
                        <li style={{ color: '#E5E2E1' }}>✓ No remaining stock</li>
                        <li style={{ color: '#E5E2E1' }}>✓ No sales history</li>
                        <li style={{ color: '#E5E2E1' }}>✓ No linked products</li>
                        <li style={{ color: '#E5E2E1' }}>✓ No active batches</li>
                      </ul>
                    </div>
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#ef4444' }}>
                    <strong>Warning:</strong> This will permanently delete this variant. This action cannot be undone.
                  </div>
                </>
              )}
            </div>
            <div className="modal-actions">
              {archiveConfirmModal.mode === 'blocked' && (
                <button type="button" className="btn-secondary" onClick={() => setArchiveConfirmModal({ isOpen: false, variant: null, product: null, checkResult: null })}>OK</button>
              )}
              {archiveConfirmModal.mode === 'archive' && (
                <>
                  <button type="button" className="btn-secondary" onClick={() => setArchiveConfirmModal({ isOpen: false, variant: null, product: null, checkResult: null })}>Cancel</button>
                  <button type="button" className="btn-primary" onClick={confirmArchive} style={{ background: '#D4A843', color: '#000' }}>Archive</button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}