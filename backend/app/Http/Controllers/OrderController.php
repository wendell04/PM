<?php

namespace App\Http\Controllers;

use App\Models\Order;
use App\Models\Product;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;

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

            // Build order items with pricing
            $orderItems   = [];
            $totalAmount  = 0;

            foreach ($validated['items'] as $item) {
                $product = Product::where('_id', $item['productId'])
                                  ->where('isActive', true)
                                  ->first();

                if (!$product) {
                    return response()->json([
                        'error' => "Product '{$item['productId']}' not found or unavailable."
                    ], 422);
                }

                // Resolve unit price from priceTiers or flatPrice
                $qty       = (int) $item['qty'];
                $unitPrice = $this->resolvePrice($product, $qty);

                if ($unitPrice === null) {
                    return response()->json([
                        'error' => "No price configured for product '{$product->name}'."
                    ], 422);
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
                'notes'        => $validated['notes'] ?? '',
            ]);

            // Notify owner via email
            $this->notifyOwner($order);

            return response()->json([
                'message' => 'Order placed successfully!',
                'order'   => $order,
            ], 201);

        } catch (\Illuminate\Validation\ValidationException $e) {
            return response()->json(['errors' => $e->errors()], 422);
        } catch (\Exception $e) {
            Log::error('OrderController@store: ' . $e->getMessage());
            return response()->json(['error' => 'Failed to place order.'], 500);
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
            Log::error('OrderController@myOrders: ' . $e->getMessage());
            return response()->json(['error' => 'Failed to fetch orders.'], 500);
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
            Log::error('OrderController@myOrderShow: ' . $e->getMessage());
            return response()->json(['error' => 'Failed to fetch order.'], 500);
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
            Log::error('OrderController@adminIndex: ' . $e->getMessage());
            return response()->json(['error' => 'Failed to fetch orders.'], 500);
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

            $order->update($validated);

            return response()->json(['message' => 'Order updated.', 'order' => $order]);
        } catch (\Illuminate\Validation\ValidationException $e) {
            return response()->json(['errors' => $e->errors()], 422);
        } catch (\Exception $e) {
            Log::error('OrderController@adminUpdate: ' . $e->getMessage());
            return response()->json(['error' => 'Failed to update order.'], 500);
        }
    }

    // ─── Private Helpers ──────────────────────────────────────────────────────

    /**
     * Resolves unit price from product's priceTiers for a given qty,
     * falling back to flatPrice.
     */
    private function resolvePrice(Product $product, int $qty): ?float
    {
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
                $matchedPrice = (float) end($tiers)['price'];
            }

            if ($matchedPrice !== null) return $matchedPrice;
        }

        // Fallback to flat price
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