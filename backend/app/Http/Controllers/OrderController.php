<?php

namespace App\Http\Controllers;

use App\Models\Order;
use App\Models\Product;
use App\Models\User;
use App\Models\Sale;
use App\Models\Inventory;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\DB;

class OrderController extends Controller
{
    // ─── Helpers ──────────────────────────────────────────────────────────────

    /**
     * Resolves the authenticated user from Bearer token.
     */
    private function getAuthUser(Request $request): ?User
    {
        $token = $request->bearerToken();
        if (!$token) return null;
        return User::where('api_token', hash('sha256', $token))->first();
    }

    // ─── Customer ─────────────────────────────────────────────────────────────

    /**
     * POST /api/orders
     * Customer places an order.
     *
     * Body: {
     *   items: [{ productId, variantId?, variantName?, qty }],
     *   notes?: string
     * }
     */
    public function store(Request $request)
    {
        try {
            $user = $this->getAuthUser($request);
            if (!$user) {
                return response()->json(['error' => 'Unauthenticated.'], 401);
            }

            $validated = $request->validate([
                'items'              => 'required|array|min:1',
                'items.*.productId'  => 'required|string',
                'items.*.variantId'  => 'nullable|string',
                'items.*.variantName'=> 'nullable|string',
                'items.*.qty'        => 'required|integer|min:1',
                'notes'              => 'nullable|string|max:1000',
            ]);

            // Use transaction for order creation
            $order = DB::connection('mongodb')->transaction(function() use ($validated, $user) {
                // Build order items with pricing
                $orderItems   = [];
                $totalAmount  = 0;

                foreach ($validated['items'] as $item) {
                    $product = Product::where('_id', $item['productId'])
                                      ->where('isActive', true)
                                      ->first();

                    if (!$product) {
                        throw new \Exception("Product '{$item['productId']}' not found or unavailable.");
                    }

                    // Resolve unit price from priceTiers or flatPrice
                    $qty       = (int) $item['qty'];
                    $variantId = $item['variantId'] ?? null;
                    $unitPrice = $this->resolvePrice($product, $qty, $variantId);

                    if ($unitPrice === null) {
                        throw new \Exception("No price configured for product '{$product->name}'.");
                    }

                    $lineTotal     = $unitPrice * $qty;
                    $totalAmount  += $lineTotal;

                    $orderItems[] = [
                        'productId'   => (string) $product->_id,
                        'productName' => $product->name,
                        'variantId'   => $item['variantId']   ?? null,
                        'variantName' => $item['variantName'] ?? null,
                        'qty'         => $qty,
                        'unitPrice'   => $unitPrice,
                        'lineTotal'   => $lineTotal,
                    ];
                }

                $order = Order::create([
                    'userId'       => (string) $user->_id,
                    'userSnapshot' => [
                        'name'  => trim("{$user->firstName} {$user->lastName}"),
                        'email' => $user->email,
                        'phone' => $user->phoneNumber,
                    ],
                    'items'        => $orderItems,
                    'totalAmount'  => $totalAmount,
                    'status'       => 'pending',
                    'paymentStatus'=> 'unpaid',
                    'notes'        => $validated['notes'] ?? '',
                    'createdAt'    => now(),
                    'updatedAt'    => now(),
                ]);

                return $order;
            });

            // Notify owner asynchronously
            $this->notifyOwner($order);

            return response()->json([
                'message' => 'Order placed successfully!',
                'order'   => $order
            ], 201);

        } catch (\Illuminate\Validation\ValidationException $e) {
            Log::warning('OrderController@store: Validation failed for user ' . ($user?->email ?? 'guest'), ['errors' => $e->errors()]);
            return response()->json(['errors' => $e->errors()], 422);
        } catch (\Exception $e) {
            Log::error('OrderController@store: Failed to place order for user ' . ($user?->email ?? 'guest'), ['error' => $e->getMessage()]);
            return response()->json(['error' => 'An unexpected error occurred while placing your order.'], 500);
        }
    }

    /**
     * GET /api/orders/my
     * Returns the authenticated customer's orders.
     */
    public function myOrders(Request $request)
    {
        try {
            $user = $this->getAuthUser($request);
            if (!$user) {
                return response()->json(['error' => 'Unauthenticated.'], 401);
            }

            $orders = Order::where('userId', (string) $user->_id)
                           ->orderBy('created_at', 'desc')
                           ->get();

            return response()->json($orders);
        } catch (\Exception $e) {
            Log::error('OrderController@myOrders: Failed to fetch orders for user ' . $user->email, ['error' => $e->getMessage()]);
            return response()->json(['error' => 'An unexpected error occurred while fetching your orders.'], 500);
        }
    }

