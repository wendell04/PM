'use client';

/**
 * INVENTORY MANAGEMENT PAGE
 *
 * Current Status: LocalStorage (Browser-only, for testing)
 * TODO: MongoDB Integration - Replace LocalStorage with Database
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

import { useState, useEffect, useRef } from 'react';

// ── Reusable Number Input Component ───────────────────────────────────────────
// Prevents negative values, e, E, -, +, and disables scroll wheel
function NumberInput({ value, onChange, min = 0, max, placeholder, className, disabled }) {
  const handleChange = (e) => {
    const val = e.target.value;
    // Allow empty string or valid non-negative number
    if (val === '' || /^-?\d*$/.test(val)) {
      const num = val === '' ? '' : Math.max(min, parseInt(val) || min);
      onChange({ ...e, target: { ...e.target, value: num } });
    }
  };

  const handleKeyDown = (e) => {
    // Block e, E, +, -
    if (['e', 'E', '+', '-', '.'].includes(e.key)) {
      e.preventDefault();
    }
  };

  const handleWheel = (e) => {
    // Prevent scroll wheel from changing value
    e.target.blur();
    e.preventDefault();
  };

  return (
    <input
      type="number"
      className={className}
      value={value}
      onChange={handleChange}
      onKeyDown={handleKeyDown}
      onWheel={handleWheel}
      min={min}
      max={max}
      placeholder={placeholder}
      disabled={disabled}
    />
  );
}

// ── LocalStorage Key ───────────────────────────────────────────────────────────
const INVENTORY_STORAGE_KEY = 'pmp_inventory';

// TODO: MongoDB - Replace with API calls
// CURRENT: LocalStorage helper functions (browser-only)
// FUTURE: Replace with API calls to MongoDB

// ── LocalStorage Helpers ───────────────────────────────────────────────────────
// TODO: MongoDB - Replace with API calls:
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

// TODO: MongoDB - Replace with API call to save/update inventory item
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

// TODO: MongoDB - Replace with API calls
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
// TODO: MongoDB - Replace with API call: GET /api/categories
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
// TODO: MongoDB - Replace with API call: POST /api/categories
export function saveCategories(categories) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(CATEGORIES_STORAGE_KEY, JSON.stringify(categories));
  } catch (error) {
    console.error('Error saving categories to LocalStorage:', error);
  }
}

// ── Initial Sample Data ────────────────────────────────────────────────────────
// TODO: MongoDB - Remove this initial data when connecting to database
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
//   isActive: Boolean,          // NEW: true = active, false = archived
//   deletedAt: Date | null,     // NEW: Timestamp when archived/deleted
//   createdAt: Date,            // Timestamp
//   updatedAt: Date             // Last update timestamp
// }

// ── Modal Component ────────────────────────────────────────────────────────────
function InventoryModal({ isOpen, onClose, onSave, onEdit, onRestoreItem, item, categories, onAddCategory, inventory, editingItem }) {
  const [formData, setFormData] = useState({
    name: '',
    category: 'Mugs',
    stockQty: 0,
    minStockLevel: 10,
    isOnDemand: false,
    isActive: true  // NEW: For soft delete - defaults to true for new items
  });
  const [showNewCategoryInput, setShowNewCategoryInput] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [duplicateItem, setDuplicateItem] = useState(null); // For duplicate warning modal (active items)
  const [archivedItem, setArchivedItem] = useState(null); // For archived item restore modal
  const [isLinked, setIsLinked] = useState(false); // NEW: Track if item is linked to products/sales
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false); // For custom combobox
  const categoryDropdownRef = useRef(null);

  // Set formData from item when editing
  useEffect(() => {
    if (item) {
      setFormData({
        name: item.name || '',
        category: item.category || 'Mugs',
        stockQty: item.stockQty || 0,
        minStockLevel: item.minStockLevel || 10,
        isOnDemand: item.isOnDemand || false,
        isActive: item.isActive !== undefined ? item.isActive : true
      });
    } else {
      setFormData({
        name: '',
        category: 'Mugs',
        stockQty: 0,
        minStockLevel: 10,
        isOnDemand: false,
        isActive: true
      });
    }
  }, [item]);

  // Close category dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (categoryDropdownRef.current && !categoryDropdownRef.current.contains(e.target)) {
        setShowCategoryDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // NEW: Check if item is linked to products or has sales history
  useEffect(() => {
    if (item) {
      const allProducts = JSON.parse(localStorage.getItem('pmp_products') || '[]');
      const allOrders = JSON.parse(localStorage.getItem('pmp_orders') || '[]');

      // Check if referenced by products
      const linkedProducts = allProducts.filter(p => p.inventoryId === item.id);

      // Check if item has sales history
      const salesWithThisItem = allOrders.filter(order =>
        order.items?.some(orderItem => orderItem.inventoryId === item.id) ||
        order.productInventoryId === item.id
      );

      setIsLinked(linkedProducts.length > 0 || salesWithThisItem.length > 0);
    } else {
      setIsLinked(false);
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

    // Validate stock quantity for new items
    if (!item && !formData.isOnDemand && (!formData.stockQty || formData.stockQty < 0)) {
      alert('Please enter a valid stock quantity');
      return;
    }

    // Normalize the name: Trim whitespace and convert to Proper Case
    const normalizedName = formData.name.trim()
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');

    // Check for duplicates in inventory (same Name + same Category)
    const duplicateItem = inventory.find(item =>
      item.name.toLowerCase() === normalizedName.toLowerCase() &&
      item.category.toLowerCase() === formData.category.toLowerCase() &&
      item.id !== (editingItem?.id) // Exclude current item if editing
    );

    if (duplicateItem) {
      // Check if item is archived
      if (duplicateItem.isActive === false) {
        // Show archived item modal
        setArchivedItem(duplicateItem);
      } else {
        // Show duplicate warning modal (active item)
        setDuplicateItem(duplicateItem);
      }
      return;
    }

    // Save with normalized name
    // NEW: Include isActive and deletedAt fields
    // When editing, preserve original stockQty (stock adjustments done via table +/- buttons)
    onSave({
      ...formData,
      name: normalizedName,
      stockQty: item ? item.stockQty : parseInt(formData.stockQty),  // Preserve stock when editing
      minStockLevel: parseInt(formData.minStockLevel),
      isActive: formData.isActive !== undefined ? formData.isActive : true,  // Preserve active status
      deletedAt: formData.isActive === false ? new Date() : null  // Set deletedAt when archived
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
          <button className="modal-close" onClick={onClose}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="modal-form">
          <div className="form-group">
            <label className="form-label">
              Product Name <span className="required">*</span>
              {isLinked && (
                <span style={{ color: '#f59e0b', fontSize: '0.75rem', marginLeft: '0.5rem', fontWeight: '500', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                  </svg>
                  Locked (Item is in use)
                </span>
              )}
            </label>
            <input
              type="text"
              name="name"
              className="form-input"
              value={formData.name}
              onChange={handleInputChange}
              placeholder="e.g., Ceramic, Magic Mug..."
              required
              readOnly={isLinked}
              autoComplete="off"
              style={isLinked ? { opacity: 0.6, cursor: 'not-allowed' } : {}}
            />
            {isLinked ? (
              <p className="form-hint" style={{ color: '#f59e0b' }}>
                This item is linked to products or sales records. Name cannot be changed to prevent data discrepancies.
              </p>
            ) : (
              <p className="form-hint">
                Product name will be auto-formatted (Proper Case). Duplicate names in the same category are not allowed.
              </p>
            )}
          </div>

          <div className="form-group">
            <label className="form-label">
              Category <span className="required">*</span>
              {isLinked && (
                <span style={{ color: '#f59e0b', fontSize: '0.75rem', marginLeft: '0.5rem', fontWeight: '500', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                  </svg>
                  Locked (Item is in use)
                </span>
              )}
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
                  readOnly={isLinked}
                  style={isLinked ? { opacity: 0.6, cursor: 'not-allowed' } : {}}
                />
                {isLinked && (
                  <p className="form-hint" style={{ color: '#f59e0b', marginTop: '0.5rem' }}>
                    This item is linked to products or sales. Category cannot be changed.
                  </p>
                )}
                <div className="new-category-actions" style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={handleAddNewCategory}
                    disabled={isLinked}
                    style={{ padding: '0.5rem 1rem', fontSize: '0.875rem', opacity: isLinked ? 0.5 : 1, cursor: isLinked ? 'not-allowed' : 'pointer' }}
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
                <div className="combobox-root" ref={categoryDropdownRef}>
                  <div className="combobox-field">
                    <input
                      type="text"
                      className="form-input"
                      value={formData.category}
                      readOnly
                      onClick={() => !isLinked && setShowCategoryDropdown(!showCategoryDropdown)}
                      style={isLinked ? { opacity: 0.6, cursor: 'not-allowed' } : { cursor: 'pointer' }}
                      disabled={isLinked}
                    />
                    <button
                      type="button"
                      className="combobox-toggle"
                      onClick={() => !isLinked && setShowCategoryDropdown(!showCategoryDropdown)}
                      disabled={isLinked}
                      style={isLinked ? { opacity: 0.6, cursor: 'not-allowed' } : {}}
                    >
                      {showCategoryDropdown ? '▲' : '▼'}
                    </button>
                  </div>
                  {showCategoryDropdown && !isLinked && (
                    <div className="combobox-menu" style={{ maxHeight: '200px' }}>
                      {categories.slice(0, 5).map((cat, i) => (
                        <button
                          key={i}
                          type="button"
                          className={`combobox-item${cat === formData.category ? ' active' : ''}`}
                          onClick={() => {
                            setFormData(prev => ({ ...prev, category: cat }));
                            setShowCategoryDropdown(false);
                          }}
                        >
                          {cat}
                        </button>
                      ))}
                      <button
                        type="button"
                        className="combobox-item combobox-add"
                        onClick={() => {
                          setShowCategoryDropdown(false);
                          setShowNewCategoryInput(true);
                          setNewCategoryName('');
                        }}
                      >
                        <span>+</span> Add New Category...
                      </button>
                    </div>
                  )}
                </div>
                {isLinked ? (
                  <p className="form-hint" style={{ color: '#f59e0b' }}>
                    This item is linked to products or sales records. Category cannot be changed to prevent data discrepancies.
                  </p>
                ) : (
                  <p className="form-hint">
                    Select a category or add a new one.
                  </p>
                )}
              </>
            )}
          </div>

          <div className="form-group">
            <label className="form-checkbox-label" style={isLinked && formData.stockQty > 0 ? { opacity: 0.6, cursor: 'not-allowed' } : {}}>
              <input
                type="checkbox"
                name="isOnDemand"
                className="form-checkbox"
                checked={formData.isOnDemand}
                onChange={handleInputChange}
                disabled={isLinked && formData.stockQty > 0}
                style={{ cursor: isLinked && formData.stockQty > 0 ? 'not-allowed' : 'pointer' }}
              />
              <span className="checkbox-text">
                Upon Order / Supplied (stock ignored)
                {isLinked && formData.stockQty > 0 ? (
                  <span style={{ color: '#f59e0b', fontSize: '0.75rem', marginLeft: '0.5rem', fontWeight: '500', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                      <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                    </svg>
                    Locked (In Use)
                  </span>
                ) : isLinked && formData.stockQty === 0 ? (
                  <span style={{ color: '#facc15', fontSize: '0.75rem', marginLeft: '0.5rem', fontWeight: '500', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                    Can Switch (Stock is 0)
                  </span>
                ) : null}
              </span>
            </label>
            {isLinked && formData.stockQty > 0 ? (
              <p className="form-hint" style={{ color: '#f59e0b' }}>
                Cannot switch to "Upon Order" while stock is available ({formData.stockQty} pcs). Wait until stocks are depleted.
              </p>
            ) : isLinked && formData.stockQty === 0 ? (
              <p className="form-hint" style={{ color: '#facc15' }}>
                If stock is 0, you can switch to "Upon Order" mode if you want to stop tracking stock for this item.
              </p>
            ) : (
              <p className="form-hint">
                When enabled, stock levels will be bypassed and item will always show as available.
              </p>
            )}
          </div>

          {!formData.isOnDemand && item && (
            <div style={{
              background: 'rgba(99, 102, 241, 0.1)',
              border: '1px solid var(--primary)',
              borderRadius: '8px',
              padding: '1rem',
              marginBottom: '1.5rem'
            }}>
              <div style={{ fontSize: '0.875rem', color: 'var(--gray)', marginBottom: '0.5rem' }}>
                Current Stock Level
              </div>
              <div style={{ fontSize: '1.25rem', fontWeight: '600', color: 'var(--white)', marginBottom: '0.75rem' }}>
                {formData.stockQty} pcs
              </div>
              <p style={{ fontSize: '0.8rem', color: 'var(--gray)', lineHeight: '1.5' }}>
                To adjust stock levels, use the + / − buttons in the inventory table. This ensures all changes are properly logged with reasons for audit tracking.
              </p>
            </div>
          )}

          {!formData.isOnDemand && !item && (
            <div className="form-group">
              <label className="form-label">Current Stock <span className="required">*</span></label>
              <NumberInput
                className="form-input"
                name="stockQty"
                value={formData.stockQty}
                onChange={e => setFormData(prev => ({ ...prev, stockQty: e.target.value === '' ? '' : Math.max(0, parseInt(e.target.value) || 0) }))}
                min={0}
                placeholder="0"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    return false;
                  }
                }}
              />
              <p className="form-hint">
                Initial stock quantity for this new item.
              </p>
            </div>
          )}

          {!formData.isOnDemand && (
            <div className="form-group">
              <label className="form-label">Min. Stock Level</label>
              <NumberInput
                className="form-input"
                name="minStockLevel"
                value={formData.minStockLevel}
                onChange={e => setFormData(prev => ({ ...prev, minStockLevel: e.target.value === '' ? '' : Math.max(0, parseInt(e.target.value) || 0) }))}
                min={0}
                placeholder="10"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    return false;
                  }
                }}
                readOnly
                style={{ opacity: 0.6, cursor: 'not-allowed' }}
              />
              <p className="form-hint">
                You'll receive a low stock warning when current stock falls below this level.
              </p>
            </div>
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
            setDuplicateItem(null);
            onClose();
            setTimeout(() => {
              onEdit(duplicateItem);
            }, 150);
          }
        }}
        existingItem={duplicateItem}
        categoryName={formData.category}
      />

      {/* Archived Item Detected Modal */}
      <ArchivedItemModal
        isOpen={!!archivedItem}
        onClose={() => setArchivedItem(null)}
        onRestore={() => {
          if (archivedItem) {
            // Restore the item (set isActive: true, deletedAt: null)
            if (onRestoreItem) {
              onRestoreItem(archivedItem);
            }
            setArchivedItem(null);
            // Close the Add modal - item is now restored in inventory list
            setTimeout(() => {
              onClose();
            }, 150);
          }
        }}
        archivedItem={archivedItem}
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
          <button className="modal-close" onClick={onClose}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
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

