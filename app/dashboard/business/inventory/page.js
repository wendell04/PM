'use client';

/**
 * INVENTORY MANAGEMENT PAGE
 * 
 * Features:
 * - Add/Edit/Delete inventory items (blank materials)
 * - Inline editing for stock levels
 * - Status filtering (Low Stock, Out of Stock, Upon Order)
 * - Search by name or category
 * - Confirmation modals for Add/Edit and Delete actions
 * 
 * TODO: MongoDB Integration - Replace LocalStorage with:
 * - GET /api/inventory - Fetch all inventory items
 * - POST /api/inventory - Add new item
 * - PUT /api/inventory/:id - Update item
 * - DELETE /api/inventory/:id - Delete item
 */

import { useState, useEffect } from 'react';

// ── LocalStorage Key ───────────────────────────────────────────────────────────
const INVENTORY_STORAGE_KEY = 'pmp_inventory';

// ── LocalStorage Helpers ───────────────────────────────────────────────────────
// TODO: MongoDB - Replace with API calls:
// - getInventoryList() → GET /api/inventory
// - saveInventoryList() → POST /api/inventory or PUT /api/inventory/:id
export function getInventoryList() {
  if (typeof window === 'undefined') return [];
  try {
    const stored = localStorage.getItem(INVENTORY_STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch (error) {
    console.error('Error reading inventory from LocalStorage:', error);
    return [];
  }
}

// TODO: MongoDB - Replace with API call to save/update inventory item
export function saveInventoryList(inventory) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(INVENTORY_STORAGE_KEY, JSON.stringify(inventory));
  } catch (error) {
    console.error('Error saving inventory to LocalStorage:', error);
  }
}

// ── Categories ─────────────────────────────────────────────────────────────────
const CATEGORIES = [
  'Mugs',
  'T-Shirt',
  'Stickers',
  'Phone Cases',
  'Accessories',
  'Home & Living',
  'Stationery',
  'Others'
];

// ── Initial Sample Data ────────────────────────────────────────────────────────
const initialInventory = [
  {
    id: crypto.randomUUID(),
    name: 'Ceramic',
    category: 'Mugs',
    stockQty: 100,
    minStockLevel: 20,
    isOnDemand: false
  },
  {
    id: crypto.randomUUID(),
    name: 'Magic Mug',
    category: 'Mugs',
    stockQty: 50,
    minStockLevel: 15,
    isOnDemand: false
  },
  {
    id: crypto.randomUUID(),
    name: 'Silkscreen T-Shirt',
    category: 'T-Shirt',
    stockQty: 0,
    minStockLevel: 10,
    isOnDemand: true
  },
  {
    id: crypto.randomUUID(),
    name: 'Vinyl Sticker',
    category: 'Stickers',
    stockQty: 200,
    minStockLevel: 50,
    isOnDemand: false
  }
];