    /**
     * GET /api/orders/my/{id}
     * Returns a single order belonging to the authenticated customer.
     */
    public function myOrderShow(Request $request, $id)
    {
        try {
            $user = $this->getAuthUser($request);
            if (!$user) {
                return response()->json(['error' => 'Unauthenticated.'], 401);
            }

            $order = Order::where('_id', $id)
                          ->where('userId', (string) $user->_id)
                          ->first();

            if (!$order) {
                return response()->json(['error' => 'Order not found.'], 404);
            }

            return response()->json($order);
        } catch (\Exception $e) {
            Log::error('OrderController@myOrderShow: Failed to fetch order ' . $id . ' for user ' . $user->email, ['error' => $e->getMessage()]);
            return response()->json(['error' => 'An unexpected error occurred while fetching your order.'], 500);
        }
    }

    // ─── Admin Only ───────────────────────────────────────────────────────────

    /**
     * GET /api/admin/orders
     * Returns all orders for the admin dashboard.
     */
    public function adminIndex(Request $request)
    {
        try {
            $query = Order::orderBy('created_at', 'desc');

            if ($request->filled('status')) {
                $query->where('status', $request->status);
            }

            $orders = $query->get();
            return response()->json($orders);
        } catch (\Exception $e) {
            Log::error('OrderController@adminIndex: Failed to fetch orders', ['error' => $e->getMessage()]);
            return response()->json(['error' => 'An unexpected error occurred while fetching orders.'], 500);
        }
    }

    /**
     * PUT /api/admin/orders/{id}
     * Admin updates order status.
     */
    public function adminUpdate(Request $request, $id)
    {
        try {
            $order = Order::find($id);

            if (!$order) {
                return response()->json(['error' => 'Order not found.'], 404);
            }

            $validated = $request->validate([
                'status'        => 'sometimes|in:pending,confirmed,processing,completed,cancelled',
                'paymentStatus' => 'sometimes|in:unpaid,paid',
                'notes'         => 'nullable|string|max:1000',
            ]);

            $oldStatus = $order->status;
            $order->update($validated);

            // Handle completion: Create sales records and deduct inventory
            if ($order->status === 'completed' && $oldStatus !== 'completed') {
                $this->completeOrder($order);
            }

            return response()->json(['message' => 'Order updated.', 'order' => $order]);
        } catch (\Illuminate\Validation\ValidationException $e) {
            return response()->json(['errors' => $e->errors()], 422);
        } catch (\Exception $e) {
            Log::error('OrderController@adminUpdate: Failed to update order ' . $id, ['error' => $e->getMessage()]);
            return response()->json(['error' => 'An unexpected error occurred while updating the order.'], 500);
        }
    }

    /**
     * Processes completion of an order: creates sales and deducts stock.
     */
    private function completeOrder(Order $order): void
    {
        try {
            foreach ($order->items as $item) {
                $product = Product::find($item['productId']);
                if (!$product || !$product->inventoryId) continue;

                $inventory = Inventory::find($product->inventoryId);
                if (!$inventory) continue;

                // 1. Create Sale Record
                // Generate Sale ID (same logic as SaleController)
                $newSaleId = DB::connection('mongodb')->transaction(function() {
                    $lastSale = Sale::orderBy('saleId', 'desc')->first();
                    $lastNumber = $lastSale ? intval(substr($lastSale->saleId, 5)) : 0;
                    return 'SALE-' . str_pad($lastNumber + 1, 3, '0', STR_PAD_LEFT);
                });

                $cost = $inventory->averageCost * $item['qty'];
                $profit = $item['lineTotal'] - $cost;

                Sale::create([
                    'saleId'          => $newSaleId,
                    'inventoryId'     => (string) $inventory->_id,
                    'productName'     => $product->name . ($item['variantName'] ? " ({$item['variantName']})" : ""),
                    'category'        => $product->category,
                    'quantity'        => $item['qty'],
                    'unitPrice'       => $item['unitPrice'],
                    'totalPrice'      => $item['lineTotal'],
                    'cost'            => $cost,
                    'profit'          => $profit,
                    'saleDate'        => now(),
                    'customerName'    => $order->userSnapshot['name'] ?? 'Online Customer',
                    'customerEmail'   => $order->userSnapshot['email'] ?? null,
                    'source'          => 'online',
                    'status'          => 'completed',
                    'notes'           => "From Order: " . ($order->orderId ?? $order->_id),
                    'createdAt'       => now(),
                ]);

                // 2. Deduct Inventory (only if not Upon Order)
                if (!$inventory->isOnDemand) {
                    $inventory->stockQty = max(0, $inventory->stockQty - $item['qty']);
                    $inventory->save();

                    // Log to StockHistory (optional but recommended)
                    \App\Models\StockHistory::create([
                        'inventoryId'  => (string) $inventory->_id,
                        'quantity'     => $item['qty'],
                        'remainingQty' => $inventory->stockQty,
                        'unitCost'     => $inventory->averageCost,
                        'totalCost'    => $cost,
                        'reason'       => 'sale',
                        'createdAt'    => now(),
                    ]);
                }
            }
        } catch (\Exception $e) {
            Log::error('OrderController@completeOrder: Failed for order ' . $order->_id, ['error' => $e->getMessage()]);
            // We don't throw exception here to avoid failing the order update,
            // but we log it for manual intervention.
        }
    }

