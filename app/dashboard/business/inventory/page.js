'use client';

/**
 * INVENTORY MANAGEMENT PAGE
 *
 * Current Status: LocalStorage (Browser-only, for testing)
 * ⚠️ TODO: MongoDB Integration - Replace LocalStorage with Database
 *
 * Features:
 * - Add/Edit/Delete inventory items (blank materials)
 * - Inline editing for stock levels
 * - Status filtering (Low Stock, Out of Stock, Upon Order)
 * - Search by name or category
 * - Duplicate prevention (same Name + Category)
 * - Auto-formatting (Proper Case)
 *
 * MongoDB Integration Steps:
 * 1. Create MongoDB collection: 'inventory'
 * 2. Replace getInventoryList() → GET /api/inventory
 * 3. Replace saveInventoryList() → POST/PUT /api/inventory/:id
 * 4. Add API routes in app/api/inventory/route.js
 * 5. Add Mongoose schema in models/Inventory.js
 * 6. Remove LocalStorage references
 */

import { useState, useEffect } from 'react';

// ── LocalStorage Key ───────────────────────────────────────────────────────────
const INVENTORY_STORAGE_KEY = 'pmp_inventory';

// ⚠️ TODO: MongoDB - Replace with API calls
// CURRENT: LocalStorage helper functions (browser-only)
// FUTURE: Replace with API calls to MongoDB

// ── LocalStorage Helpers ───────────────────────────────────────────────────────
// ⚠️ TODO: MongoDB - Replace with API calls:
// - getInventoryList() → GET /api/inventory
// - saveInventoryList() → POST /api/inventory or PUT /api/inventory/:id
//
// Example MongoDB API implementation:
// ```javascript
// // app/api/inventory/route.js
// export async function GET() {
//   const inventory = await Inventory.find({}).sort({ name: 1 });
//   return NextResponse.json(inventory);
// }
//
// export async function POST(request) {
//   const body = await request.json();
//   const newItem = await Inventory.create(body);
//   return NextResponse.json(newItem);
// }
//
// export async function PUT(request) {
//   const { id, ...data } = await request.json();
//   const updated = await Inventory.findByIdAndUpdate(id, data, { new: true });
//   return NextResponse.json(updated);
// }
// ```
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

// ⚠️ TODO: MongoDB - Replace with API call to save/update inventory item
// CURRENT: Saves to LocalStorage (browser-only, NOT persistent across devices)
// FUTURE: POST to MongoDB API
export function saveInventoryList(inventory) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(INVENTORY_STORAGE_KEY, JSON.stringify(inventory));
  } catch (error) {
    console.error('Error saving inventory to LocalStorage:', error);
  }
}

// ── Categories ─────────────────────────────────────────────────────────────────
const DEFAULT_CATEGORIES = [
  'Mugs',
  'T-Shirt',
  'Stickers',
  'Phone Cases',
  'Accessories',
  'Home & Living',
  'Stationery',
  'Others'
];

// ── LocalStorage Key for Categories ───────────────────────────────────────────
const CATEGORIES_STORAGE_KEY = 'pmp_inventory_categories';

// ⚠️ TODO: MongoDB - Replace with API calls
// CURRENT: Categories stored in LocalStorage (browser-only)
// FUTURE: Store categories in MongoDB as separate collection or derive from inventory
//
// Option 1: Separate categories collection
// - GET /api/categories - Fetch all categories
// - POST /api/categories - Add new category
//
// Option 2: Derive from inventory items
// - Use MongoDB aggregation: db.inventory.distinct("category")
// - No need to store categories separately

// ── Get Categories from LocalStorage ───────────────────────────────────────────
// ⚠️ TODO: MongoDB - Replace with API call: GET /api/categories
export function getCategories() {
  if (typeof window === 'undefined') return DEFAULT_CATEGORIES;
  try {
    const stored = localStorage.getItem(CATEGORIES_STORAGE_KEY);
    return stored ? JSON.parse(stored) : DEFAULT_CATEGORIES;
  } catch (error) {
    console.error('Error reading categories from LocalStorage:', error);
    return DEFAULT_CATEGORIES;
  }
}

// ── Save Categories to LocalStorage ────────────────────────────────────────────
// ⚠️ TODO: MongoDB - Replace with API call: POST /api/categories
export function saveCategories(categories) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(CATEGORIES_STORAGE_KEY, JSON.stringify(categories));
  } catch (error) {
    console.error('Error saving categories to LocalStorage:', error);
  }
}

// ── Initial Sample Data ────────────────────────────────────────────────────────
// ⚠️ TODO: MongoDB - Remove this initial data when connecting to database
// This is only for testing purposes. In production, data will come from MongoDB.
const initialInventory = [];
// Example structure for MongoDB documents (for reference):
// {
//   _id: ObjectId,              // MongoDB auto-generates this
//   name: String,               // e.g., "Ceramic", "Magic Mug"
//   category: String,           // e.g., "Mugs", "T-Shirt"
//   stockQty: Number,           // Current stock quantity
//   minStockLevel: Number,      // Minimum stock threshold
//   isOnDemand: Boolean,        // true = Upon Order, false = Track Stock
//   createdAt: Date,            // Timestamp
//   updatedAt: Date             // Last update timestamp
// }

