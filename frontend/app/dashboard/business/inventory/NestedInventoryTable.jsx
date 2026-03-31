'use client';

import React, { useState } from 'react';
import { formatPrice } from '../../../../src/utils/format';

// ── Card-Based Inventory Display ─────────────────────────────────────────────
// Clean card design without variant dots or product icons
// Variant Summary: mini-cards visible by default (no toggle needed)
// Batch History: collapsed by default, toggle to expand

function extractBaseProductName(fullName) {
  const patterns = [
    /\s+[A-Za-z]+\s*\/\s*\d+oz.*$/i,
    /\s+[A-Za-z]+\s*\/\s*\d+ml.*$/i,
    /\s+\d+oz\s*\/.*$/i,
    /\s+\d+ml\s*\/.*$/i,
    /\s+\d+oz$/i,
    /\s+\d+ml$/i,
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
  const [actionMenuOpen, setActionMenuOpen] = useState(null);
  const [archiveConfirmModal, setArchiveConfirmModal] = useState({ isOpen: false, variant: null, product: null, checkResult: null });
  const [stockActionModal, setStockActionModal] = useState({ isOpen: false, variant: null, product: null, minStockLevel: 0 });

  const getVariantStatus = (variant) => {
    const stock = variant.totalStock || variant.stock || 0;
    const minStock = variant.minStockLevel || 10;
    if (stock === 0) return 'out-of-stock';
    if (stock < minStock) return 'low-stock';
    return 'in-stock';
  };

  const getVariantBorderColor = (variant) => {
    const status = getVariantStatus(variant);
    if (status === 'out-of-stock') return '#ef4444';
    if (status === 'low-stock') return '#D4A843';
    return 'rgba(255,255,255,0.1)';
  };

  const checkVariantReferences = (variant) => {
    const hasStock = variant.totalStock > 0;
    const sales = JSON.parse(localStorage.getItem('pmp_sales') || '[]');
    const hasSales = sales.some(s =>
      s.inventoryId === variant.sku ||
      s.variantSku === variant.sku ||
      s.items?.some(i => i.sku === variant.sku)
    );
    const products = JSON.parse(localStorage.getItem('pmp_products') || '[]');
    const hasProducts = products.some(p =>
      p.variantSku === variant.sku || p.sku === variant.sku
    );
    const inventoryItems = inventory.filter(i => i.sku === variant.sku);
    const hasBatches = inventoryItems.some(i =>
      (i.batches || []).some(b => (b.remainingQty || 0) > 0)
    );
    return {
      hasStock, hasSales, hasProducts, hasBatches,
      canHardDelete: !hasStock && !hasSales && !hasProducts && !hasBatches,
      canArchive: !hasStock,
    };
  };

  const handleVariantClick = (variant, product) => {
    const inventoryItem = inventory.find(item => item.sku === variant.sku || item.id === variant.id);
    setStockActionModal({
      isOpen: true, variant, product,
      minStockLevel: inventoryItem?.minStockLevel || variant.minStockLevel || 10
    });
  };

  const handleActionMenuClick = (e, variant, product) => {
    e.stopPropagation();
    setActionMenuOpen(actionMenuOpen === variant.sku ? null : variant.sku);
  };

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

  const confirmArchive = () => {
    if (archiveConfirmModal.variant && onArchiveVariant) {
      onArchiveVariant(archiveConfirmModal.variant, archiveConfirmModal.product);
      setArchiveConfirmModal({ isOpen: false, variant: null, product: null, checkResult: null });
    }
  };

  const handleSaveMinStock = () => {
    if (editVariantModal.variant && onUpdateMinStock) {
      onUpdateMinStock(editVariantModal.variant.sku, editVariantModal.minStockLevel);
      setEditVariantModal({ isOpen: false, variant: null, minStockLevel: 0 });
    }
  };

  React.useEffect(() => {
    const handleClickOutside = () => setActionMenuOpen(null);
    if (actionMenuOpen) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [actionMenuOpen]);

  // ── Build products map ────────────────────────────────────────────────────
  // Filter out archived items (isActive === false)
  const activeInventory = inventory.filter(item => item.isActive !== false);
  const productsMap = activeInventory.reduce((acc, item) => {
    // Use masterlistProductName if available (most reliable), fallback to name parsing
    const baseProductName = item.masterlistProductName || extractBaseProductName(item.name);
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
      acc[baseProductName].variants.set(variantKey, {
        sku: item.sku,
        name: rawVariantName || baseProductName,
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
            batchKey, batchId: batch.batchId,
            supplierName: batch.supplierName, supplierId: batch.supplierId,
            invoiceNumber: batch.invoiceNumber, dateReceived: batch.dateReceived,
            items: [], totalQty: 0, totalCost: 0, receivedQty: 0
          });
        }
        const existingBatch = acc[baseProductName].batches.get(batchKey);
        const existingItem = existingBatch.items.find(i => i.sku === item.sku);
        const itemCost = (batch.remainingQty || 0) * (batch.unitCost || 0);
        const damagedFromMovements = (batch.movements || [])
          .filter(m => m.type === 'damaged')
          .reduce((sum, m) => sum + Math.abs(m.quantity), 0);
        const rawVariantName = extractVariantName(item.name, baseProductName);
        if (existingItem) {
          existingItem.remainingQty += batch.remainingQty || 0;
          existingItem.goodQty += batch.goodQty || 0;
          existingItem.damagedQty += damagedFromMovements;
          existingItem.totalCost = existingItem.remainingQty * existingItem.unitCost;
        } else {
          existingBatch.items.push({
            sku: item.sku,
            variantName: rawVariantName || baseProductName,
            remainingQty: batch.remainingQty || 0,
            goodQty: batch.goodQty || 0,
            damagedQty: damagedFromMovements,
            unitCost: batch.unitCost || 0,
            totalCost: itemCost
          });
        }
        existingBatch.totalQty += batch.remainingQty || 0;
        existingBatch.receivedQty += batch.goodQty || batch.remainingQty || 0;
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

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {products.map((product) => {
          const isProductExpanded = expandedProducts.has(product.name);
          const variantList = Array.from(product.variants.values());
          const productTotalStock = variantList.reduce((sum, v) => sum + v.totalStock, 0);
          const productMinStock = variantList.reduce((sum, v) => sum + (v.minStockLevel || 10), 0);
          const hasOutOfStock = productTotalStock === 0;
          const hasLowStock = productTotalStock > 0 && productTotalStock < productMinStock;
          const isBatchOpen = expandedBatchSections.has(product.name);
          const unit = (product.category || product.name || '').toLowerCase().includes('ink') ? 'LITERS' : 'PCS';

          return (
            <div
              key={product.name}
              style={{
                background: 'rgba(255,255,255,0.025)',
                border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: '14px',
                overflow: 'hidden',
              }}
            >
              {/* ── PRODUCT HEADER ─────────────────────────────────────────── */}
              <div
                onClick={() => onExpandProduct(product.name)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '0.875rem 1.25rem',
                  borderBottom: isProductExpanded ? '1px solid rgba(255,255,255,0.07)' : 'none',
                  cursor: 'pointer', userSelect: 'none',
                  background: isProductExpanded ? 'rgba(255,255,255,0.015)' : 'transparent',
                  transition: 'background 0.2s',
                }}
              >
                {/* Left: name + category + status badges */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1, minWidth: 0 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 700, color: '#E5E2E1', fontSize: '0.92rem' }}>{product.name}</span>
                      <span style={{
                        background: 'rgba(212,168,67,0.15)', color: '#D4A843',
                        padding: '0.12rem 0.5rem', borderRadius: '20px',
                        fontSize: '0.58rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em'
                      }}>{product.category}</span>
                      {hasOutOfStock && (
                        <span style={{ background: 'rgba(239,68,68,0.12)', color: '#f87171', padding: '0.12rem 0.5rem', borderRadius: '20px', fontSize: '0.58rem', fontWeight: 700, textTransform: 'uppercase' }}>Out of Stock</span>
                      )}
                      {!hasOutOfStock && hasLowStock && (
                        <span style={{ background: 'rgba(212,168,67,0.12)', color: '#D4A843', padding: '0.12rem 0.5rem', borderRadius: '20px', fontSize: '0.58rem', fontWeight: 700, textTransform: 'uppercase' }}>Low Stock</span>
                      )}
                    </div>
                    <div style={{ fontSize: '0.7rem', color: '#6b7280', marginTop: '0.15rem' }}>Category: {product.category}</div>
                  </div>
                </div>

                {/* Right: Total stock + variant count + remove + chevron */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexShrink: 0 }}>
                  {/* Variant Count Badge */}
                  <div style={{
                    padding: '0.35rem 0.7rem',
                    background: 'rgba(255,255,255,0.08)',
                    borderRadius: '999px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.35rem'
                  }}>
                    <span style={{ fontSize: '0.7rem', color: '#9ca3af', fontWeight: 600 }}>
                      {variantList.length} {variantList.length === 1 ? 'variant' : 'variants'}
                    </span>
                  </div>

                  {/* Total Stock */}
                  <div style={{ textAlign: 'right', minWidth: '72px' }}>
                    <div style={{ fontSize: '0.54rem', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 600 }}>Total Stock</div>
                    <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#D4A843', lineHeight: 1.1 }}>
                      {productTotalStock}
                      <span style={{ fontSize: '0.58rem', color: '#6b7280', marginLeft: '0.2rem', fontWeight: 600 }}>{unit}</span>
                    </div>
                  </div>

                  {/* Remove */}
                  <button
                    onClick={(e) => { e.stopPropagation(); onRemoveItem(product); }}
                    style={{
                      background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.28)',
                      color: '#f87171', borderRadius: '7px', padding: '0.35rem 0.7rem',
                      fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s', whiteSpace: 'nowrap'
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.22)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.12)'; }}
                  >Remove</button>

                  {/* Chevron */}
                  <div style={{
                    width: '28px', height: '28px', borderRadius: '50%', flexShrink: 0,
                    background: isProductExpanded ? 'rgba(212,168,67,0.15)' : 'rgba(255,255,255,0.05)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s'
                  }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                      stroke={isProductExpanded ? '#D4A843' : '#6b7280'} strokeWidth="2.5"
                      style={{ transition: 'transform 0.25s', transform: isProductExpanded ? 'rotate(180deg)' : 'none' }}>
                      <path d="M6 9l6 6 6-6"/>
                    </svg>
                  </div>
                </div>
              </div>

              {/* ── EXPANDED BODY ──────────────────────────────────────────── */}
              {isProductExpanded && (
                <div>

                  {/* VARIANT SUMMARY — always visible when product is expanded, no toggle */}
                  <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                    <div style={{ fontSize: '0.6rem', color: '#6b7280', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.1em', marginBottom: '0.75rem' }}>
                      Variant Summary
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem' }}>
                      {variantList.map((v, idx) => {
                        const status = getVariantStatus(v);
                        const borderColor = getVariantBorderColor(v);
                        const isMenuOpen = actionMenuOpen === v.sku;

                        return (
                          <div key={v.sku} style={{ position: 'relative' }}>
                            {/* Mini card */}
                            <div
                              onClick={() => handleVariantClick(v, product)}
                              style={{
                                background: 'rgba(0,0,0,0.2)',
                                border: `1.5px solid ${borderColor}`,
                                borderRadius: '8px',
                                padding: '0.6rem 0.85rem',
                                paddingRight: '2rem',
                                cursor: 'pointer',
                                transition: 'all 0.15s',
                                opacity: status === 'out-of-stock' ? 0.65 : 1,
                                minWidth: '155px',
                              }}
                              onMouseEnter={e => {
                                e.currentTarget.style.background = 'rgba(255,255,255,0.06)';
                                e.currentTarget.style.transform = 'translateY(-1px)';
                              }}
                              onMouseLeave={e => {
                                e.currentTarget.style.background = 'rgba(0,0,0,0.2)';
                                e.currentTarget.style.transform = 'none';
                              }}
                            >
                              {/* Name */}
                              <div style={{ fontWeight: 600, color: '#E5E2E1', fontSize: '0.82rem', marginBottom: '0.25rem' }}>
                                {v.name || v.sku}
                              </div>
                              {/* SKU */}
                              <div style={{ fontSize: '0.65rem', color: '#6b7280', fontFamily: 'monospace', marginBottom: '0.35rem' }}>
                                {v.sku}
                              </div>
                              {/* Stock + Min */}
                              <div style={{ fontSize: '0.7rem', color: '#9ca3af' }}>
                                Stock:{' '}
                                <strong style={{ color: '#D4A843' }}>
                                  {v.totalStock} {unit === 'LITERS' ? 'L' : 'pcs'}
                                </strong>
                                <span style={{ margin: '0 0.3rem', color: '#374151' }}>|</span>
                                Min:{' '}
                                <strong style={{ color: v.totalStock < v.minStockLevel ? '#fbbf24' : '#6b7280' }}>
                                  {v.minStockLevel}
                                </strong>
                              </div>
                            </div>

                            {/* Three-dot action button */}
                            <div
                              onClick={(e) => handleActionMenuClick(e, v, product)}
                              style={{
                                position: 'absolute', top: '0.5rem', right: '0.45rem',
                                width: '22px', height: '22px', borderRadius: '4px',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                cursor: 'pointer', zIndex: 2,
                                background: isMenuOpen ? 'rgba(212,168,67,0.2)' : 'transparent',
                                color: isMenuOpen ? '#D4A843' : '#6b7280',
                                transition: 'all 0.15s',
                              }}
                              onMouseEnter={e => {
                                e.stopPropagation();
                                e.currentTarget.style.background = 'rgba(212,168,67,0.2)';
                                e.currentTarget.style.color = '#D4A843';
                              }}
                              onMouseLeave={e => {
                                e.stopPropagation();
                                e.currentTarget.style.background = isMenuOpen ? 'rgba(212,168,67,0.2)' : 'transparent';
                                e.currentTarget.style.color = isMenuOpen ? '#D4A843' : '#6b7280';
                              }}
                              title="Variant actions"
                            >
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                                <circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/>
                              </svg>
                            </div>

                            {/* Dropdown menu */}
                            {isMenuOpen && (
                              <div
                                onClick={(e) => e.stopPropagation()}
                                style={{
                                  position: 'absolute', top: '2rem', right: '0',
                                  background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.1)',
                                  borderRadius: '8px', boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
                                  zIndex: 200, minWidth: '160px', overflow: 'hidden'
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
                                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(251,191,36,0.08)'; }}
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
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* BATCH / INVOICE HISTORY — collapsed by default */}
                  {Array.from(product.batches.values()).length > 0 && (
                    <>
                      <div
                        onClick={() => onExpandBatchSection(product.name)}
                        style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          padding: '0.55rem 1.25rem', cursor: 'pointer', userSelect: 'none',
                          background: 'rgba(0,0,0,0.18)',
                          borderBottom: isBatchOpen ? '1px solid rgba(255,255,255,0.06)' : 'none',
                          transition: 'background 0.2s',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(0,0,0,0.28)'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'rgba(0,0,0,0.18)'; }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2.5"
                            style={{ transition: 'transform 0.2s', transform: isBatchOpen ? 'rotate(90deg)' : 'none', flexShrink: 0 }}>
                            <path d="M9 18l6-6-6-6"/>
                          </svg>
                          <span style={{ fontSize: '0.62rem', color: '#6b7280', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.1em' }}>
                            Batch / Invoice History
                          </span>
                        </div>
                      </div>

                      {isBatchOpen && (() => {
                        const batchList = Array.from(product.batches.values())
                          .filter(batch => batch.totalQty > 0)
                          .sort((a, b) => new Date(a.dateReceived) - new Date(b.dateReceived));

                        const thCell = (label, align = 'left') => (
                          <th style={{ padding: '0.5rem 0.75rem', textAlign: align, color: '#6b7280', fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>
                            {label}
                          </th>
                        );

                        return (
                          <div style={{ maxHeight: '224px', overflowY: 'auto', overflowX: 'hidden' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', tableLayout: 'fixed' }}>
                              <colgroup>
                                <col style={{ width: '40px' }} />
                                <col style={{ width: '18%' }} />
                                <col style={{ width: '16%' }} />
                                <col style={{ width: '14%' }} />
                                <col style={{ width: '13%' }} />
                                <col style={{ width: '10%' }} />
                                <col style={{ width: '14%' }} />
                                <col style={{ width: '15%' }} />
                              </colgroup>
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
                                      <tr
                                        style={{
                                          borderBottom: '1px solid rgba(255,255,255,0.06)',
                                          background: isBatchExpanded ? 'rgba(212,168,67,0.04)' : 'transparent',
                                          cursor: 'pointer',
                                        }}
                                        onMouseEnter={e => { if (!isBatchExpanded) e.currentTarget.style.background = 'rgba(255,255,255,0.02)'; }}
                                        onMouseLeave={e => { if (!isBatchExpanded) e.currentTarget.style.background = isBatchExpanded ? 'rgba(212,168,67,0.04)' : 'transparent'; }}
                                        onClick={() => onExpandBatch(expandKey)}
                                      >
                                        <td style={{ padding: '0.75rem 0.5rem 0.75rem 1.25rem', textAlign: 'center' }}>
                                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2.5"
                                            style={{ transition: 'transform 0.2s', transform: isBatchExpanded ? 'rotate(90deg)' : 'none', display: 'block', margin: '0 auto' }}>
                                            <path d="M9 18l6-6-6-6"/>
                                          </svg>
                                        </td>
                                        <td style={{ padding: '0.75rem' }}>
                                          <span style={{ fontFamily: 'monospace', color: '#D4A843', fontWeight: 700, fontSize: '0.85rem' }}>{batch.batchId}</span>
                                        </td>
                                        <td style={{ padding: '0.75rem', color: '#d1d5db' }}>{batch.supplierName || 'General'}</td>
                                        <td style={{ padding: '0.75rem', color: '#d1d5db', fontFamily: 'monospace', fontSize: '0.78rem' }}>{batch.invoiceNumber || '—'}</td>
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
                                        <td style={{ padding: '0.75rem', textAlign: 'right', color: '#D4A843', fontWeight: 700, fontSize: '0.85rem' }}>
                                          {formatPrice(batch.totalCost)}
                                        </td>
                                      </tr>

                                      {/* LEVEL 3: batch items breakdown */}
                                      {isBatchExpanded && (
                                        <tr>
                                          <td colSpan={8} style={{ padding: 0, background: 'rgba(0,0,0,0.2)' }}>
                                            <div style={{ padding: '0.75rem 1.25rem 0.75rem 3rem' }}>
                                              <div style={{ fontSize: '0.62rem', color: '#6b7280', textTransform: 'uppercase', marginBottom: '0.6rem', fontWeight: 700, letterSpacing: '0.08em' }}>
                                                Items in this Batch
                                              </div>
                                              <div style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', overflow: 'hidden' }}>
                                                <table style={{ width: '100%', fontSize: '0.75rem', borderCollapse: 'collapse' }}>
                                                  <thead>
                                                    <tr style={{ background: 'rgba(0,0,0,0.3)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                                                      {['Variant', 'SKU', 'Initial Good', 'Stock Out', 'Remaining', 'Unit Cost'].map((h, i) => (
                                                        <th key={h} style={{ padding: '0.45rem 0.75rem', textAlign: i === 0 ? 'left' : 'center', color: '#6b7280', fontWeight: 600, fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                                                      ))}
                                                    </tr>
                                                  </thead>
                                                  <tbody>
                                                    {batch.items.map((item, itemIdx) => {
                                                      const stockOutQty = Math.max(0, (item.goodQty || 0) - (item.remainingQty || 0));
                                                      return (
                                                        <tr key={item.sku} style={{
                                                          background: itemIdx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)',
                                                          borderBottom: '1px solid rgba(255,255,255,0.04)'
                                                        }}>
                                                          <td style={{ padding: '0.45rem 0.75rem', fontWeight: 600, color: '#E5E2E1' }}>{item.variantName}</td>
                                                          <td style={{ padding: '0.45rem 0.75rem', textAlign: 'center', fontFamily: 'monospace', color: '#6b7280', fontSize: '0.7rem' }}>{item.sku}</td>
                                                          <td style={{ padding: '0.45rem 0.75rem', textAlign: 'center', fontWeight: 600, color: '#E5E2E1' }}>{item.goodQty || 0}</td>
                                                          <td style={{ padding: '0.45rem 0.75rem', textAlign: 'center', fontWeight: 600, color: '#E5E2E1' }}>{stockOutQty > 0 ? stockOutQty : '0'}</td>
                                                          <td style={{ padding: '0.45rem 0.75rem', textAlign: 'center', fontWeight: 700, color: '#D4A843' }}>{item.remainingQty || 0}</td>
                                                          <td style={{ padding: '0.45rem 0.75rem', textAlign: 'center', color: '#D4A843', fontWeight: 600 }}>{formatPrice(item.unitCost)}</td>
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
                          </div>
                        );
                      })()}
                    </>
                  )}

                  {product.batches.size === 0 && (
                    <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280', fontSize: '0.8rem' }}>
                      No batches found. Add stock to create your first batch.
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── STOCK ACTION MODAL ── */}
      {stockActionModal.isOpen && stockActionModal.variant && (
        <div className="modal-overlay" onClick={() => setStockActionModal({ isOpen: false, variant: null, product: null, minStockLevel: 0 })}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '480px', borderRadius: '16px', overflow: 'hidden' }}>
            {/* Modal Header */}
            <div style={{ padding: '1.5rem 2rem', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <span style={{ fontSize: '0.65rem', color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.15em', fontWeight: 600 }}>Variant Actions</span>
                <h2 className="modal-title" style={{ margin: '0.25rem 0 0 0', fontSize: '1.5rem' }}>{stockActionModal.variant.name || stockActionModal.variant.sku}</h2>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem' }}>
                  <span style={{ fontSize: '0.7rem', color: 'var(--gray)', textTransform: 'uppercase', fontWeight: 600 }}>SKU:</span>
                  <span style={{ fontFamily: 'monospace', color: 'var(--gray)', fontSize: '0.75rem', background: 'rgba(255,255,255,0.06)', padding: '0.2rem 0.5rem', borderRadius: '4px', letterSpacing: '0.05em' }}>{stockActionModal.variant.sku}</span>
                </div>
              </div>
              <button className="modal-close" onClick={() => setStockActionModal({ isOpen: false, variant: null, product: null, minStockLevel: 0 })}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '0.5rem', color: 'var(--gray)', borderRadius: '50%', transition: 'all 0.2s' }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = 'var(--white)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--gray)'; }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>
            </div>

            {/* Modal Body */}
            <div className="modal-body" style={{ padding: '2rem' }}>
              {/* Current Availability Banner */}
              <div style={{ 
                background: 'linear-gradient(135deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.02) 100%)', 
                padding: '1.5rem', 
                borderRadius: '16px', 
                border: '1px solid rgba(255,255,255,0.08)',
                borderLeft: '3px solid var(--gold)',
                marginBottom: '2rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}>
                <div>
                  <p style={{ fontSize: '0.65rem', color: 'var(--gray)', textTransform: 'uppercase', letterSpacing: '0.2em', fontWeight: 600, margin: '0 0 0.5rem 0' }}>Current Availability</p>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
                    <span style={{ fontSize: '3rem', fontWeight: 800, color: 'var(--white)', lineHeight: 1 }}>{stockActionModal.variant.totalStock}</span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--gray)', textTransform: 'uppercase', letterSpacing: '0.15em', fontWeight: 700 }}>Units</span>
                  </div>
                </div>
                <div style={{ color: 'var(--gold)', opacity: 0.2, transform: 'scale(1.8)' }}>
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M4 4h16v16H4z" opacity="0.3"/>
                    <path d="M6 6h12v12H6z"/>
                  </svg>
                </div>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {/* Add Stock Button */}
                <button type="button"
                  onClick={() => { setStockActionModal({ isOpen: false, variant: null, product: null, minStockLevel: 0 }); onAddStock({ ...stockActionModal.product, rawItems: stockActionModal.product.rawItems }); }}
                  style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'space-between',
                    padding: '1.25rem 1.5rem',
                    background: 'linear-gradient(135deg, rgba(212,168,67,0.2) 0%, rgba(212,168,67,0.1) 100%)',
                    border: '1px solid rgba(212,168,67,0.4)',
                    borderRadius: '12px',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    boxShadow: '0 4px 20px rgba(212,168,67,0.1)'
                  }}
                  onMouseEnter={e => { 
                    e.currentTarget.style.background = 'linear-gradient(135deg, rgba(212,168,67,0.3) 0%, rgba(212,168,67,0.15) 100%)';
                    e.currentTarget.style.boxShadow = '0 8px 30px rgba(212,168,67,0.2)';
                    e.currentTarget.style.transform = 'translateY(-2px)';
                  }}
                  onMouseLeave={e => { 
                    e.currentTarget.style.background = 'linear-gradient(135deg, rgba(212,168,67,0.2) 0%, rgba(212,168,67,0.1) 100%)';
                    e.currentTarget.style.boxShadow = '0 4px 20px rgba(212,168,67,0.1)';
                    e.currentTarget.style.transform = 'translateY(0)';
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div style={{ 
                      width: '48px', 
                      height: '48px', 
                      borderRadius: '10px', 
                      background: 'rgba(212,168,67,0.15)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}>
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" strokeWidth="2.5">
                        <path d="M12 5v14M5 12h14"/>
                      </svg>
                    </div>
                    <div style={{ textAlign: 'left' }}>
                      <span style={{ display: 'block', fontWeight: 700, fontSize: '1.1rem', color: 'var(--white)', marginBottom: '0.25rem' }}>Add Stock</span>
                      <span style={{ display: 'block', fontSize: '0.65rem', color: 'var(--gray)', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 600 }}>Register new shipment</span>
                    </div>
                  </div>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" strokeWidth="2" style={{ transition: 'transform 0.2s' }}>
                    <path d="M9 18l6-6-6-6"/>
                  </svg>
                </button>

                {/* Reduce Stock Button */}
                <button type="button"
                  onClick={() => { setStockActionModal({ isOpen: false, variant: null, product: null, minStockLevel: 0 }); onReduceStock({ ...stockActionModal.product, rawItems: stockActionModal.product.rawItems }); }}
                  style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'space-between',
                    padding: '1.25rem 1.5rem',
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: '12px',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={e => { 
                    e.currentTarget.style.background = 'rgba(255,255,255,0.06)';
                    e.currentTarget.style.transform = 'translateY(-2px)';
                  }}
                  onMouseLeave={e => { 
                    e.currentTarget.style.background = 'rgba(255,255,255,0.03)';
                    e.currentTarget.style.transform = 'translateY(0)';
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div style={{ 
                      width: '48px', 
                      height: '48px', 
                      borderRadius: '10px', 
                      background: 'rgba(255,255,255,0.08)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}>
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" strokeWidth="2.5">
                        <path d="M5 12h14"/>
                      </svg>
                    </div>
                    <div style={{ textAlign: 'left' }}>
                      <span style={{ display: 'block', fontWeight: 700, fontSize: '1.1rem', color: 'var(--white)', marginBottom: '0.25rem' }}>Reduce Stock</span>
                      <span style={{ display: 'block', fontSize: '0.65rem', color: 'var(--gray)', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 600 }}>Damaged or sold manually</span>
                    </div>
                  </div>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--gray)" strokeWidth="2" style={{ transition: 'transform 0.2s' }}>
                    <path d="M9 18l6-6-6-6"/>
                  </svg>
                </button>
              </div>

              {/* Edit Min Stock Button */}
              <div style={{ paddingTop: '1.5rem', display: 'flex', justifyContent: 'center' }}>
                <button type="button"
                  onClick={() => { setStockActionModal({ isOpen: false, variant: null, product: null, action: null }); setEditVariantModal({ isOpen: true, variant: stockActionModal.variant, product: stockActionModal.product, minStockLevel: stockActionModal.minStockLevel }); }}
                  style={{ 
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    padding: '0.75rem 1.5rem',
                    background: 'transparent',
                    border: 'none',
                    borderRadius: '9999px',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    color: 'var(--gray)',
                    fontSize: '0.8rem',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.15em'
                  }}
                  onMouseEnter={e => { 
                    e.currentTarget.style.color = 'var(--gold)';
                    e.currentTarget.style.background = 'rgba(212,168,67,0.05)';
                  }}
                  onMouseLeave={e => { 
                    e.currentTarget.style.color = 'var(--gray)';
                    e.currentTarget.style.background = 'transparent';
                  }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                  </svg>
                  Edit Min Stock Level
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── EDIT VARIANT MODAL ── */}
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
                  type="text" inputMode="numeric" pattern="[0-9]*" className="form-input"
                  value={editVariantModal.minStockLevel === 0 ? '' : editVariantModal.minStockLevel}
                  onChange={e => { const val = e.target.value; if (val === '' || /^\d+$/.test(val)) { if (val === '' || parseInt(val) <= 999999) { setEditVariantModal({ ...editVariantModal, minStockLevel: val === '' ? 0 : parseInt(val) }); } } }}
                  onKeyDown={e => { if (['e', 'E', '+', '-', '.'].includes(e.key)) e.preventDefault(); }}
                  min={0} max={999999} placeholder="10" autoFocus
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

      {/* ── ARCHIVE CONFIRM MODAL ── */}
      {archiveConfirmModal.isOpen && archiveConfirmModal.variant && (
        <div className="modal-overlay" onClick={() => setArchiveConfirmModal({ isOpen: false, variant: null, product: null, checkResult: null })}>
          <div className="modal-content modal-content-sm" onClick={e => e.stopPropagation()} style={{ maxWidth: '500px' }}>
            <div className="modal-header">
              {archiveConfirmModal.mode === 'blocked' && <h2 className="modal-title modal-title-warning">Cannot Archive Variant</h2>}
              {archiveConfirmModal.mode === 'archive' && <h2 className="modal-title modal-title-warning">Archive Variant</h2>}
              {archiveConfirmModal.mode === 'delete' && <h2 className="modal-title">Delete Variant</h2>}
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
                      <div style={{ fontSize: '0.85rem', color: '#E5E2E1' }}>
                        This variant has <strong style={{ color: '#D4A843' }}>{archiveConfirmModal.variant.totalStock} pcs</strong> remaining stock.
                        <br /><br />Reduce stock to <strong style={{ color: '#D4A843' }}>0</strong> or wait until Stocks were Depleted.
                      </div>
                    )}
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
                        {archiveConfirmModal.checkResult.hasSales && <li>Sales orders (preserved for history)</li>}
                        {archiveConfirmModal.checkResult.hasProducts && <li>Storefront products (will show as "Out of Stock")</li>}
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
                      <ul style={{ margin: '0.5rem 0 0 1.25rem', padding: 0 }}>
                        <li>✓ No remaining stock</li><li>✓ No sales history</li>
                        <li>✓ No linked products</li><li>✓ No active batches</li>
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