// ── Modal Component ────────────────────────────────────────────────────────────
function InventoryModal({ isOpen, onClose, onSave, item, categories }) {
  const [formData, setFormData] = useState({
    name: '',
    category: 'Mugs',
    stockQty: 0,
    minStockLevel: 10,
    isOnDemand: false
  });

  useEffect(() => {
    if (item) {
      setFormData({
        name: item.name || '',
        category: item.category || 'Mugs',
        stockQty: item.stockQty || 0,
        minStockLevel: item.minStockLevel || 10,
        isOnDemand: item.isOnDemand || false
      });
    } else {
      setFormData({
        name: '',
        category: 'Mugs',
        stockQty: 0,
        minStockLevel: 10,
        isOnDemand: false
      });
    }
  }, [item]);

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleNumberInput = (e) => {
    const { name, value } = e.target;
    const sanitized = value === '' ? '0' : Math.max(0, parseInt(value) || 0);
    setFormData(prev => ({
      ...prev,
      [name]: sanitized
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      alert('Please enter a product name');
      return;
    }
    onSave({
      ...formData,
      stockQty: parseInt(formData.stockQty),
      minStockLevel: parseInt(formData.minStockLevel)
    });
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">
            {item ? 'Edit Inventory Item' : 'Add New Inventory Item'}
          </h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <form onSubmit={handleSubmit} className="modal-form">
          <div className="form-group">
            <label className="form-label">
              Product Name <span className="required">*</span>
            </label>
            <input
              type="text"
              name="name"
              className="form-input"
              value={formData.name}
              onChange={handleInputChange}
              placeholder="e.g., Ceramic, Magic Mug..."
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">
              Category <span className="required">*</span>
            </label>
            <select
              name="category"
              className="form-select"
              value={formData.category}
              onChange={handleInputChange}
              required
            >
              {categories.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-checkbox-label">
              <input
                type="checkbox"
                name="isOnDemand"
                className="form-checkbox"
                checked={formData.isOnDemand}
                onChange={handleInputChange}
              />
              <span className="checkbox-text">
                Upon Order / Supplied (stock ignored)
              </span>
            </label>
            <p className="form-hint">
              When enabled, stock levels will be bypassed and item will always show as available.
            </p>
          </div>

          {!formData.isOnDemand && (
            <>
              <div className="form-group">
                <label className="form-label">Current Stock</label>
                <input
                  type="number"
                  name="stockQty"
                  className="form-input"
                  value={formData.stockQty}
                  onChange={handleNumberInput}
                  min="0"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Min. Stock Level</label>
                <input
                  type="number"
                  name="minStockLevel"
                  className="form-input"
                  value={formData.minStockLevel}
                  onChange={handleNumberInput}
                  min="0"
                />
              </div>
            </>
          )}

          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn-primary">
              {item ? 'Update Item' : 'Add Item'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Delete Confirmation Modal ──────────────────────────────────────────────────
function DeleteConfirmModal({ isOpen, onClose, onConfirm, itemName }) {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content modal-content-sm" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title modal-title-danger">Confirm Delete</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="modal-body">
          <p className="delete-confirm-text">
            Are you sure you want to delete <strong>"{itemName}"</strong>?
          </p>
          <p className="delete-confirm-warning">
            This action cannot be undone. This item will be removed from your inventory and may affect existing products.
          </p>
        </div>

        <div className="modal-actions">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn-danger" onClick={onConfirm}>
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Confirm Save Modal (Add/Edit) ─────────────────────────────────────────────
function ConfirmSaveModal({ isOpen, onClose, onConfirm, itemData, isEdit }) {
  if (!isOpen || !itemData) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content modal-content-sm" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title modal-title-success">
            {isEdit ? 'Update Item' : 'Add New Item'}
          </h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="modal-body">
          <div className="confirm-summary">
            <div className="confirm-row">
              <span className="confirm-label">Product Name:</span>
              <span className="confirm-value">{itemData.name}</span>
            </div>
            <div className="confirm-row">
              <span className="confirm-label">Category:</span>
              <span className="confirm-value">{itemData.category}</span>
            </div>
            <div className="confirm-row">
              <span className="confirm-label">Status:</span>
              <span className="confirm-value">
                {itemData.isOnDemand ? 'Upon Order' : `${itemData.stockQty} pcs (Min: ${itemData.minStockLevel})`}
              </span>
            </div>
          </div>
          <p className="confirm-hint">
            {isEdit 
              ? 'This will update the inventory item.'
              : 'This will add a new item to your inventory.'}
          </p>
        </div>

        <div className="modal-actions">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn-primary" onClick={onConfirm}>
            {isEdit ? 'Update' : 'Add Item'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Inventory Page ────────────────────────────────────────────────────────
export default function InventoryPage() {
  const [inventory, setInventory] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [deleteItem, setDeleteItem] = useState(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [editingInline, setEditingInline] = useState(null); // { id, field, value }
  const [statusFilter, setStatusFilter] = useState(''); // 'low-stock', 'out-of-stock', 'upon-order', ''
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false); // For Add/Edit confirmation
  const [pendingItemData, setPendingItemData] = useState(null); // Temp storage before confirm

  // Load inventory from LocalStorage on mount
  useEffect(() => {
    const stored = getInventoryList();
    if (stored.length > 0) {
      setInventory(stored);
    } else {
      setInventory(initialInventory);
      saveInventoryList(initialInventory);
    }
    setIsLoaded(true);
  }, []);

  // Save to LocalStorage whenever inventory changes
  useEffect(() => {
    if (isLoaded) {
      saveInventoryList(inventory);
    }
  }, [inventory, isLoaded]);

  // Filter inventory based on search query and status filter
  const filteredInventory = inventory.filter(item => {
    const query = searchQuery.toLowerCase();
    const matchesSearch = item.name.toLowerCase().includes(query) || item.category.toLowerCase().includes(query);
    
    // Status filter
    let matchesStatus = true;
    if (statusFilter === 'low-stock') {
      matchesStatus = !item.isOnDemand && item.stockQty > 0 && item.stockQty <= item.minStockLevel;
    } else if (statusFilter === 'out-of-stock') {
      matchesStatus = !item.isOnDemand && item.stockQty === 0;
    } else if (statusFilter === 'upon-order') {
      matchesStatus = item.isOnDemand;
    }
    
    return matchesSearch && matchesStatus;
  });

  // Handle Add New Item
  const handleAddNew = () => {
    setEditingItem(null);
    setIsModalOpen(true);
  };

  // Handle Edit Item
  const handleEdit = (item) => {
    setEditingItem(item);
    setIsModalOpen(true);
  };

  // Handle Delete Item
  const handleDelete = (item) => {
    setDeleteItem(item);
  };

  // Handle Save (Add or Update) - Shows confirmation modal first
  const handleSave = (itemData) => {
    // Store pending data and show confirmation modal
    setPendingItemData({
      ...itemData,
      id: editingItem ? editingItem.id : crypto.randomUUID()
    });
    setIsConfirmModalOpen(true);
  };

  // Confirm the Add/Edit action
  const handleConfirmSave = () => {
    if (!pendingItemData) return;
    
    if (editingItem) {
      // Update existing item
      setInventory(prev =>
        prev.map(item =>
          item.id === pendingItemData.id
            ? { ...item, ...pendingItemData }
            : item
        )
      );
    } else {
      // Add new item
      setInventory(prev => [...prev, pendingItemData]);
    }
    
    // Close all modals and reset
    setIsConfirmModalOpen(false);
    setIsModalOpen(false);
    setEditingItem(null);
    setPendingItemData(null);
  };

  // Handle Confirm Delete
  const handleConfirmDelete = () => {
    if (deleteItem) {
      setInventory(prev => prev.filter(item => item.id !== deleteItem.id));
      setDeleteItem(null);
    }
  };

  // Handle Inline Edit Start
  const handleInlineEditStart = (item, field) => {
    if (item.isOnDemand) return; // Don't allow editing for Upon Order items
    setEditingInline({ id: item.id, field, value: item[field] });
  };

  // Handle Inline Edit Save
  const handleInlineEditSave = () => {
    if (!editingInline) return;
    setInventory(prev =>
      prev.map(item =>
        item.id === editingInline.id
          ? { ...item, [editingInline.field]: parseInt(editingInline.value) || 0 }
          : item
      )
    );
    setEditingInline(null);
  };

  // Handle Inline Edit Cancel
  const handleInlineEditCancel = () => {
    setEditingInline(null);
  };

  // Handle Inline Edit Change
  const handleInlineEditChange = (e) => {
    const val = e.target.value;
    if (val === '' || (parseInt(val) >= 0)) {
      setEditingInline(prev => ({ ...prev, value: val }));
    }
  };

  // Get stock status
  const getStockStatus = (item) => {
    if (item.isOnDemand) {
      return { status: 'upon-order', label: 'Upon Order', className: 'stock-status-upon-order' };
    }
    if (item.stockQty === 0) {
      return { status: 'out-of-stock', label: 'Out of Stock', className: 'stock-status-out' };
    }
    if (item.stockQty <= item.minStockLevel) {
      return { status: 'low-stock', label: 'Low Stock', className: 'stock-status-low' };
    }
    return { status: 'in-stock', label: 'In Stock', className: 'stock-status-ok' };
  };

  // Calculate summary stats
  const totalItems = inventory.length;
  const lowStockItems = inventory.filter(item => !item.isOnDemand && item.stockQty <= item.minStockLevel && item.stockQty > 0).length;
  const outOfStockItems = inventory.filter(item => !item.isOnDemand && item.stockQty === 0).length;
  const uponOrderItems = inventory.filter(item => item.isOnDemand).length;

  if (!isLoaded) {
    return (
      <div className="page-content-wrapper">
        <div className="loading-state">
          <div className="loading-spinner"></div>
          <p>Loading inventory...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page-content-wrapper">
      {/* ── Page Header ────────────────────────────────────────────────────────── */}
      <div className="page-header">
        <div className="page-header-content">
          <div>
            <h1 className="page-title">Inventory</h1>
            <p className="page-subtitle">
              Manage your blank materials and track stock levels.
            </p>
          </div>
          <button className="btn-primary" onClick={handleAddNew}>
            <span className="btn-icon">+</span>
            Add New Item
          </button>
        </div>

        {/* ── Summary Cards ────────────────────────────────────────────────────── */}
        <div className="inventory-summary">
          <div 
            className={`summary-card${statusFilter === '' ? ' active' : ''}`}
            onClick={() => setStatusFilter('')}
            style={{ cursor: 'pointer' }}
          >
            <div className="summary-content">
              <span className="summary-value">{totalItems}</span>
              <span className="summary-label">Total Items</span>
            </div>
          </div>
          <div 
            className={`summary-card summary-card-warning${statusFilter === 'low-stock' ? ' active' : ''}`}
            onClick={() => setStatusFilter(statusFilter === 'low-stock' ? '' : 'low-stock')}
            style={{ cursor: 'pointer' }}
          >
            <div className="summary-content">
              <span className="summary-value">{lowStockItems}</span>
              <span className="summary-label">Low Stock</span>
            </div>
          </div>
          <div 
            className={`summary-card summary-card-danger${statusFilter === 'out-of-stock' ? ' active' : ''}`}
            onClick={() => setStatusFilter(statusFilter === 'out-of-stock' ? '' : 'out-of-stock')}
            style={{ cursor: 'pointer' }}
          >
            <div className="summary-content">
              <span className="summary-value">{outOfStockItems}</span>
              <span className="summary-label">Out of Stock</span>
            </div>
          </div>
          <div 
            className={`summary-card summary-card-info${statusFilter === 'upon-order' ? ' active' : ''}`}
            onClick={() => setStatusFilter(statusFilter === 'upon-order' ? '' : 'upon-order')}
            style={{ cursor: 'pointer' }}
          >
            <div className="summary-content">
              <span className="summary-value">{uponOrderItems}</span>
              <span className="summary-label">Upon Order</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Search Bar ─────────────────────────────────────────────────────────── */}
      <div className="inventory-toolbar">
        <div className="search-wrapper">
          <span className="search-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8"/>
              <path d="M21 21l-4.35-4.35"/>
            </svg>
          </span>
          <input
            type="text"
            className="search-input"
            placeholder="Search by name or category..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button className="search-clear" onClick={() => setSearchQuery('')}>
              ×
            </button>
          )}
        </div>
        <div className="inventory-legend">
          <span className="legend-item">
            <span className="legend-dot legend-dot-low"></span>
            Low Stock
          </span>
          <span className="legend-item">
            <span className="legend-dot legend-dot-out"></span>
            Out of Stock
          </span>
          <span className="legend-item">
            <span className="legend-dot legend-dot-upon-order"></span>
            Upon Order
          </span>
        </div>
      </div>

      {/* ── Inventory Table ────────────────────────────────────────────────────── */}
      <div className="inventory-table-wrapper">
        {filteredInventory.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">
              <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="3" y="3" width="18" height="18" rx="2"/>
                <path d="M3 9h18M9 21V9"/>
              </svg>
            </div>
            <h3 className="empty-title">
              {searchQuery 
                ? 'No items found' 
                : statusFilter === 'out-of-stock'
                  ? 'No Out of Stock Products'
                  : statusFilter === 'low-stock'
                    ? 'No Low Stock Products'
                    : statusFilter === 'upon-order'
                      ? 'No Upon Order Products'
                      : 'No Inventory Items'}
            </h3>
            <p className="empty-description">
              {searchQuery
                ? 'Try adjusting your search query.'
                : statusFilter
                  ? `No products match the "${statusFilter.replace('-', ' ')}" filter.`
                  : 'Get started by adding your first inventory item.'}
            </p>
            {!searchQuery && !statusFilter && (
              <button className="btn-primary" onClick={handleAddNew}>
                Add First Item
              </button>
            )}
          </div>
        ) : (
          <table className="inventory-table">
            <thead>
              <tr>
                <th className="table-col-name">Product Name</th>
                <th className="table-col-category">Category</th>
                <th className="table-col-stock">Current Stock</th>
                <th className="table-col-min">Min. Level</th>
                <th className="table-col-status">Status</th>
                <th className="table-col-actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredInventory.map(item => {
                const stockStatus = getStockStatus(item);
                return (
                  <tr key={item.id} className="inventory-table-row">
                    <td className="table-cell-name">
                      <span className="product-name">{item.name}</span>
                    </td>
                    <td className="table-cell">
                      <span className="category-badge">{item.category}</span>
                    </td>
                    <td className="table-cell">
                      {item.isOnDemand ? (
                        <span className="stock-value-dash">—</span>
                      ) : editingInline?.id === item.id && editingInline?.field === 'stockQty' ? (
                        <input
                          type="number"
                          className="form-input-inline"
                          value={editingInline.value}
                          onChange={handleInlineEditChange}
                          onBlur={handleInlineEditSave}
                          onKeyDown={e => {
                            if (e.key === 'Enter') handleInlineEditSave();
                            if (e.key === 'Escape') handleInlineEditCancel();
                          }}
                          autoFocus
                        />
                      ) : (
                        <span
                          className={`stock-value-inline ${stockStatus.status === 'out-of-stock' ? 'stock-value-zero' : ''}`}
                          onClick={() => handleInlineEditStart(item, 'stockQty')}
                          title="Click to edit"
                        >
                          {item.stockQty}
                        </span>
                      )}
                    </td>
                    <td className="table-cell">
                      {item.isOnDemand ? (
                        <span className="stock-value-dash">—</span>
                      ) : editingInline?.id === item.id && editingInline?.field === 'minStockLevel' ? (
                        <input
                          type="number"
                          className="form-input-inline"
                          value={editingInline.value}
                          onChange={handleInlineEditChange}
                          onBlur={handleInlineEditSave}
                          onKeyDown={e => {
                            if (e.key === 'Enter') handleInlineEditSave();
                            if (e.key === 'Escape') handleInlineEditCancel();
                          }}
                          autoFocus
                        />
                      ) : (
                        <span
                          className="min-stock-value-inline"
                          onClick={() => handleInlineEditStart(item, 'minStockLevel')}
                          title="Click to edit"
                        >
                          {item.minStockLevel}
                        </span>
                      )}
                    </td>
                    <td className="table-cell">
                      <span className={`stock-status-badge ${stockStatus.className}`}>
                        {stockStatus.label}
                      </span>
                    </td>
                    <td className="table-cell-actions">
                      <button
                        className="btn-icon-edit"
                        onClick={() => handleEdit(item)}
                        title="Edit"
                      >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                          <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                        </svg>
                      </button>
                      <button
                        className="btn-icon-delete"
                        onClick={() => handleDelete(item)}
                        title="Delete"
                      >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="3,6 5,6 21,6"/>
                          <path d="M19,6v14a2,2,0,0,1-2,2H7a2,2,0,0,1-2-2V6m3,0V4a2,2,0,0,1,2-2h4a2,2,0,0,1,2,2v2"/>
                          <line x1="10" y1="11" x2="10" y2="17"/>
                          <line x1="14" y1="11" x2="14" y2="17"/>
                        </svg>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Modals ─────────────────────────────────────────────────────────────── */}
      <InventoryModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditingItem(null);
        }}
        onSave={handleSave}
        item={editingItem}
        categories={CATEGORIES}
      />

      <DeleteConfirmModal
        isOpen={!!deleteItem}
        onClose={() => setDeleteItem(null)}
        onConfirm={handleConfirmDelete}
        itemName={deleteItem?.name}
      />

      <ConfirmSaveModal
        isOpen={isConfirmModalOpen}
        onClose={() => {
          setIsConfirmModalOpen(false);
          setPendingItemData(null);
        }}
        onConfirm={handleConfirmSave}
        itemData={pendingItemData}
        isEdit={!!editingItem}
      />
    </div>
  );
}
