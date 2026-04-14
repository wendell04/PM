'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { fetchCart, syncCart, mergeCart, clearCart as clearCartApi } from '@/lib/cartApi';
import { useAuth } from '@/contexts/AuthContext';

export const CartContext = createContext(null);

const GUEST_CART_KEY = 'pmp_guest_cart';

export function CartProvider({ children }) {
  const [cartItems, setCartItems] = useState([]);
  const [isCartLoading, setIsCartLoading] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const { token, currentUser } = useAuth();

  const isLoggedIn = useCallback(() => {
    return !!token;
  }, [token]);

  /**
   * Load cart on mount or when login status changes
   */
  useEffect(() => {
    async function loadCart() {
      // Admin/owner users don't use cart — skip entirely
      if (currentUser && ['admin', 'owner'].includes(currentUser?.role)) {
        setIsCartLoading(false);
        return;
      }

      setIsCartLoading(true);
      try {
        if (token) {
          // Check if guest cart exists — merge before fetching
          const guestCart = localStorage.getItem(GUEST_CART_KEY);
          if (guestCart) {
            try {
              const guestItems = JSON.parse(guestCart);
              if (guestItems?.length > 0) {
                const merged = await mergeCart(guestItems, token);
                setCartItems(((merged?.data ?? merged)?.items || []).filter(Boolean));
                localStorage.removeItem(GUEST_CART_KEY);
                return;
              }
            } catch {
              // merge failed — fall through to normal fetch
            }
          }
          const cart = await fetchCart(token);
          setCartItems(((cart?.data ?? cart)?.items || []).filter(Boolean));
        } else {
          // Guest user - load from localStorage
          const stored = localStorage.getItem(GUEST_CART_KEY);
          setCartItems(stored ? JSON.parse(stored) : []);
        }
      } catch (error) {
        console.error('Failed to load cart:', error);
        // Do not wipe cartItems on network/timeout failure — preserve existing state
      } finally {
        setIsCartLoading(false);
        setIsInitialized(true);
      }
    }

    loadCart();
  }, [token?.slice(0, 10), currentUser?.email]);

  /**
   * Save cart to appropriate storage based on login status
   */
  const saveCart = useCallback(async (items) => {
    try {
      if (isLoggedIn()) {
        if (items.length === 0) {
          await clearCartApi(token);
        } else {
          await syncCart(items, token);
        }
      } else {
        // Save to localStorage for guests
        localStorage.setItem(GUEST_CART_KEY, JSON.stringify(items));
      }
      setCartItems(items);
    } catch (error) {
      console.error('Failed to save cart:', error);
      throw error;
    }
  }, [token]);

  /**
   * Add item to cart
   */
  const addToCart = useCallback(async (product, qty = 1, variantId = null, variantName = null) => {
    setIsCartLoading(true);
    try {
      const newItem = {
        productId: product._id || product.id,
        productName: product.name,
        ...(variantId != null ? { variantId: String(variantId) } : {}),
        ...(variantName != null ? { variantName: String(variantName) } : {}),
        qty: Math.max(1, parseInt(qty) || 1),
        unitPrice: product.flatPrice || product.price || 0,
        lineTotal: (product.flatPrice || product.price || 0) * Math.max(1, parseInt(qty) || 1),
        image: product.thumbnail || product.images?.[0] || null,
      };

      let updatedItems = [...cartItems];

      // Check if item already exists (same productId + variantId)
      const existingIndex = updatedItems.findIndex(
        item => item.productId === newItem.productId && 
                (item.variantId || null) === (variantId || null)
      );

      if (existingIndex !== -1) {
        // Update existing item quantity
        updatedItems[existingIndex].qty += newItem.qty;
        updatedItems[existingIndex].lineTotal = updatedItems[existingIndex].qty * updatedItems[existingIndex].unitPrice;
      } else {
        // Add new item
        updatedItems.push(newItem);
      }

      await saveCart(updatedItems);
    } catch (error) {
      console.error('Failed to add to cart:', error);
      throw error;
    } finally {
      setIsCartLoading(false);
    }
  }, [cartItems, saveCart]);

  /**
   * Remove item from cart
   */
  const removeFromCart = useCallback(async (productId, variantId = null) => {
    setIsCartLoading(true);
    try {
      const updatedItems = cartItems.filter(item => 
        !(item.productId === productId && (item.variantId || null) === (variantId || null))
      );
      await saveCart(updatedItems);
    } catch (error) {
      console.error('Failed to remove from cart:', error);
      throw error;
    } finally {
      setIsCartLoading(false);
    }
  }, [cartItems, saveCart]);

  const bulkRemove = useCallback(async (toRemove) => {
    // toRemove: array of { productId, variantId }
    setIsCartLoading(true);
    try {
      const updatedItems = cartItems.filter(item =>
        !toRemove.some(r =>
          r.productId === item.productId &&
          (r.variantId || null) === (item.variantId || null)
        )
      );
      await saveCart(updatedItems);
    } catch (error) {
      console.error('[bulkRemove]', error);
      throw error;
    } finally {
      setIsCartLoading(false);
    }
  }, [cartItems, saveCart]);

  /**
   * Update item quantity
   */
  const updateQty = useCallback(async (productId, variantId, newQty) => {
    setIsCartLoading(true);
    try {
      const updatedItems = cartItems.map(item => {
        if (item.productId === productId && (item.variantId || null) === (variantId || null)) {
          const qty = Math.max(0, parseInt(newQty) || 0);
          return {
            ...item,
            qty,
            lineTotal: qty * item.unitPrice,
          };
        }
        return item;
      }).filter(item => item.qty > 0); // Remove items with 0 qty

      await saveCart(updatedItems);
    } catch (error) {
      console.error('Failed to update quantity:', error);
      throw error;
    } finally {
      setIsCartLoading(false);
    }
  }, [cartItems, saveCart]);

  /**
   * Clear cart
   */
  const clearCart = useCallback(async () => {
    setIsCartLoading(true);
    try {
      if (isLoggedIn()) {
        // Clear backend cart
        await clearCartApi(token);
      } else {
        // Clear localStorage
        localStorage.removeItem(GUEST_CART_KEY);
      }
      setCartItems([]);
    } catch (error) {
      console.error('Failed to clear cart:', error);
      throw error;
    } finally {
      setIsCartLoading(false);
    }
  }, [token]);

  /**
   * Get total items count
   */
  const cartCount = cartItems.length;

  /**
   * Get total price
   */
  const cartTotal = cartItems.reduce((sum, item) => sum + item.lineTotal, 0);

  /**
   * Safe wrapper for setCartItems - only allows arrays
   */
  const setCartItemsSafe = useCallback((items) => {
    if (!Array.isArray(items)) return;
    setCartItems(items);
  }, []);

  const value = {
    cartItems,
    setCartItems: setCartItemsSafe,
    isCartLoading,
    addToCart,
    removeFromCart,
    bulkRemove,
    updateQty,
    clearCart,
    cartCount,
    cartTotal,
    isLoggedIn,
  };

  return (
    <CartContext.Provider value={value}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
}
