'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { fetchCart, syncCart, mergeCart, clearCart as clearCartApi } from '@/lib/cartApi';
import { useAuth } from '@/contexts/AuthContext';

export const CartContext = createContext(null);

const GUEST_CART_KEY = 'pmp_guest_cart';

export function CartProvider({ children }) {
  const [cartItems, setCartItems] = useState([]);
  const [isCartLoading, setIsCartLoading] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const { token, currentUser } = useAuth();
  const qtyDebounceRef = useRef(null);

  const isLoggedIn = useCallback(() => {
    return !!token;
  }, [token]);

  const ensureLineIds = (items) =>
    items.map((item, i) => item.lineId ? item : { ...item, lineId: `legacy_${item.productId}_${item.variantId || 'none'}_${i}` });

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
                setCartItems(ensureLineIds(((merged?.data ?? merged)?.items || []).filter(Boolean)));
                localStorage.removeItem(GUEST_CART_KEY);
                return;
              }
            } catch {
              // merge failed — fall through to normal fetch
            }
          }
          const cart = await fetchCart(token);
          setCartItems(ensureLineIds(((cart?.data ?? cart)?.items || []).filter(Boolean)));
        } else {
          // Guest user - load from localStorage
          const stored = localStorage.getItem(GUEST_CART_KEY);
          setCartItems(ensureLineIds(stored ? JSON.parse(stored) : []));
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
  const addToCart = useCallback(async (product, qty = 1, variantId = null, variantName = null, flashSaleId = null, designData = null) => {
    setIsCartLoading(true);
    try {
      const resolvedQty = Math.max(1, parseInt(qty) || 1);
      // The chosen variant's own photo, when it has one. Resolved here rather than at each
      // call site so every entry point into the cart shows the variant the customer picked
      // instead of the generic product shot.
      const variantImage = variantId != null
        ? (product.variantImageUrls?.[variantId]
            ?? product.variantImageUrls?.[String(variantId)]
            ?? product.combinations?.find(c => String(c.id) === String(variantId))?.imageUrl
            ?? null)
        : null;
      const newItem = {
        lineId: `line_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        productId: product._id || product.id,
        productName: product.name,
        ...(variantId != null ? { variantId: String(variantId) } : {}),
        ...(variantName != null ? { variantName: String(variantName) } : {}),
        qty: resolvedQty,
        unitPrice: product.flatPrice || product.price || 0,
        lineTotal: (product.flatPrice || product.price || 0) * resolvedQty,
        ...(product.priceTiers?.length ? { priceTiers: product.priceTiers } : {}),
        image: variantImage || product.thumbnail || product.images?.[0] || null,
        isCustom: product.isCustom ?? false,
        allowCOD: product.allowCOD ?? true,
        ...(product.designFee != null ? { designFee: product.designFee } : {}),
        ...(product.minOrderQty != null ? { minOrderQty: product.minOrderQty } : {}),
        ...(product.requiresDownpayment ? { requiresDownpayment: true, downpaymentPercent: product.downpaymentPercent ?? 50 } : {}),
        // A customised line carries its own artwork - this is what lets several customised
        // products share one cart, one delivery fee and one checkout.
        ...(designData?.url ? { designUrl: designData.url } : {}),
        ...(designData?.name ? { designName: designData.name } : {}),
        // designUrl stays the first file so nothing downstream had to change; designFiles
        // carries the whole set for lines that need more than one.
        ...(designData?.files?.length ? { designFiles: designData.files } : {}),
        ...(designData?.notes ? { designNotes: designData.notes } : {}),
        ...(designData?.mode ? { designMode: designData.mode } : {}),
        ...(flashSaleId != null ? { flashSaleId: String(flashSaleId) } : {}),
      };

      let updatedItems = [...cartItems];
      updatedItems.push(newItem);

      await saveCart(updatedItems);
    } catch (error) {
      console.error('Failed to add to cart:', error);
      throw error;
    } finally {
      setIsCartLoading(false);
    }
  }, [cartItems, saveCart]);

  /**
   * Remove item from cart by lineId
   */
  const removeFromCart = useCallback(async (lineId) => {
    setIsCartLoading(true);
    try {
      const updatedItems = cartItems.filter(item => item.lineId !== lineId);
      await saveCart(updatedItems);
    } catch (error) {
      console.error('Failed to remove from cart:', error);
      throw error;
    } finally {
      setIsCartLoading(false);
    }
  }, [cartItems, saveCart]);

  const bulkRemove = useCallback(async (lineIds) => {
    setIsCartLoading(true);
    try {
      const updatedItems = cartItems.filter(item => !lineIds.includes(item.lineId));
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
  const resolveTierPrice = (priceTiers, qty, variantId) => {
    if (!priceTiers?.length) return null;
    const sorted = [...priceTiers].sort((a, b) => (parseInt(a.minQty) || 0) - (parseInt(b.minQty) || 0));
    let match = null;
    for (const t of sorted) {
      const min = parseInt(t.minQty) || 0;
      const max = t.maxQty != null && t.maxQty !== '' ? parseInt(t.maxQty) : Infinity;
      if (qty >= min && qty <= max) { match = t; break; }
    }
    if (!match) match = sorted[sorted.length - 1];
    if (!match) return null;
    if (variantId && match.prices) {
      const p = match.prices[String(variantId)];
      return p != null ? parseFloat(p) : null;
    }
    return null;
  };

  const updateQty = useCallback((lineId, newQty) => {
    const updatedItems = cartItems.map(item => {
      if (item.lineId !== lineId) return item;
      const qty = Math.max(item.minOrderQty || 1, parseInt(newQty) || 1);
      const tierPrice = resolveTierPrice(item.priceTiers, qty, item.variantId);
      const unitPrice = tierPrice ?? item.unitPrice;
      return { ...item, qty, unitPrice, lineTotal: qty * unitPrice };
    });

    // Optimistic update — reflects immediately in UI
    setCartItems(updatedItems);

    // Persist guest cart immediately (no API)
    if (!token) {
      try { localStorage.setItem('pmp_guest_cart', JSON.stringify(updatedItems)); } catch {}
      return;
    }

    // Debounce API sync — 400ms
    if (qtyDebounceRef.current) clearTimeout(qtyDebounceRef.current);
    qtyDebounceRef.current = setTimeout(async () => {
      try {
        setIsCartLoading(true);
        await saveCart(updatedItems);
      } catch (error) {
        console.error('Failed to sync cart qty:', error);
      } finally {
        setIsCartLoading(false);
      }
    }, 400);
  }, [cartItems, saveCart, token]);

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