// ── Modal Component ────────────────────────────────────────────────────────────
function InventoryModal({ isOpen, onClose, onSave, onEdit, item, categories, onAddCategory, inventory, editingItem }) {
  const [formData, setFormData] = useState({
    name: '',
    category: 'Mugs',
    stockQty: 0,
    minStockLevel: 10,
    isOnDemand: false
  });
  const [showNewCategoryInput, setShowNewCategoryInput] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [duplicateItem, setDuplicateItem] = useState(null); // For duplicate warning modal

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

  const handleCategorySelect = (e) => {
    const value = e.target.value;
    if (value === '__new__') {
      setShowNewCategoryInput(true);
      setNewCategoryName('');
    } else {
      setShowNewCategoryInput(false);
      setFormData(prev => ({ ...prev, category: value }));
    }
  };

  const handleAddNewCategory = () => {
    const trimmed = newCategoryName.trim();
    if (!trimmed) {
      alert('Please enter a category name');
      return;
    }

    // Check if category already exists
    if (categories.some(cat => cat.toLowerCase() === trimmed.toLowerCase())) {
      alert('Category already exists!');
      return;
    }

    // Add new category
    onAddCategory(trimmed);
    setFormData(prev => ({ ...prev, category: trimmed }));
    setShowNewCategoryInput(false);
    setNewCategoryName('');
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

    // Normalize the name: Trim whitespace and convert to Proper Case
    const normalizedName = formData.name.trim()
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');

    // Check for duplicates in inventory (same Name + same Category)
    const isDuplicate = inventory.some(item =>
      item.name.toLowerCase() === normalizedName.toLowerCase() &&
      item.category.toLowerCase() === formData.category.toLowerCase() &&
      item.id !== (editingItem?.id) // Exclude current item if editing
    );

    if (isDuplicate) {
      // Find the existing item for the redirect option
      const existingItem = inventory.find(item =>
        item.name.toLowerCase() === normalizedName.toLowerCase() &&
        item.category.toLowerCase() === formData.category.toLowerCase()
      );

      // Show duplicate warning modal instead of confirm
      setDuplicateItem(existingItem);
      return;
    }

    // Save with normalized name
    onSave({
      ...formData,
      name: normalizedName,
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
            <p className="form-hint">
              Product name will be auto-formatted (Proper Case). Duplicate names in the same category are not allowed.
            </p>
          </div>

          <div className="form-group">
            <label className="form-label">
              Category <span className="required">*</span>
            </label>
            {showNewCategoryInput ? (
              <div className="new-category-input-wrap">
                <input
                  type="text"
                  className="form-input"
                  value={newCategoryName}
                  onChange={e => setNewCategoryName(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddNewCategory();
                    }
                    if (e.key === 'Escape') {
                      setShowNewCategoryInput(false);
                      setNewCategoryName('');
                    }
                  }}
                  placeholder="Enter new category name..."
                  autoFocus
                />
                <div className="new-category-actions" style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={handleAddNewCategory}
                    style={{ padding: '0.5rem 1rem', fontSize: '0.875rem' }}
                  >
                    Add Category
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => {
                      setShowNewCategoryInput(false);
                      setNewCategoryName('');
                    }}
                    style={{ padding: '0.5rem 1rem', fontSize: '0.875rem' }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                <select
                  name="category"
                  className="form-select"
                  value={formData.category}
                  onChange={handleCategorySelect}
                  required
                >
                  {categories.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                  <option value="__new__" style={{ borderTop: '1px solid var(--border)', fontWeight: '600' }}>+ Add New Category...</option>
                </select>
                <p className="form-hint">
                  Select a category or add a new one.
                </p>
              </>
            )}
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

      {/* Duplicate Item Warning Modal */}
      <DuplicateItemModal
        isOpen={!!duplicateItem}
        onClose={() => setDuplicateItem(null)}
        onEdit={() => {
          if (duplicateItem) {
            setDuplicateItem(null); // Clear duplicate item first
            onClose(); // Close the InventoryModal
            setTimeout(() => {
              onEdit(duplicateItem); // Open edit mode for existing item
            }, 150);
          }
        }}
        existingItem={duplicateItem}
        categoryName={formData.category}
      />
    </div>
  );
}

// ── Duplicate Item Warning Modal ───────────────────────────────────────────────
function DuplicateItemModal({ isOpen, onClose, onEdit, existingItem, categoryName }) {
  if (!isOpen || !existingItem) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content modal-content-sm" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title modal-title-warning">Duplicate Item Detected</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="modal-body">
          <p className="delete-confirm-text">
            <strong>"{existingItem.name}"</strong> in category <strong>"{categoryName}"</strong> already exists in your inventory.
          </p>
          <p className="delete-confirm-warning" style={{ marginTop: '0.75rem' }}>
            Would you like to update the existing item's stock instead?
          </p>
          <div className="existing-item-info" style={{
            background: 'rgba(255, 193, 7, 0.1)',
            border: '1px solid rgba(255, 193, 7, 0.3)',
            borderRadius: '8px',
            padding: '1rem',
            marginTop: '1rem'
          }}>
            <div style={{ fontSize: '0.875rem', color: 'var(--gray)', marginBottom: '0.5rem' }}>Current Item:</div>
            <div style={{ fontWeight: '600', color: 'var(--white)', marginBottom: '0.25rem' }}>{existingItem.name}</div>
            <div style={{ fontSize: '0.875rem', color: 'var(--gray)' }}>
              Category: {existingItem.category} • Stock: {existingItem.isOnDemand ? 'Upon Order' : `${existingItem.stockQty} pcs`}
            </div>
          </div>
        </div>

        <div className="modal-actions">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn-primary" onClick={onEdit}>
            Edit Existing Item
          </button>
        </div>
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
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES);
  const [searchQuery, setSearchQuery] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [deleteItem, setDeleteItem] = useState(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [editingInline, setEditingInline] = useState(null); // { id, field, value }
  const [statusFilter, setStatusFilter] = useState(''); // 'low-stock', 'out-of-stock', 'upon-order', ''
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false); // For Add/Edit confirmation
  const [pendingItemData, setPendingItemData] = useState(null); // Temp storage before confirm

  // ⚠️ TODO: MongoDB - Replace with API call
  // CURRENT: Load from LocalStorage on mount
  // FUTURE: GET /api/inventory - Fetch from MongoDB
  //
  // Example:
  // useEffect(() => {
  //   fetch('/api/inventory')
  //     .then(res => res.json())
  //     .then(data => {
  //       setInventory(data);
  //       setIsLoaded(true);
  //     })
  //     .catch(err => console.error('Error loading inventory:', err));
  // }, []);
  useEffect(() => {
    const stored = getInventoryList();
    if (stored.length > 0) {
      setInventory(stored);
    } else {
      setInventory(initialInventory);
      saveInventoryList(initialInventory);
    }

    // Load categories
    const storedCategories = getCategories();
    setCategories(storedCategories);

    setIsLoaded(true);
  }, []);

  // ⚠️ TODO: MongoDB - Remove this useEffect
  // CURRENT: Save to LocalStorage on every change
  // FUTURE: Not needed - will use API calls (POST/PUT) for each action
  useEffect(() => {
    if (isLoaded) {
      saveInventoryList(inventory);
    }
  }, [inventory, isLoaded]);

  // ⚠️ TODO: MongoDB - Replace with API call
  // CURRENT: Save to LocalStorage
  // FUTURE: POST /api/categories
  const handleAddCategory = (newCategory) => {
    const updatedCategories = [...categories, newCategory];
    setCategories(updatedCategories);
    saveCategories(updatedCategories);
  };

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
  // ⚠️ TODO: MongoDB - Replace with API call
  // CURRENT: Stores locally, saves to LocalStorage via useEffect
  // FUTURE: POST /api/inventory (new) or PUT /api/inventory/:id (update)
  const handleSave = (itemData) => {
    // Store pending data and show confirmation modal
    setPendingItemData({
      ...itemData,
      id: editingItem ? editingItem.id : crypto.randomUUID()
    });
    setIsConfirmModalOpen(true);
  };

  // Confirm the Add/Edit action
  // ⚠️ TODO: MongoDB - Replace with API call
  // CURRENT: Updates LocalStorage state
  // FUTURE: Call API and handle response
  //
  // Example:
  // const handleConfirmSave = async () => {
  //   if (!pendingItemData) return;
  //   const method = editingItem ? 'PUT' : 'POST';
  //   const url = editingItem ? `/api/inventory/${pendingItemData.id}` : '/api/inventory';
  //   const res = await fetch(url, {
  //     method,
  //     headers: { 'Content-Type': 'application/json' },
  //     body: JSON.stringify(pendingItemData),
  //   });
  //   const savedItem = await res.json();
  //   // Then update state with savedItem
  // };
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
  // ⚠️ TODO: MongoDB - Replace with API call
  // CURRENT: Removes from LocalStorage state
  // FUTURE: DELETE /api/inventory/:id
  //
  // Example:
  // const handleConfirmDelete = async () => {
  //   if (!deleteItem) return;
  //   await fetch(`/api/inventory/${deleteItem.id}`, { method: 'DELETE' });
  //   setInventory(prev => prev.filter(item => item.id !== deleteItem.id));
  // };
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
        onEdit={(existingItem) => {
          setEditingItem(existingItem);
          setIsModalOpen(true);
        }}
        item={editingItem}
        editingItem={editingItem}
        categories={categories}
        onAddCategory={handleAddCategory}
        inventory={inventory}
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