// ── Archived Item Detected Modal ──────────────────────────────────────────────
// Shows when user tries to add item with same name/category as archived item
function ArchivedItemModal({ isOpen, onClose, onRestore, archivedItem, categoryName }) {
  if (!isOpen || !archivedItem) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content modal-content-sm" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title modal-title-warning">Archived Item Found</h2>
          <button className="modal-close" onClick={onClose}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <div className="modal-body">
          <p className="delete-confirm-text">
            <strong>"{archivedItem.name}"</strong> in category <strong>"{categoryName}"</strong> exists in your archive.
          </p>
          <p className="delete-confirm-warning" style={{ marginTop: '0.75rem', color: '#f59e0b' }}>
            This item was previously archived. Restore it to use again.
          </p>
          <div className="existing-item-info" style={{
            background: 'rgba(245, 158, 11, 0.1)',
            border: '1px solid rgba(245, 158, 11, 0.3)',
            borderRadius: '8px',
            padding: '1rem',
            marginTop: '1rem'
          }}>
            <div style={{ fontSize: '0.875rem', color: 'var(--gray)', marginBottom: '0.5rem' }}>Archived Item:</div>
            <div style={{ fontWeight: '600', color: 'var(--white)', marginBottom: '0.25rem' }}>{archivedItem.name}</div>
            <div style={{ fontSize: '0.875rem', color: 'var(--gray)' }}>
              Category: {archivedItem.category} • Stock: {archivedItem.isOnDemand ? 'Upon Order' : `${archivedItem.stockQty} pcs`}
            </div>
            {archivedItem.deletedAt && (
              <div style={{ fontSize: '0.75rem', color: 'var(--gray)', marginTop: '0.5rem' }}>
                Archived on: {new Date(archivedItem.deletedAt).toLocaleDateString()}
              </div>
            )}
          </div>
        </div>

        <div className="modal-actions">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn-primary" onClick={onRestore}>
            Restore Item
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Archive/Delete Confirmation Modal ─────────────────────────────────────────
// NEW: Now checks sales history in addition to product references
// If item has sales history, force soft delete (archive) only
function ArchiveConfirmModal({ 
  isOpen, 
  onClose, 
  onArchive, 
  onDelete,  // Fixed: Added onDelete prop
  itemName, 
  isReferenced, 
  referencingProductsCount,
  hasSalesHistory = false  // NEW: Prop for sales history
}) {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content modal-content-sm" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title modal-title-danger">
            {isReferenced ? 'Item Is Referenced' : 'Confirm Action'}
          </h2>
          <button className="modal-close" onClick={onClose}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <div className="modal-body">
          {isReferenced || hasSalesHistory ? (
            <>
              {isReferenced && (
                <>
                  <p className="delete-confirm-text">
                    <strong>"{itemName}"</strong> is currently used by {referencingProductsCount} product(s).
                  </p>
                  <p className="delete-confirm-warning" style={{
                    marginTop: '1rem',
                    background: 'rgba(255, 193, 7, 0.1)',
                    border: '1px solid rgba(255, 193, 7, 0.3)',
                    padding: '1rem',
                    borderRadius: '8px'
                  }}>
                    <strong>Cannot Delete:</strong> This item is being used in your product catalog.
                    Deleting it would break those products.
                  </p>
                </>
              )}
              
              {/* NEW: Sales History Warning */}
              {hasSalesHistory && (
                <>
                  <p className="delete-confirm-text" style={{ 
                    marginTop: isReferenced ? '1rem' : '0',
                    color: '#f87171',
                    fontWeight: '600'
                  }}>
                    <strong>CRITICAL:</strong> This item has previous sales records!
                  </p>
                  <p className="delete-confirm-warning" style={{ 
                    marginTop: '0.5rem',
                    background: 'rgba(239, 68, 68, 0.1)',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    padding: '1rem',
                    borderRadius: '8px'
                  }}>
                    <strong>Cannot Permanently Delete:</strong> This item is part of your sales history. 
                    Hard deleting would corrupt your accounting and sales reports.
                  </p>
                </>
              )}
              
              <p className="delete-confirm-text" style={{ marginTop: '1rem' }}>
                Would you like to <strong>Archive</strong> it instead?
              </p>
              <ul style={{
                marginTop: '0.75rem',
                paddingLeft: '1.25rem',
                color: 'var(--gray)',
                fontSize: '0.875rem',
                lineHeight: '1.8'
              }}>
              </ul>
            </>
          ) : (
            <>
              <p className="delete-confirm-text">
                Are you sure you want to delete <strong>"{itemName}"</strong>?
              </p>
              <p className="delete-confirm-warning">
                This action cannot be undone. The item will be permanently removed from your inventory.
              </p>
              <p style={{
                marginTop: '0.75rem',
                fontSize: '0.875rem',
                color: 'var(--gray)',
                fontStyle: 'italic'
              }}>
                <span style={{ marginRight: '0.5rem', fontWeight: 'bold' }}>ℹ</span> Only delete permanently if this item was created by mistake and has never been used.
              </p>
            </>
          )}
        </div>

        <div className="modal-actions">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          {isReferenced || hasSalesHistory ? (
            <button type="button" className="btn-primary" onClick={onArchive}>
              Archive Item
            </button>
          ) : (
            <button type="button" className="btn-danger" onClick={onDelete}>
              Delete Permanently
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Manual Stock Addition Modal ───────────────────────────────────────────────
// Modal for adding stock with audit log
// Reasons: Restock/New Delivery, Inventory Correction
function StockAdditionModal({ isOpen, onClose, onConfirm, item }) {
  const [reason, setReason] = useState('restock'); // 'restock', 'correction-add'
  const [quantity, setQuantity] = useState('');
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [pendingData, setPendingData] = useState(null);
  const [showReasonDropdown, setShowReasonDropdown] = useState(false);
  const reasonDropdownRef = useRef(null);

  // Close reason dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (reasonDropdownRef.current && !reasonDropdownRef.current.contains(e.target)) {
        setShowReasonDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (isOpen && item) {
      // Reset form when modal opens
      setReason('restock');
      setQuantity('');
      setShowConfirmModal(false);
      setPendingData(null);
    }
  }, [isOpen, item]);

  const handleSubmit = () => {
    if (!quantity || quantity <= 0) {
      alert('Please enter a valid quantity');
      return;
    }

    // Store pending data and show confirmation modal
    const adjustmentData = {
      reason,
      quantity: parseInt(quantity)
    };

    setPendingData(adjustmentData);
    setShowConfirmModal(true);
  };

  const handleConfirmAdd = () => {
    if (pendingData) {
      onConfirm(pendingData);
      setShowConfirmModal(false);
      setPendingData(null);
      onClose();
    }
  };

  if (!isOpen || !item) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">Add Stock</h2>
          <button className="modal-close" onClick={onClose}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <div className="modal-body">
          {/* Item Info */}
          <div style={{
            background: 'rgba(99, 102, 241, 0.1)',
            border: '1px solid var(--primary)',
            borderRadius: '8px',
            padding: '1rem',
            marginBottom: '1.5rem'
          }}>
            <div style={{ fontSize: '0.875rem', color: 'var(--gray)', marginBottom: '0.25rem' }}>Adding stock to:</div>
            <div style={{ fontWeight: '600', color: 'var(--white)' }}>{item.name}</div>
            <div style={{ fontSize: '0.875rem', color: 'var(--gray)' }}>
              Category: {item.category} - Current Stock: {item.stockQty} pcs
            </div>
          </div>

          {/* Reason Dropdown */}
          <div className="form-group">
            <label className="form-label">
              Reason for Addition <span className="required">*</span>
            </label>
            <div className="combobox-root" ref={reasonDropdownRef}>
              <div className="combobox-field">
                <input
                  type="text"
                  className="form-input"
                  value={reason === 'restock' ? 'Restock' : 'Inventory Correction (Add)'}
                  readOnly
                  onClick={() => setShowReasonDropdown(!showReasonDropdown)}
                  style={{ cursor: 'pointer' }}
                />
                <button
                  type="button"
                  className="combobox-toggle"
                  onClick={() => setShowReasonDropdown(!showReasonDropdown)}
                >
                  {showReasonDropdown ? '▲' : '▼'}
                </button>
              </div>
              {showReasonDropdown && (
                <div className="combobox-menu">
                  <button
                    type="button"
                    className={`combobox-item${reason === 'restock' ? ' active' : ''}`}
                    onClick={() => {
                      setReason('restock');
                      setShowReasonDropdown(false);
                    }}
                  >
                    Restock
                  </button>
                  <button
                    type="button"
                    className={`combobox-item${reason === 'correction-add' ? ' active' : ''}`}
                    onClick={() => {
                      setReason('correction-add');
                      setShowReasonDropdown(false);
                    }}
                  >
                    Inventory Correction (Add)
                  </button>
                </div>
              )}
            </div>
            {reason === 'restock' && (
              <p className="form-hint" style={{ color: '#4ade80', marginTop: '0.5rem' }}>
                For new stock.
              </p>
            )}
          </div>

          {/* Quantity */}
          <div className="form-group">
            <label className="form-label">
              Quantity to Add <span className="required">*</span>
            </label>
            <NumberInput
              className="form-input no-spinner"
              value={quantity}
              onChange={e => setQuantity(e.target.value === '' ? '' : Math.max(1, parseInt(e.target.value) || 1))}
              min={1}
              placeholder=""
            />
          </div>
        </div>

        <div className="modal-actions">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={handleSubmit}
            disabled={!quantity}
          >
            Add Stock
          </button>
        </div>
      </div>

      {/* Confirmation Modal for Add Stock */}
      <div className="modal-overlay" style={{ display: showConfirmModal ? 'flex' : 'none' }} onClick={e => e.stopPropagation()}>
        <div className="modal-content modal-content-sm" onClick={e => e.stopPropagation()}>
          <div className="modal-header">
            <h2 className="modal-title modal-title-success">Confirm Stock Addition</h2>
            <button className="modal-close" onClick={() => setShowConfirmModal(false)}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12"/>
              </svg>
            </button>
          </div>

          <div className="modal-body">
            <div className="confirm-summary">
              <div className="confirm-row">
                <span className="confirm-label">Product:</span>
                <span className="confirm-value">{item?.name}</span>
              </div>
              <div className="confirm-row">
                <span className="confirm-label">Category:</span>
                <span className="confirm-value">{item?.category}</span>
              </div>
              <div className="confirm-row">
                <span className="confirm-label">Current Stock:</span>
                <span className="confirm-value">{item?.stockQty} pcs</span>
              </div>
              <div className="confirm-row">
                <span className="confirm-label">Quantity to Add:</span>
                <span className="confirm-value" style={{ color: '#4ade80', fontWeight: '700' }}>
                  +{pendingData?.quantity} pcs
                </span>
              </div>
              <div className="confirm-row">
                <span className="confirm-label">New Stock Total:</span>
                <span className="confirm-value" style={{ color: '#4ade80', fontWeight: '700' }}>
                  {(item?.stockQty || 0) + (pendingData?.quantity || 0)} pcs
                </span>
              </div>
              <div className="confirm-row">
                <span className="confirm-label">Reason:</span>
                <span className="confirm-value">
                  {pendingData?.reason === 'restock' ? 'Restock / New Delivery' : 'Inventory Correction'}
                </span>
              </div>
            </div>
            <p className="confirm-hint" style={{ marginTop: '1rem', color: '#facc15' }}>
              This will increase your inventory stock and create an audit log entry.
            </p>
          </div>

          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={() => setShowConfirmModal(false)}>
              Cancel
            </button>
            <button type="button" className="btn-primary" onClick={handleConfirmAdd}>
              Confirm Addition
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Confirm Modal ──────────────────────────────────────────────────────────
function ConfirmModal({ title, message, confirmLabel, confirmClass, onConfirm, onCancel }) {
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-content modal-content-sm" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">{title}</h2>
          <button className="modal-close" onClick={onCancel}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>
        <div className="modal-body">
          <p className="delete-confirm-text">{message}</p>
        </div>
        <div className="modal-actions">
          <button type="button" className="btn-secondary" onClick={onCancel}>Cancel</button>
          <button type="button" className={confirmClass || 'btn-primary'} onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

// ── Manual Stock Adjustment Modal ─────────────────────────────────────────────
// NEW: Modal for reducing stock with audit log
// Reasons: Sales Outside System, Damaged Stock, Stock Correction
function StockAdjustmentModal({ isOpen, onClose, onConfirm, item }) {
  const [reason, setReason] = useState('sales-outside'); // 'sales-outside', 'damaged', 'correction-remove'
  const [quantity, setQuantity] = useState('');
  const [sellingPrice, setSellingPrice] = useState('');
  const [saleDate, setSaleDate] = useState(new Date().toISOString().split('T')[0]);
  const [remarks, setRemarks] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [pendingData, setPendingData] = useState(null);
  const [showValidationModal, setShowValidationModal] = useState(false);
  const [validationMessage, setValidationMessage] = useState('');
  const [showReasonDropdown, setShowReasonDropdown] = useState(false);
  const reasonDropdownRef = useRef(null);

  useEffect(() => {
    if (isOpen && item) {
      // Reset form when modal opens
      setReason('sales-outside');
      setQuantity('');
      setSellingPrice('');
      setSaleDate(new Date().toISOString().split('T')[0]);
      setRemarks('');
      setCustomerName('');
      setShowConfirmModal(false);
      setPendingData(null);
      setShowValidationModal(false);
      setValidationMessage('');
    }
  }, [isOpen, item]);

  const handleSubmit = () => {
    if (!quantity || quantity <= 0) {
      setValidationMessage('Please enter a valid quantity');
      setShowValidationModal(true);
      return;
    }

    // For sales outside system, require selling price
    if (reason === 'sales-outside' && !sellingPrice) {
      setValidationMessage('Please enter the sold price');
      setShowValidationModal(true);
      return;
    }

    // Store pending data and show confirmation modal for ALL reasons
    const adjustmentData = {
      reason,
      quantity: parseInt(quantity),
      sellingPrice: reason === 'sales-outside' ? parseFloat(sellingPrice) : 0,
      saleDate: reason === 'sales-outside' ? saleDate : null,
      remarks: remarks || null,
      customerName: customerName || null
    };

    // Show confirmation modal for all reasons
    setPendingData(adjustmentData);
    setShowConfirmModal(true);
  };

  const handleConfirmSale = () => {
    if (pendingData) {
      onConfirm(pendingData);
      setShowConfirmModal(false);
      setPendingData(null);
      onClose();
    }
  };

  if (!isOpen || !item) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">Reduce Stock</h2>
          <button className="modal-close" onClick={onClose}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <div className="modal-body">
          {/* Item Info */}
          <div style={{
            background: 'rgba(99, 102, 241, 0.1)',
            border: '1px solid var(--primary)',
            borderRadius: '8px',
            padding: '1rem',
            marginBottom: '1.5rem'
          }}>
            <div style={{ fontSize: '0.875rem', color: 'var(--gray)', marginBottom: '0.25rem' }}>Adjusting Stock for:</div>
            <div style={{ fontWeight: '600', color: 'var(--white)', fontSize: '1.125rem' }}>{item.name}</div>
            <div style={{ fontSize: '0.875rem', color: 'var(--gray)' }}>
              Category: {item.category} - Current Stock: {item.stockQty} pcs
            </div>
          </div>

          {/* Reason Dropdown */}
          <div className="form-group">
            <label className="form-label">
              Reason for Adjustment <span className="required">*</span>
            </label>
            <div className="combobox-root" ref={reasonDropdownRef}>
              <div className="combobox-field">
                <input
                  type="text"
                  className="form-input"
                  value={
                    reason === 'sales-outside' ? 'Sales Outside System (Manual Sale)' :
                    reason === 'damaged' ? 'Damaged Stock' :
                    'Stock Correction (Remove)'
                  }
                  readOnly
                  onClick={() => setShowReasonDropdown(!showReasonDropdown)}
                  style={{ cursor: 'pointer' }}
                />
                <button
                  type="button"
                  className="combobox-toggle"
                  onClick={() => setShowReasonDropdown(!showReasonDropdown)}
                >
                  {showReasonDropdown ? '▲' : '▼'}
                </button>
              </div>
              {showReasonDropdown && (
                <div className="combobox-menu">
                  <button
                    type="button"
                    className={`combobox-item${reason === 'sales-outside' ? ' active' : ''}`}
                    onClick={() => {
                      setReason('sales-outside');
                      setShowReasonDropdown(false);
                    }}
                  >
                    Sales Outside System (Manual Sale)
                  </button>
                  <button
                    type="button"
                    className={`combobox-item${reason === 'damaged' ? ' active' : ''}`}
                    onClick={() => {
                      setReason('damaged');
                      setShowReasonDropdown(false);
                    }}
                  >
                    Damaged Stock
                  </button>
                  <button
                    type="button"
                    className={`combobox-item${reason === 'correction-remove' ? ' active' : ''}`}
                    onClick={() => {
                      setReason('correction-remove');
                      setShowReasonDropdown(false);
                    }}
                  >
                    Stock Correction (Remove)
                  </button>
                </div>
              )}
            </div>
            {reason === 'sales-outside' && (
              <p className="form-hint" style={{ color: '#facc15', marginTop: '0.5rem' }}>
                Preferred: This will create a sales record and reduce stock.
              </p>
            )}
          </div>

          {/* Quantity */}
          <div className="form-group" style={{ marginBottom: '1.25rem' }}>
            <label className="form-label">
              Quantity {reason === 'sales-outside' ? 'Sold' : 'to Remove'} <span className="required">*</span>
            </label>
            <NumberInput
              className="form-input no-spinner"
              value={quantity}
              onChange={e => setQuantity(e.target.value === '' ? '' : Math.max(1, parseInt(e.target.value) || 1))}
              min={1}
              max={item.stockQty}
              placeholder=""
            />
            {quantity > item.stockQty && (
              <p className="form-hint" style={{ color: '#f87171', marginTop: '0.5rem' }}>
                Quantity exceeds current stock ({item.stockQty} pcs)
              </p>
            )}
          </div>

          {/* Dynamic Fields based on reason */}
          {reason === 'sales-outside' && (
            <>
              <div className="form-group" style={{ marginBottom: '1.25rem' }}>
                <label className="form-label">
                  Total Amount Received (₱) <span className="required">*</span>
                </label>
                <div className="tier-price-cell">
                  <span className="peso">₱</span>
                  <input
                    type="number"
                    className="tier-input no-spinner"
                    value={sellingPrice}
                    onChange={e => {
                      const val = e.target.value;
                      // Allow empty or valid decimal number
                      if (val === '' || /^\d*\.?\d*$/.test(val)) {
                        setSellingPrice(val);
                      }
                    }}
                    onKeyDown={(e) => {
                      // Block e, E, +, -
                      if (['e', 'E', '+', '-'].includes(e.key)) {
                        e.preventDefault();
                      }
                    }}
                    onWheel={(e) => {
                      e.target.blur();
                      e.preventDefault();
                    }}
                    placeholder="0.00"
                    min="0"
                    step="0.01"
                  />
                </div>
                <p className="form-hint" style={{ marginTop: '0.5rem' }}>
                  Enter the total amount received.
                </p>
              </div>

              <div className="form-group" style={{ marginBottom: '1.25rem' }}>
                <label className="form-label">
                  Date of Sale <span className="required">*</span>
                </label>
                <input
                  type="date"
                  className="form-input"
                  value={saleDate}
                  onChange={e => setSaleDate(e.target.value)}
                />
              </div>

              <div className="form-group" style={{ marginBottom: '1.25rem' }}>
                <label className="form-label">
                  Customer Name <span style={{ color: 'var(--gray)', fontSize: '0.875rem' }}>(Optional)</span>
                </label>
                <input
                  type="text"
                  className="form-input"
                  value={customerName}
                  onChange={e => setCustomerName(e.target.value)}
                  placeholder="e.g., Juan Dela Cruz"
                />
              </div>
            </>
          )}

          {reason === 'damaged' && (
            <div className="form-group" style={{ marginBottom: '1.25rem' }}>
              <label className="form-label">
                Remarks / Cause of Damage <span style={{ color: 'var(--gray)', fontSize: '0.875rem' }}>(Optional)</span>
              </label>
              <textarea
                className="form-textarea"
                value={remarks}
                onChange={e => setRemarks(e.target.value)}
                placeholder="e.g., Broken item, Item defect..."
                rows={3}
              />
            </div>
          )}

          {reason === 'correction-remove' && (
            <div className="form-group" style={{ marginBottom: '1.25rem' }}>
              <label className="form-label">
                Remarks <span style={{ color: 'var(--gray)', fontSize: '0.875rem' }}>(Optional)</span>
              </label>
              <textarea
                className="form-textarea"
                value={remarks}
                onChange={e => setRemarks(e.target.value)}
                placeholder="e.g., Inventory count adjustment..."
                rows={3}
              />
            </div>
          )}
        </div>

        <div className="modal-actions">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={handleSubmit}
            disabled={quantity > item.stockQty || !quantity}
          >
            {reason === 'sales-outside' ? 'Record Sale' : reason === 'damaged' ? 'Mark as Damaged' : 'Adjust Stock'}
          </button>
        </div>
      </div>

      {/* Confirmation Modal for Stock Reduction */}
      <div className="modal-overlay" style={{ display: showConfirmModal ? 'flex' : 'none' }} onClick={e => e.stopPropagation()}>
        <div className="modal-content modal-content-sm" onClick={e => e.stopPropagation()}>
          <div className="modal-header">
            <h2 className="modal-title modal-title-success">
              {pendingData?.reason === 'sales-outside' ? 'Confirm Sale Record' : 
               pendingData?.reason === 'damaged' ? 'Confirm Stock Reduction' : 'Confirm Stock Adjustment'}
            </h2>
            <button className="modal-close" onClick={() => setShowConfirmModal(false)}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12"/>
              </svg>
            </button>
          </div>

          <div className="modal-body">
            <div className="confirm-summary">
              <div className="confirm-row">
                <span className="confirm-label">Product:</span>
                <span className="confirm-value">{item?.name}</span>
              </div>
              <div className="confirm-row">
                <span className="confirm-label">Category:</span>
                <span className="confirm-value">{item?.category}</span>
              </div>
              <div className="confirm-row">
                <span className="confirm-label">Quantity:</span>
                <span className="confirm-value" style={{ color: '#f87171', fontWeight: '700' }}>
                  −{pendingData?.quantity} pcs
                </span>
              </div>
              {pendingData?.reason === 'sales-outside' ? (
                <>
                  <div className="confirm-row">
                    <span className="confirm-label">Total Amount Received:</span>
                    <span className="confirm-value" style={{ color: '#4ade80', fontWeight: '700' }}>
                      ₱{pendingData?.sellingPrice?.toFixed(2)}
                    </span>
                  </div>
                  {pendingData?.customerName && (
                    <div className="confirm-row">
                      <span className="confirm-label">Customer:</span>
                      <span className="confirm-value">{pendingData.customerName}</span>
                    </div>
                  )}
                  <div className="confirm-row">
                    <span className="confirm-label">Date:</span>
                    <span className="confirm-value">{pendingData?.saleDate || new Date().toISOString().split('T')[0]}</span>
                  </div>
                </>
              ) : (
                <>
                  <div className="confirm-row">
                    <span className="confirm-label">Reason:</span>
                    <span className="confirm-value">
                      {pendingData?.reason === 'damaged' ? 'Damaged Stock' : 'Stock Correction'}
                    </span>
                  </div>
                  {pendingData?.remarks && (
                    <div className="confirm-row">
                      <span className="confirm-label">Remarks:</span>
                      <span className="confirm-value">{pendingData.remarks}</span>
                    </div>
                  )}
                </>
              )}
            </div>
            <p className="confirm-hint" style={{ marginTop: '1rem', color: '#facc15' }}>
              {pendingData?.reason === 'sales-outside' 
                ? 'This will create a sales record and reduce your inventory stock.'
                : 'This will reduce your inventory stock and create an audit log entry.'}
            </p>
          </div>

          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={() => setShowConfirmModal(false)}>
              Cancel
            </button>
            <button type="button" className="btn-primary" onClick={handleConfirmSale}>
              {pendingData?.reason === 'sales-outside' ? 'Confirm Sale' : 
               pendingData?.reason === 'damaged' ? 'Confirm Reduction' : 'Confirm Adjustment'}
            </button>
          </div>
        </div>
      </div>

      {/* Validation Modal */}
      <div className="modal-overlay" style={{ display: showValidationModal ? 'flex' : 'none' }} onClick={e => e.stopPropagation()}>
        <div className="modal-content modal-content-sm" onClick={e => e.stopPropagation()}>
          <div className="modal-header">
            <h2 className="modal-title modal-title-warning">Validation Error</h2>
            <button className="modal-close" onClick={() => setShowValidationModal(false)}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12"/>
              </svg>
            </button>
          </div>

          <div className="modal-body">
            <p className="delete-confirm-text">
              {validationMessage}
            </p>
          </div>

          <div className="modal-actions">
            <button type="button" className="btn-primary" onClick={() => setShowValidationModal(false)}>
              OK
            </button>
          </div>
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
          <button className="modal-close" onClick={onClose}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
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
  const [showArchived, setShowArchived] = useState(false); // Toggle archived items visibility
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false); // For Add/Edit confirmation
  const [pendingItemData, setPendingItemData] = useState(null); // Temp storage before confirm
  
  // NEW: States for Archive/Delete with product reference checking
  const [archiveItem, setArchiveItem] = useState(null); // Item to archive/delete
  const [referencingProducts, setReferencingProducts] = useState([]); // Products using this item
  const [showArchiveModal, setShowArchiveModal] = useState(false); // Show archive confirmation
  const [restoreItem, setRestoreItem] = useState(null); // Item to restore
  const [hasSalesHistory, setHasSalesHistory] = useState(false); // NEW: Track if item has sales
  
  // NEW: States for Manual Stock Adjustment
  const [adjustmentItem, setAdjustmentItem] = useState(null); // Item being adjusted
  const [showAdjustmentModal, setShowAdjustmentModal] = useState(false); // Show adjustment modal (reduce)
  const [showAdjustmentSuccess, setShowAdjustmentSuccess] = useState(false); // Show success message

  // NEW: States for Stock Addition
  const [additionItem, setAdditionItem] = useState(null); // Item being added
  const [showAdditionModal, setShowAdditionModal] = useState(false); // Show addition modal
  const [showConvertModal, setShowConvertModal] = useState(false); // Show convert from Upon Order confirmation

  // TODO: MongoDB - Replace with API call
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

  // TODO: MongoDB - Remove this useEffect
  // CURRENT: Save to LocalStorage on every change
  // FUTURE: Not needed - will use API calls (POST/PUT) for each action
  useEffect(() => {
    if (isLoaded) {
      saveInventoryList(inventory);
    }
  }, [inventory, isLoaded]);

  // TODO: MongoDB - Replace with API call
  // CURRENT: Save to LocalStorage
  // FUTURE: POST /api/categories
  const handleAddCategory = (newCategory) => {
    const updatedCategories = [...categories, newCategory];
    setCategories(updatedCategories);
    saveCategories(updatedCategories);
  };

  // Filter inventory based on search query and status filter
  // NEW: By default, only show active items (isActive: true)
  const filteredInventory = inventory.filter(item => {
    // EXCLUDE archived items by default
    if (item.isActive === false) return false;
    
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

  // NEW: Filter for archived items (for separate view)
  const archivedInventory = inventory.filter(item => item.isActive === false);

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

  // Handle Delete/Archive Item
  // NEW: Check if item is referenced by products OR sales before allowing delete
  const handleDelete = (item) => {
    // TODO: MongoDB - Replace with API calls to get products and orders referencing this item
    // CURRENT: Check LocalStorage for products and orders
    // FUTURE: GET /api/products?inventoryId={item.id} AND GET /api/orders?inventoryId={item.id}

    const allProducts = JSON.parse(localStorage.getItem('pmp_products') || '[]');
    const allOrders = JSON.parse(localStorage.getItem('pmp_sales') || '[]');

    // Check if referenced by products
    const productsUsingThisItem = allProducts.filter(
      p => p.inventoryId === item.id
    );

    // NEW: Check if item has sales history
    const salesWithThisItem = allOrders.filter(order =>
      order.inventoryId === item.id ||  // Direct inventory sale
      order.items?.some(orderItem => orderItem.inventoryId === item.id) ||
      order.productInventoryId === item.id
    );

    setReferencingProducts(productsUsingThisItem);
    setHasSalesHistory(salesWithThisItem.length > 0); // NEW: Track sales history
    setArchiveItem(item);

    // NEW: Store sales info for validation
    setShowArchiveModal(true);
  };

  // NEW: Archive item (soft delete)
  // TODO: MongoDB - Replace with PUT /api/inventory/:id
  const handleArchive = () => {
    if (!archiveItem) return;

    // Update item to inactive
    setInventory(prev =>
      prev.map(item =>
        item.id === archiveItem.id
          ? { ...item, isActive: false, deletedAt: new Date() }
          : item
      )
    );

    // Auto-archive products linked to this inventory
    const allProducts = JSON.parse(localStorage.getItem('pmp_products') || '[]');
    const updatedProducts = allProducts.map(p =>
      p.inventoryId === archiveItem.id
        ? { ...p, isPublished: false, isArchived: true, updatedAt: new Date().toISOString() }
        : p
    );
    localStorage.setItem('pmp_products', JSON.stringify(updatedProducts));

    // Close modal and reset
    setShowArchiveModal(false);
    setArchiveItem(null);
    setReferencingProducts([]);
  };

  // Handle Permanent Delete (only if not referenced)
  // TODO: MongoDB - Replace with DELETE /api/inventory/:id
  const handlePermanentDelete = () => {
    if (!archiveItem) return;
    
    // Delete permanently
    setInventory(prev => prev.filter(item => item.id !== archiveItem.id));
    
    // Close modal and reset
    setShowArchiveModal(false);
    setArchiveItem(null);
    setReferencingProducts([]);
  };

  // NEW: Restore archived item
  // TODO: MongoDB - Replace with PUT /api/inventory/:id
  const handleRestore = (item) => {
    setInventory(prev =>
      prev.map(i =>
        i.id === item.id
          ? { ...i, isActive: true, deletedAt: null }
          : i
      )
    );
  };

  // NEW: Handle stock adjustment (Manual Stock Out)
  // TODO: MongoDB - Replace with API calls
  const handleStockAdjustment = (adjustmentData) => {
    if (!adjustmentItem) return;

    const { reason, quantity, sellingPrice, saleDate, remarks, customerName } = adjustmentData;

    const newStockQty = Math.max(0, adjustmentItem.stockQty - quantity);

    // ──────────────────────────────────────────────────────────────
    // TODO: MongoDB - Wrap in Transaction
    // These operations should be atomic (all-or-nothing):
    // 1. Update inventory stock
    // 2. Update product availability (if exceeds new stock)
    // 3. Create audit log
    // 4. Create sales record (if sales-outside)
    //
    // Example MongoDB Transaction:
    // const session = client.startSession();
    // await session.withTransaction(async () => {
    //   await Inventory.findByIdAndUpdate(id, { stockQty: newStockQty }, { session });
    //   await Product.updateMany({ inventoryId: id, stock: { $gt: newStockQty } }, { stock: newStockQty }, { session });
    //   await InventoryLog.create([auditLog], { session });
    //   if (reason === 'sales-outside') await Sales.create([salesRecord], { session });
    // });
    // ──────────────────────────────────────────────────────────────

    // Reduce stock
    setInventory(prev =>
      prev.map(item =>
        item.id === adjustmentItem.id
          ? { ...item, stockQty: newStockQty }
          : item
      )
    );

    // NEW: Update product availability if it exceeds new inventory stock
    const existingProducts = JSON.parse(localStorage.getItem('pmp_products') || '[]');
    const productsToUpdate = existingProducts.filter(p => p.inventoryId === adjustmentItem.id && p.stock > newStockQty);
    
    if (productsToUpdate.length > 0) {
      const updatedProducts = existingProducts.map(p => 
        p.inventoryId === adjustmentItem.id && p.stock > newStockQty
          ? { ...p, stock: newStockQty, updatedAt: new Date().toISOString() }
          : p
      );
      localStorage.setItem('pmp_products', JSON.stringify(updatedProducts));
    }

    // Create audit log entry
    const auditLog = {
      id: Date.now(),
      inventoryId: adjustmentItem.id,
      itemName: adjustmentItem.name,
      category: adjustmentItem.category,
      type: 'stock-out',
      reason,
      quantity: -quantity, // Negative for stock out
      stockBefore: adjustmentItem.stockQty,
      stockAfter: adjustmentItem.stockQty - quantity,
      sellingPrice: reason === 'sales-outside' ? sellingPrice : null,
      saleDate: reason === 'sales-outside' ? saleDate : null,
      customerName: reason === 'sales-outside' ? customerName : null,
      remarks,
      createdAt: new Date().toISOString()
    };
    
    // Save to audit logs (LocalStorage for now)
    // TODO: MongoDB - Save to audit_logs collection
    const existingLogs = JSON.parse(localStorage.getItem('pmp_inventory_logs') || '[]');
    localStorage.setItem('pmp_inventory_logs', JSON.stringify([...existingLogs, auditLog]));
    
    // If sales outside system, create sales record
    if (reason === 'sales-outside') {
      const salesRecord = {
        id: Date.now(),
        inventoryId: adjustmentItem.id,
        productName: adjustmentItem.name,
        category: adjustmentItem.category,
        quantity,
        unitPrice: sellingPrice,
        totalPrice: sellingPrice * quantity,
        saleDate,
        customerName,
        source: 'manual', // 'manual' for outside system, 'online' for storefront
        status: 'completed',
        createdAt: new Date().toISOString()
      };
      
      // Save to sales (LocalStorage for now)
      // TODO: MongoDB - Save to sales collection
      const existingSales = JSON.parse(localStorage.getItem('pmp_sales') || '[]');
      localStorage.setItem('pmp_sales', JSON.stringify([...existingSales, salesRecord]));
    }
    
    // Close modal
    setShowAdjustmentModal(false);
    setAdjustmentItem(null);

    // Show success message
    setShowAdjustmentSuccess(true);
  };

  // NEW: Handle stock addition (Manual Stock In)
  // TODO: MongoDB - Replace with API calls
  const handleStockAddition = (additionData) => {
    if (!additionItem) return;

    const { reason, quantity, remarks } = additionData;

    // Convert from Upon Order to In Stock if needed
    const isConverting = additionItem.isOnDemand;

    // Increase stock (and convert to In Stock if was Upon Order)
    setInventory(prev =>
      prev.map(item =>
        item.id === additionItem.id
          ? {
              ...item,
              stockQty: item.stockQty + quantity,
              isOnDemand: isConverting ? false : item.isOnDemand  // Convert to In Stock
            }
          : item
      )
    );

    // Create audit log entry
    const auditLog = {
      id: Date.now(),
      inventoryId: additionItem.id,
      itemName: additionItem.name,
      category: additionItem.category,
      type: 'stock-in',
      reason,
      quantity: quantity, // Positive for stock in
      stockBefore: additionItem.stockQty,
      stockAfter: additionItem.stockQty + quantity,
      convertedFromUponOrder: isConverting,
      remarks,
      createdAt: new Date().toISOString()
    };

    // Save to audit logs (LocalStorage for now)
    // TODO: MongoDB - Save to audit_logs collection
    const existingLogs = JSON.parse(localStorage.getItem('pmp_inventory_logs') || '[]');
    localStorage.setItem('pmp_inventory_logs', JSON.stringify([...existingLogs, auditLog]));

    // Close modal
    setShowAdditionModal(false);
    setAdditionItem(null);

    // Show success message
    setShowAdjustmentSuccess(true);
  };

  // Handle Save (Add or Update) - Shows confirmation modal first
  // TODO: MongoDB - Replace with API call
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
  // TODO: MongoDB - Replace with API call
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
  // TODO: MongoDB - Replace with API call
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
  // NEW: Separate active and archived items
  const totalItems = inventory.length;
  const activeItems = inventory.filter(item => item.isActive !== false).length;
  const archivedItems = inventory.filter(item => item.isActive === false).length;
  const lowStockItems = inventory.filter(item => !item.isOnDemand && item.stockQty <= item.minStockLevel && item.stockQty > 0 && item.isActive !== false).length;
  const outOfStockItems = inventory.filter(item => !item.isOnDemand && item.stockQty === 0 && item.isActive !== false).length;
  const uponOrderItems = inventory.filter(item => item.isOnDemand && item.isActive !== false).length;

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
              <span className="summary-value">{activeItems}</span>
              <span className="summary-label">Active Items</span>
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
          {archivedItems > 0 && (
            <div
              className={`summary-card${showArchived ? ' active' : ''}`}
              onClick={() => setShowArchived(!showArchived)}
              style={{
                cursor: 'pointer',
                background: showArchived ? 'rgba(100, 100, 100, 0.2)' : 'rgba(100, 100, 100, 0.1)',
                border: showArchived ? '1px solid var(--gray)' : '1px solid rgba(100, 100, 100, 0.3)'
              }}
            >
              <div className="summary-content">
                <span className="summary-value" style={{ color: 'var(--gray)' }}>{archivedItems}</span>
                <span className="summary-label" style={{ color: 'var(--gray)' }}>Archived</span>
              </div>
            </div>
          )}
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
      <div style={{
        WebkitOverflowScrolling: 'touch',
        border: '1px solid var(--border)',
        boxSizing: 'border-box',
        scrollbarWidth: 'thin',
        scrollbarColor: 'var(--gold) var(--dark2)',
        borderRadius: '10px',
        width: '0',
        minWidth: '100%',
        marginBottom: '1rem',
        display: 'block',
        overflowX: 'auto',
      }}>
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
                    <td className="table-cell-stock" style={{ textAlign: 'center' }}>
                      {item.isOnDemand ? (
                        <span className="stock-value-dash">—</span>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                          <button
                            className="btn-sm btn-secondary"
                            onClick={() => {
                              setAdjustmentItem(item);
                              setShowAdjustmentModal(true);
                            }}
                            disabled={item.stockQty === 0}
                            style={{ padding: '0.25rem 0.5rem', fontSize: '1rem', lineHeight: '1' }}
                            title="Reduce stock (Manual adjustment)"
                          >
                            −
                          </button>
                          <span
                            className={`stock-value-inline ${stockStatus.status === 'out-of-stock' ? 'stock-value-zero' : ''}`}
                            style={{ minWidth: '40px', display: 'inline-block', textAlign: 'center' }}
                          >
                            {item.stockQty}
                          </span>
                          <button
                            className="btn-sm btn-secondary"
                            onClick={() => {
                              if (item.isOnDemand) {
                                // Item is Upon Order - show conversion confirmation
                                setAdditionItem(item);
                                setShowConvertModal(true);
                              } else {
                                // Item is In Stock - open add stock modal directly
                                setAdditionItem(item);
                                setShowAdditionModal(true);
                              }
                            }}
                            style={{ padding: '0.25rem 0.5rem', fontSize: '1rem', lineHeight: '1' }}
                            title="Add stock"
                          >
                            +
                          </button>
                        </div>
                      )}
                    </td>
                    <td className="table-cell">
                      {item.isOnDemand ? (
                        <span className="stock-value-dash">—</span>
                      ) : editingInline?.id === item.id && editingInline?.field === 'minStockLevel' ? (
                        <NumberInput
                          className="form-input-inline"
                          value={editingInline.value}
                          onChange={handleInlineEditChange}
                          onBlur={handleInlineEditSave}
                          onKeyDown={e => {
                            if (e.key === 'Enter') handleInlineEditSave();
                            if (e.key === 'Escape') handleInlineEditCancel();
                          }}
                          min={0}
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
                        className="btn-sm btn-secondary"
                        onClick={() => handleEdit(item)}
                        style={{ background: 'var(--gold)', borderColor: 'var(--gold)', color: '#000' }}
                      >
                        Edit
                      </button>
                      <button
                        className="btn-sm btn-danger"
                        onClick={() => handleDelete(item)}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* NEW: Archived Items Section */}
      {showArchived && archivedInventory.length > 0 && (
        <div style={{ marginTop: '2rem' }}>
          <h2 style={{
            fontSize: '1.25rem',
            fontWeight: '600',
            color: 'var(--gray)',
            marginBottom: '1rem'
          }}>
            Archived Items ({archivedInventory.length})
          </h2>
          <div style={{
            WebkitOverflowScrolling: 'touch',
            border: '1px solid var(--border)',
            boxSizing: 'border-box',
            scrollbarWidth: 'thin',
            scrollbarColor: 'var(--gold) var(--dark2)',
            borderRadius: '10px',
            width: '0',
            minWidth: '100%',
            marginBottom: '1rem',
            display: 'block',
            overflowX: 'auto',
          }}>
            <table className="inventory-table" style={{
              width: 'max-content',
              minWidth: '100%',
            }}>
              <thead>
                <tr>
                  <th className="table-col-name">Product Name</th>
                  <th className="table-col-category">Category</th>
                  <th className="table-col-stock">Stock</th>
                  <th className="table-col-status">Archived Date</th>
                  <th className="table-col-actions">Actions</th>
                </tr>
              </thead>
              <tbody>
                {archivedInventory.map(item => {
                  const isReferenced = JSON.parse(localStorage.getItem('pmp_products') || '[]').some(p => p.inventoryId === item.id);
                  const hasSalesHistory = JSON.parse(localStorage.getItem('pmp_sales') || '[]').some(order =>
                    order.inventoryId === item.id ||
                    order.items?.some(orderItem => orderItem.inventoryId === item.id) ||
                    order.productInventoryId === item.id
                  );
                  return (
                    <tr key={item.id} className="inventory-table-row" style={{ opacity: 0.5 }}>
                      <td className="table-cell-name">
                        <span className="product-name" style={{ color: 'var(--gray)' }}>{item.name}</span>
                      </td>
                      <td className="table-cell">
                        <span className="category-badge" style={{ background: 'rgba(100, 100, 100, 0.2)', color: 'var(--gray)' }}>{item.category}</span>
                      </td>
                      <td className="table-cell">
                        {item.isOnDemand ? (
                          <span className="stock-value-dash" style={{ color: 'var(--gray)' }}>Upon Order</span>
                        ) : (
                          <span className="stock-value-inline" style={{ color: 'var(--gray)' }}>{item.stockQty}</span>
                        )}
                      </td>
                      <td className="table-cell">
                        <span style={{ color: 'var(--gray)', fontSize: '0.875rem' }}>
                          {item.deletedAt ? new Date(item.deletedAt).toLocaleDateString() : '—'}
                        </span>
                      </td>
                      <td className="table-cell-actions">
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <button
                            className="btn-sm btn-primary"
                            onClick={() => setRestoreItem(item)}
                            style={{
                              background: 'var(--dark2)',
                              borderColor: 'var(--border)',
                              color: 'var(--white)',
                              cursor: 'pointer'
                            }}
                          >
                            Restore
                          </button>
                          {!isReferenced && !hasSalesHistory && (
                            <button
                              className="btn-sm btn-danger"
                              onClick={() => handleDelete(item)}
                            >
                              Remove
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p style={{
            marginTop: '1rem',
            color: 'var(--gray)',
            fontSize: '0.875rem',
            fontStyle: 'italic'
          }}>
            <span style={{ marginRight: '0.5rem', fontWeight: 'bold', color: '#f59e0b' }}>⚠</span> Deleted items were archived to avoid data discrepancies. Adding a product with the same name under the same category will Restore the archived item instead.
          </p>
        </div>
      )}

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
        onRestoreItem={(archivedItem) => {
          handleRestore(archivedItem);
        }}
        item={editingItem}
        editingItem={editingItem}
        categories={categories}
        onAddCategory={handleAddCategory}
        inventory={inventory}
      />

      {/* NEW: Archive/Delete Confirmation Modal with product reference checking */}
      <ArchiveConfirmModal
        isOpen={showArchiveModal}
        onClose={() => {
          setShowArchiveModal(false);
          setArchiveItem(null);
          setReferencingProducts([]);
          setHasSalesHistory(false);
        }}
        onArchive={handleArchive}
        onDelete={handlePermanentDelete}
        itemName={archiveItem?.name}
        isReferenced={referencingProducts.length > 0}
        referencingProductsCount={referencingProducts.length}
        hasSalesHistory={hasSalesHistory}
      />

      {/* NEW: Restore Confirmation Modal */}
      {restoreItem && (
        <ConfirmModal
          title="Restore Inventory Item"
          message={`Restore "${restoreItem.name}" from archived? This will make the item available for use again.`}
          confirmLabel="Restore"
          confirmClass="btn-primary"
          onConfirm={() => {
            handleRestore(restoreItem);
            setRestoreItem(null);
          }}
          onCancel={() => setRestoreItem(null)}
        />
      )}

      {/* NEW: Manual Stock Adjustment Modal */}
      <StockAdjustmentModal
        isOpen={showAdjustmentModal}
        onClose={() => {
          setShowAdjustmentModal(false);
          setAdjustmentItem(null);
        }}
        onConfirm={handleStockAdjustment}
        item={adjustmentItem}
      />

      {/* NEW: Stock Addition Modal */}
      <StockAdditionModal
        isOpen={showAdditionModal}
        onClose={() => {
          setShowAdditionModal(false);
          setAdditionItem(null);
        }}
        onConfirm={handleStockAddition}
        item={additionItem}
      />

      {/* Convert Upon Order to In Stock Confirmation */}
      {showConvertModal && additionItem && (
        <div className="modal-overlay" style={{ display: 'flex' }} onClick={() => setShowConvertModal(false)}>
          <div className="modal-content modal-content-sm" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title modal-title-warning">Convert to In Stock</h2>
              <button className="modal-close" onClick={() => setShowConvertModal(false)}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12"/>
                </svg>
              </button>
            </div>

            <div className="modal-body">
              <p className="delete-confirm-text">
                <strong>"{additionItem.name}"</strong> is currently set as <strong>"Upon Order"</strong>.
              </p>
              <p className="delete-confirm-warning" style={{ marginTop: '0.75rem', color: '#f59e0b' }}>
                Adding physical stock will convert this item to <strong>"In Stock"</strong> mode. This change will enable stock tracking for this item.
              </p>
              <div style={{
                background: 'rgba(245, 158, 11, 0.1)',
                border: '1px solid rgba(245, 158, 11, 0.3)',
                borderRadius: '8px',
                padding: '1rem',
                marginTop: '1rem'
              }}>
                <div style={{ fontSize: '0.875rem', color: 'var(--gray)', marginBottom: '0.5rem' }}>Current Status:</div>
                <div style={{ fontWeight: '600', color: 'var(--white)', marginBottom: '0.25rem' }}>{additionItem.name}</div>
                <div style={{ fontSize: '0.875rem', color: 'var(--gray)' }}>
                  Category: {additionItem.category} • Status: Upon Order
                </div>
              </div>
              <p style={{ marginTop: '1rem', fontSize: '0.875rem', color: 'var(--gray)' }}>
                Do you want to proceed with adding stock and converting to "In Stock" mode?
              </p>
            </div>

            <div className="modal-actions">
              <button type="button" className="btn-secondary" onClick={() => setShowConvertModal(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={() => {
                  setShowConvertModal(false);
                  setShowAdditionModal(true); // Open stock addition modal
                }}
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      )}

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

      {/* Stock Adjustment Success Toast */}
      {showAdjustmentSuccess && (
        <div className="modal-overlay" style={{ display: 'flex' }} onClick={() => setShowAdjustmentSuccess(false)}>
          <div className="modal-content modal-content-sm" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title modal-title-success">Success</h2>
              <button className="modal-close" onClick={() => setShowAdjustmentSuccess(false)}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12"/>
                </svg>
              </button>
            </div>
            <div className="modal-body">
              <p className="confirm-hint" style={{ textAlign: 'center', fontSize: '0.95rem' }}>
                Stock adjusted successfully!
              </p>
            </div>
            <div className="modal-actions">
              <button type="button" className="btn-primary" onClick={() => setShowAdjustmentSuccess(false)}>
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