    // ─── Private Helpers ──────────────────────────────────────────────────────

    /**
     * Resolves unit price from product's price settings.
     * Checks variantPrices, priceTiers, price, and flatPrice in order.
     */
    private function resolvePrice(Product $product, int $qty, ?string $variantId = null): ?float
    {
        // 1. Check Variant Prices if variantId is provided
        if ($variantId && !empty($product->variantPrices)) {
            if (isset($product->variantPrices[$variantId])) {
                return (float) $product->variantPrices[$variantId];
            }
        }

        // 2. Check Price Tiers
        $tiers = $product->priceTiers ?? [];
        if (!empty($tiers)) {
            // Sort ascending by minQty
            usort($tiers, fn($a, $b) => ($a['minQty'] ?? 0) <=> ($b['minQty'] ?? 0));

            $matchedPrice = null;
            foreach ($tiers as $tier) {
                $min = (int) ($tier['minQty'] ?? 1);
                $max = isset($tier['maxQty']) ? (int) $tier['maxQty'] : PHP_INT_MAX;

                if ($qty >= $min && $qty <= $max) {
                    $matchedPrice = (float) $tier['price'];
                    break;
                }
            }

            // If qty exceeds all tiers, use the last tier's price
            if ($matchedPrice === null && !empty($tiers)) {
                $lastTier = end($tiers);
                $matchedPrice = (float) $lastTier['price'];
            }

            if ($matchedPrice !== null) return $matchedPrice;
        }

        // 3. Fallback to single price or flat price
        if ($product->price !== null) {
            return (float) $product->price;
        }

        if ($product->flatPrice !== null) {
            return (float) $product->flatPrice;
        }

        return null;
    }

    /**
     * Sends an email notification to the store owner when a new order is placed.
     */
    private function notifyOwner(Order $order): void
    {
        try {
            $ownerEmail = env('ADMIN_EMAIL');
            if (!$ownerEmail) return;

            $itemLines = collect($order->items)->map(function ($item) {
                $variant = $item['variantName'] ? " ({$item['variantName']})" : '';
                return "• {$item['productName']}{$variant} x{$item['qty']} @ ₱{$item['unitPrice']} = ₱{$item['lineTotal']}";
            })->implode("\n");

            $body = "New order received!\n\n"
                  . "Customer: {$order->userSnapshot['name']}\n"
                  . "Email: {$order->userSnapshot['email']}\n"
                  . "Phone: {$order->userSnapshot['phone']}\n\n"
                  . "Items:\n{$itemLines}\n\n"
                  . "Total: ₱{$order->totalAmount}\n"
                  . "Notes: " . ($order->notes ?: 'None') . "\n\n"
                  . "Order ID: {$order->_id}";

            Mail::raw($body, function ($message) use ($ownerEmail, $order) {
                $message->to($ownerEmail)
                        ->subject("New Order #{$order->_id} — PersonalizeMe");
            });
        } catch (\Exception $e) {
            // Don't fail the order if email fails
            Log::error('OrderController@notifyOwner: ' . $e->getMessage());
        }
    }
}