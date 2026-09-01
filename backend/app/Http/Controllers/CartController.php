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

    /**
     * Fill in what the client did not send.
     *
     * `lineTotal` is qty x unitPrice - the server can always work it out, so it is accepted as
     * optional and derived here rather than rejecting an otherwise valid cart over it.
     */
    private function withLineTotals(array $items): array
    {
        return array_map(function ($i) {
            $qty  = max(1, (int) ($i['qty'] ?? 1));
            $unit = (float) ($i['unitPrice'] ?? 0);
            $i['qty']       = $qty;
            $i['unitPrice'] = $unit;
            $i['lineTotal'] = isset($i['lineTotal']) && $i['lineTotal'] !== null
                ? (float) $i['lineTotal']
                : round($qty * $unit, 2);
            return $i;
        }, $items);
    }

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
                // Derivable from qty x unitPrice, so requiring it rejects an otherwise perfectly good cart
                // over a field the server can work out itself. A cart saved by an older version of the
                // app had none, and the whole merge failed - losing everything the customer had added
                // before signing in.
                'items.*.lineTotal' => 'nullable|numeric|min:0',
                'items.*.variantId' => 'nullable|string',
                'items.*.variantName' => 'nullable|string',
                'items.*.image' => 'nullable|string',
                'items.*.lineId' => 'nullable|string',
                'items.*.isCustom' => 'nullable|boolean',
                'items.*.designUrl' => 'nullable|string',
                'items.*.designNotes' => 'nullable|string',
                // Cloudinary renames the stored file, so the customer's own filename has to
                // travel with the line or they only ever see a random string.
                'items.*.designName' => 'nullable|string|max:255',
                // The full set of artwork for this line. designUrl remains the first file.
                'items.*.designFiles' => 'nullable|array|max:5',
                'items.*.designFiles.*.url'  => 'required_with:items.*.designFiles|string|max:600',
                'items.*.designFiles.*.name' => 'nullable|string|max:255',
                // A customised line has to survive the round trip. Anything not listed
                // here is stripped on save - which is why the cart forgot that a design
                // had already been requested and demanded an upload, and why checkout
                // forgot the item was made-to-order (no downpayment, COD still offered).
                'items.*.designMode' => 'nullable|string|in:upload,request',
                'items.*.designFee' => 'nullable|numeric|min:0|max:99999',
                'items.*.requiresDownpayment' => 'nullable|boolean',
                'items.*.downpaymentPercent' => 'nullable|numeric|min:0|max:100',
                'items.*.allowCOD' => 'nullable|boolean',
                'items.*.minOrderQty' => 'nullable|integer|min:1',
                'items.*.priceTiers' => 'nullable|array',
                'items.*.flashSaleId' => 'nullable|string',
                // The clickwrap acceptance, for the same reason as everything above it: the customer
                // ticks "I have read and agree" on the product page, the acceptance rides along on the
                // cart line - and then the very first sync dropped all three of these fields, because
                // they were never listed. By checkout there was nothing left to forward, so the order
                // recorded agreedToTerms: false and the admin was told, correctly, that no acceptance
                // existed. The proof was being collected and thrown away in the same breath.
                'items.*.termsVersion' => 'nullable|integer|min:0',
                'items.*.termsAgreedAt' => 'nullable|string|max:64',
                'items.*.termsSnapshot' => 'nullable|array|max:60',
                'items.*.termsSnapshot.*.title' => 'required_with:items.*.termsSnapshot|string|max:200',
                'items.*.termsSnapshot.*.body'  => 'nullable|string|max:5000',
                'items.*.termsSnapshot.*.mode'  => 'nullable|string|max:20',
            ]);

            $cart = Cart::getByUserId((string) $user->_id);

            if ($cart) {
                // Update existing cart
                $cart->items = $this->withLineTotals($validated['items']);
                $cart->updatedAt = now();
                $cart->save();
            } else {
                // Create new cart
                $cart = Cart::create([
                    'userId' => (string) $user->_id,
                    'items' => $this->withLineTotals($validated['items']),
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
                // Derivable from qty x unitPrice, so requiring it rejects an otherwise perfectly good cart
                // over a field the server can work out itself. A cart saved by an older version of the
                // app had none, and the whole merge failed - losing everything the customer had added
                // before signing in.
                'items.*.lineTotal' => 'nullable|numeric|min:0',
                'items.*.variantId' => 'nullable|string',
                'items.*.variantName' => 'nullable|string',
                'items.*.image' => 'nullable|string',
                'items.*.lineId' => 'nullable|string',
                'items.*.isCustom' => 'nullable|boolean',
                'items.*.designUrl' => 'nullable|string',
                'items.*.designNotes' => 'nullable|string',
                // Cloudinary renames the stored file, so the customer's own filename has to
                // travel with the line or they only ever see a random string.
                'items.*.designName' => 'nullable|string|max:255',
                // The full set of artwork for this line. designUrl remains the first file.
                'items.*.designFiles' => 'nullable|array|max:5',
                'items.*.designFiles.*.url'  => 'required_with:items.*.designFiles|string|max:600',
                'items.*.designFiles.*.name' => 'nullable|string|max:255',
                // A customised line has to survive the round trip. Anything not listed
                // here is stripped on save - which is why the cart forgot that a design
                // had already been requested and demanded an upload, and why checkout
                // forgot the item was made-to-order (no downpayment, COD still offered).
                'items.*.designMode' => 'nullable|string|in:upload,request',
                'items.*.designFee' => 'nullable|numeric|min:0|max:99999',
                'items.*.requiresDownpayment' => 'nullable|boolean',
                'items.*.downpaymentPercent' => 'nullable|numeric|min:0|max:100',
                'items.*.allowCOD' => 'nullable|boolean',
                'items.*.minOrderQty' => 'nullable|integer|min:1',
                'items.*.priceTiers' => 'nullable|array',
                'items.*.flashSaleId' => 'nullable|string',
                // The clickwrap acceptance, for the same reason as everything above it: the customer
                // ticks "I have read and agree" on the product page, the acceptance rides along on the
                // cart line - and then the very first sync dropped all three of these fields, because
                // they were never listed. By checkout there was nothing left to forward, so the order
                // recorded agreedToTerms: false and the admin was told, correctly, that no acceptance
                // existed. The proof was being collected and thrown away in the same breath.
                'items.*.termsVersion' => 'nullable|integer|min:0',
                'items.*.termsAgreedAt' => 'nullable|string|max:64',
                'items.*.termsSnapshot' => 'nullable|array|max:60',
                'items.*.termsSnapshot.*.title' => 'required_with:items.*.termsSnapshot|string|max:200',
                'items.*.termsSnapshot.*.body'  => 'nullable|string|max:5000',
                'items.*.termsSnapshot.*.mode'  => 'nullable|string|max:20',
            ]);

            $guestItems = $this->withLineTotals($validated['items']);

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

                // Match on productId + variantId ONLY for lines that carry no artwork. Two Ceramic
                // White mugs are the same product, but if one has the customer's own file and the
                // other is a design request they are NOT the same line - merging them collapsed the
                // pair into qty 2 and silently kept whichever design came first, so the customer paid
                // for two of something they never asked for. A line with a design is always unique.
                $carriesDesign = static function (array $i): bool {
                    return !empty($i['designUrl']) || !empty($i['designFiles'])
                        || !empty($i['designRequested']) || ($i['designMode'] ?? null) === 'request';
                };

                if (!$carriesDesign((array) $guestItem)) {
                    foreach ($mergedItems as $index => $item) {
                        $item = (array) $item;
                        if ($carriesDesign($item)) continue;
                        if ($item['productId'] === $guestItem['productId'] &&
                            ($item['variantId'] ?? null) === ($guestItem['variantId'] ?? null)) {
                            $foundIndex = $index;
                            break;
                        }
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
