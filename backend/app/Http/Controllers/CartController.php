<?php

namespace App\Http\Controllers;

use App\Models\Cart;
use App\Models\Product;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

class CartController extends Controller
{
    /**
     * Get authenticated user by Bearer token
     */
    private function getAuthUser(Request $request): ?User
    {
        return $request->user();
    }

    /**
     * GET /api/cart
     * Get verified user's cart from MongoDB
     */
    public function index(Request $request)
    {
        try {
            $user = $this->getAuthUser($request);

            if (!$user) {
                return $this->unauthorizedResponse();
            }

            $cart = Cart::getByUserId((string) $user->_id);

            if (!$cart) {
                // Create empty cart for user
                $cart = Cart::create([
                    'userId' => (string) $user->_id,
                    'items' => [],
                    'updatedAt' => now(),
                ]);
            }

            // Ensure items is always an array
            $cart->items = $cart->items ?? [];

            return $this->successResponse('Cart fetched successfully.', $cart);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'An unexpected error occurred while fetching cart.');
        }
    }

    /**
     * POST /api/cart/sync
     * Save verified user's cart to MongoDB
     */
    public function sync(Request $request)
    {
        try {
            $user = $this->getAuthUser($request);

            if (!$user) {
                return $this->unauthorizedResponse();
            }

            $validated = $request->validate([
                'items' => 'required|array',
                'items.*.productId' => 'required|string',
                'items.*.productName' => 'required|string',
                'items.*.qty' => 'required|integer|min:1',
                'items.*.unitPrice' => 'required|numeric|min:0',
                'items.*.lineTotal' => 'required|numeric|min:0',
                'items.*.variantId' => 'nullable|string',
                'items.*.variantName' => 'nullable|string',
                'items.*.image' => 'nullable|string',
            ]);

            $cart = Cart::getByUserId((string) $user->_id);

            if ($cart) {
                // Update existing cart
                $cart->items = $validated['items'];
                $cart->updatedAt = now();
                $cart->save();
            } else {
                // Create new cart
                $cart = Cart::create([
                    'userId' => (string) $user->_id,
                    'items' => $validated['items'],
                    'updatedAt' => now(),
                ]);
            }

            // Ensure items is always an array
            $cart->items = $cart->items ?? [];

            return $this->successResponse('Cart synced successfully.', $cart);
        } catch (\Illuminate\Validation\ValidationException $e) {
            return $this->validationErrorResponse($e);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'An unexpected error occurred while syncing cart.');
        }
    }

    /**
     * POST /api/cart/merge
     * Merge guest cart with user's cart on login
     */
    public function merge(Request $request)
    {
        try {
            $user = $this->getAuthUser($request);

            if (!$user) {
                return $this->unauthorizedResponse();
            }

            $validated = $request->validate([
                'items' => 'required|array',
                'items.*.productId' => 'required|string',
                'items.*.productName' => 'required|string',
                'items.*.qty' => 'required|integer|min:1',
                'items.*.unitPrice' => 'required|numeric|min:0',
                'items.*.lineTotal' => 'required|numeric|min:0',
                'items.*.variantId' => 'nullable|string',
                'items.*.variantName' => 'nullable|string',
                'items.*.image' => 'nullable|string',
            ]);

            $guestItems = $validated['items'];

            // Get or create user's cart
            $cart = Cart::getByUserId((string) $user->_id);

            if (!$cart) {
                $cart = Cart::create([
                    'userId' => (string) $user->_id,
                    'items' => [],
                    'updatedAt' => now(),
                ]);
            }

            $existingItems = $cart->items ?? [];
            $mergedItems = $existingItems;

            // Merge guest items into user cart
            foreach ($guestItems as $guestItem) {
                $foundIndex = null;

                // Find matching item by productId and variantId
                foreach ($mergedItems as $index => $item) {
                    $item = (array) $item;
                    if ($item['productId'] === $guestItem['productId'] &&
                        ($item['variantId'] ?? null) === ($guestItem['variantId'] ?? null)) {
                        $foundIndex = $index;
                        break;
                    }
                }

                if ($foundIndex !== null) {
                    // Item exists - add quantities
                    $mergedItems[$foundIndex] = (array) $mergedItems[$foundIndex];
                    $mergedItems[$foundIndex]['qty'] += $guestItem['qty'];
                    $mergedItems[$foundIndex]['lineTotal'] = $mergedItems[$foundIndex]['qty'] * $mergedItems[$foundIndex]['unitPrice'];
                } else {
                    // Item doesn't exist - add as new
                    $mergedItems[] = $guestItem;
                }
            }

            // Save merged cart
            $cart->items = $mergedItems;
            $cart->updatedAt = now();
            $cart->save();

            // Ensure items is always an array
            $cart->items = $cart->items ?? [];

            return $this->successResponse('Cart merged successfully.', $cart);
        } catch (\Illuminate\Validation\ValidationException $e) {
            return $this->validationErrorResponse($e);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'An unexpected error occurred while merging cart.');
        }
    }

    /**
     * DELETE /api/cart/clear
     * Clear user's cart
     */
    public function clear(Request $request)
    {
        try {
            $user = $this->getAuthUser($request);

            if (!$user) {
                return $this->unauthorizedResponse();
            }

            $cart = Cart::getByUserId((string) $user->_id);

            if ($cart) {
                $cart->clear();
            }

            return $this->successResponse('Cart cleared successfully.', $cart);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'An unexpected error occurred while clearing cart.');
        }
    }
}
