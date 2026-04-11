<?php

namespace App\Http\Controllers;

use App\Mail\AdminNewOrderMail;
use App\Mail\OrderConfirmationMail;
use App\Mail\OrderStatusMail;
use App\Models\Order;
use App\Models\Product;
use App\Models\User;
use App\Models\Sale;
use App\Models\Inventory;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Storage;
use App\Models\ActivityLog;
use App\Models\Notification;

class OrderController extends Controller
{
    // ─── Helpers ──────────────────────────────────────────────────────────────

    /**
     * Resolves the authenticated user from Bearer token.
     */
    private function getAuthUser(Request $request): ?User
    {
        return $request->user();
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
                return $this->unauthorizedResponse();
            }

            $validated = $request->validate([
                'items'                       => 'required|array|min:1',
                'items.*.productId'           => 'required|string',
                'items.*.variantId'           => 'nullable|string',
                'items.*.variantName'         => 'nullable|string',
                'items.*.qty'                 => 'required|integer|min:1',
                'notes'                       => 'nullable|string|max:1000',
                'paymentMethod'               => 'nullable|string|in:cod,online',
                'deliveryAddress'             => 'nullable|array',
                'deliveryAddress.label'       => 'nullable|string|max:100',
                'deliveryAddress.house_number'=> 'nullable|string|max:100',
                'deliveryAddress.street'      => 'nullable|string|max:255',
                'deliveryAddress.subdivision' => 'nullable|string|max:255',
                'deliveryAddress.barangay'    => 'nullable|string|max:255',
                'deliveryAddress.city'        => 'nullable|string|max:255',
                'deliveryAddress.province'    => 'nullable|string|max:255',
                'deliveryAddress.zip'         => 'nullable|string|max:10',
                'deliveryAddress.phone'       => 'nullable|string|max:30',
                'design_file'                 => 'nullable|file|mimes:jpeg,jpg,png,webp,pdf|max:10240',
                'design_notes'                => 'nullable|string|max:2000',
            ]);

            // Build order items with pricing (no transaction wrapper for MongoDB compatibility)
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

            // Handle design file upload (non-fatal)
            $designFilePath = null;
            if ($request->hasFile('design_file') && $request->file('design_file')->isValid()) {
                try {
                    $designFilePath = $request->file('design_file')
                        ->store('designs', 'public');
                } catch (\Exception $fileErr) {
                    Log::warning('OrderController@store: design file upload failed', [
                        'error'  => $fileErr->getMessage(),
                        'userId' => (string) $user->_id,
                    ]);
                }
            }

            $paymentMethod = $validated['paymentMethod'] ?? 'cod';

            $order = Order::create([
                'userId'          => (string) $user->_id,
                'userSnapshot'    => [
                    'name'  => trim("{$user->firstName} {$user->lastName}"),
                    'email' => $user->email,
                    'phone' => $user->phoneNumber,
                ],
                'items'           => $orderItems,
                'totalAmount'     => $totalAmount,
                'orderStatus'     => 'Pending',
                'paymentStatus'   => 'unpaid',
                'paymentMethod'   => $paymentMethod,
                'notes'           => strip_tags($validated['notes'] ?? ''),
                'deliveryAddress' => $validated['deliveryAddress'] ?? null,
                'designNotes'     => $validated['design_notes'] ?? null,
                'designFilePath'  => $designFilePath,
                'designStatus'    => $designFilePath ? 'pending_review' : null,
                'createdAt'       => now(),
                'updatedAt'       => now(),
            ]);

            // Notify owner
            $this->notifyOwner($order);

            // Notify customer — order confirmation
            try {
                $customerEmail = $order->userSnapshot['email'] ?? null;
                $customerName  = $order->userSnapshot['name'] ?? '';
                $firstName     = explode(' ', trim($customerName))[0] ?? 'Customer';
                if ($customerEmail) {
                    Mail::to($customerEmail)->send(new OrderConfirmationMail(
                        firstName:   $firstName,
                        orderId:     (string) $order->_id,
                        items:       $order->items ?? [],
                        totalAmount: (float) ($order->totalAmount ?? 0),
                        status:      $order->orderStatus ?? 'Pending',
                        notes:       $order->notes ?? ''
                    ));
                }
            } catch (\Exception $e) {
                Log::error('OrderController @store: Failed to send confirmation email', [
                    'order_id' => (string) $order->_id,
                    'error'    => $e->getMessage(),
                ]);
            }

            return $this->successResponse('Order placed successfully!', $order, 201);

        } catch (\Illuminate\Validation\ValidationException $e) {
            return $this->validationErrorResponse($e);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'An unexpected error occurred while placing your order.');
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
                return $this->unauthorizedResponse();
            }

            $orders = Order::where('userId', (string) $user->_id)
                           ->orderBy('createdAt', 'desc')
                           ->get();

            return $this->successResponse('Orders fetched successfully.', $orders);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'An unexpected error occurred while fetching your orders.');
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
                return $this->unauthorizedResponse();
            }

            $order = Order::where('_id', $id)
                          ->where('userId', (string) $user->_id)
                          ->first();

            if (!$order) {
                return $this->notFoundResponse('Order');
            }

            return $this->successResponse('Order fetched successfully.', $order);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'An unexpected error occurred while fetching your order.');
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
            if (!$this->isAdmin($request)) {
                return $this->unauthorizedResponse();
            }

            $query = Order::orderBy('createdAt', 'desc');

            if ($request->filled('orderStatus')) {
                $query->where('orderStatus', $request->orderStatus);
            }

            $orders = $query->get();
            return $this->successResponse('Orders fetched successfully.', $orders);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'An unexpected error occurred while fetching orders.');
        }
    }

    /**
     * PUT /api/admin/orders/{id}
     * Admin updates order status.
     */
    public function adminUpdate(Request $request, $id)
    {
        try {
            if (!$this->isAdmin($request)) {
                return $this->unauthorizedResponse();
            }

            $order = Order::find($id);

            if (!$order) {
                return $this->notFoundResponse('Order');
            }

            $validated = $request->validate([
                'orderStatus'   => 'sometimes|in:Pending,In Production,For Delivery,Delivered,Returned,Cancelled',
                'paymentStatus' => 'sometimes|in:unpaid,paid',
                'notes'         => 'nullable|string|max:1000',
            ]);

            $oldStatus = $order->orderStatus;
            $order->update($validated);

            // Log activity if status changed
            if (isset($validated['orderStatus']) && $oldStatus !== $order->orderStatus) {
                try {
                    $adminUser = $request->user();
                    ActivityLog::create([
                        'action'           => 'order_status_changed',
                        'entityType'       => 'order',
                        'entityId'         => (string) $order->_id,
                        'description'      => "Order status changed from {$oldStatus} to {$order->orderStatus}",
                        'performedBy'      => $adminUser
                            ? trim("{$adminUser->firstName} {$adminUser->lastName}")
                            : 'admin',
                        'performedByEmail' => $adminUser->email ?? null,
                        'metadata'         => [
                            'oldStatus' => $oldStatus,
                            'newStatus' => $order->orderStatus,
                            'orderId'   => (string) $order->_id,
                        ],
                        'createdAt'        => now(),
                    ]);
                } catch (\Exception $logErr) {
                    Log::warning('ActivityLog write failed (adminUpdate)', [
                        'error' => $logErr->getMessage(),
                    ]);
                }
            }

            // Handle completion: Create sales records and deduct inventory
            if ($order->orderStatus === 'Delivered' && $oldStatus !== 'Delivered') {
                $this->completeOrder($order);
            }

            // Notify customer if status changed
            if (isset($validated['orderStatus']) && $oldStatus !== $order->orderStatus) {
                try {
                    $customerEmail = $order->userSnapshot['email']
                        ?? optional(User::find($order->userId))->email
                        ?? null;
                    $customerName  = $order->userSnapshot['name'] ?? '';
                    $firstName     = explode(' ', trim($customerName))[0] ?? 'Customer';
                    if ($customerEmail) {
                        Mail::to($customerEmail)->send(new OrderStatusMail(
                            firstName:   $firstName,
                            orderId:     (string) $order->_id,
                            newStatus:   $order->orderStatus,
                            totalAmount: (float) ($order->totalAmount ?? 0)
                        ));
                    }
                } catch (\Exception $e) {
                    Log::error('OrderController @adminUpdate: Failed to send status email', [
                        'order_id' => (string) $order->_id,
                        'error'    => $e->getMessage(),
                    ]);
                }
            }

            return $this->successResponse('Order updated successfully.', $order);
        } catch (\Illuminate\Validation\ValidationException $e) {
            return $this->validationErrorResponse($e);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'An unexpected error occurred while updating the order.');
        }
    }

    /**
     * GET /api/admin/orders/stats
     * Returns order statistics for the admin dashboard.
     */
    public function stats(Request $request)
    {
        try {
            $totalOrders = Order::count();
            $pendingOrders = Order::where('orderStatus', 'Pending')->count();
            $completedOrders = Order::where('orderStatus', 'Delivered')->count();
            $cancelledOrders = Order::where('orderStatus', 'Cancelled')->count();
            $totalRevenue = Order::where('orderStatus', 'Delivered')->sum('totalAmount');

            return $this->successResponse('Order statistics fetched successfully.', [
                'totalOrders' => $totalOrders,
                'pendingOrders' => $pendingOrders,
                'completedOrders' => $completedOrders,
                'cancelledOrders' => $cancelledOrders,
                'totalRevenue' => $totalRevenue,
            ]);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'An unexpected error occurred while fetching order statistics.');
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
                // Generate UUID-based Sale ID — collision-free, no DB read required
                $newSaleId = 'SALE-' . strtoupper(substr(str_replace('-', '',
                    \Illuminate\Support\Str::uuid()->toString()), 0, 8));

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

    // ─── Admin API Endpoints (New Schema) ─────────────────────────────────────

    /**
     * GET /api/orders
     * Returns all orders for admin dashboard (new schema).
     */
    public function index(Request $request)
    {
        try {
            $user = $request->user();

            if (!$user) {
                return response()->json(['error' => 'Unauthorized'], 401);
            }

            if ($user->role !== 'admin' && $user->role !== 'owner') {
                return response()->json(['error' => 'Forbidden'], 403);
            }

            $orders = Order::orderBy('createdAt', 'desc')->get();

            return response()->json(['orders' => $orders]);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'An unexpected error occurred while fetching orders.');
        }
    }

    /**
     * GET /api/orders/{id}
     * Returns a single order by ID (new schema).
     */
    public function show(Request $request, $id)
    {
        try {
            $user = $request->user();

            if (!$user) {
                return response()->json(['error' => 'Unauthorized'], 401);
            }

            if ($user->role !== 'admin' && $user->role !== 'owner') {
                return response()->json(['error' => 'Forbidden'], 403);
            }

            $order = Order::find($id);

            if (!$order) {
                return response()->json(['error' => 'Order not found'], 404);
            }

            return response()->json(['order' => $order]);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'An unexpected error occurred while fetching the order.');
        }
    }

    /**
     * PATCH /api/orders/{id}/status
     * Admin updates order status only.
     */
    public function updateStatus(Request $request, $id)
    {
        try {
            $user = $request->user();

            if (!$user) {
                return response()->json(['error' => 'Unauthorized'], 401);
            }

            if ($user->role !== 'admin' && $user->role !== 'owner') {
                return response()->json(['error' => 'Forbidden'], 403);
            }

            $validated = $request->validate([
                'orderStatus' => 'required|in:Pending,In Production,For Delivery,Delivered,Returned,Cancelled',
            ]);

            $order = Order::find($id);

            if (!$order) {
                return response()->json(['error' => 'Order not found'], 404);
            }

            $oldStatus = $order->orderStatus;
            $order->orderStatus = $validated['orderStatus'];
            $order->updatedAt = now();
            $order->save();

            // Log activity
            try {
                ActivityLog::create([
                    'action'           => 'order_status_changed',
                    'entityType'       => 'order',
                    'entityId'         => (string) $order->_id,
                    'description'      => "Order status changed from {$oldStatus} to {$order->orderStatus}",
                    'performedBy'      => $user->firstName . ' ' . $user->lastName,
                    'performedByEmail' => $user->email ?? null,
                    'metadata'         => [
                        'oldStatus' => $oldStatus,
                        'newStatus' => $order->orderStatus,
                        'orderId'   => (string) $order->_id,
                    ],
                    'createdAt'        => now(),
                ]);
            } catch (\Exception $logErr) {
                Log::warning('ActivityLog write failed (updateStatus)', [
                    'error' => $logErr->getMessage(),
                ]);
            }

            // Notify customer on status change
            if ($oldStatus !== $order->orderStatus) {
                try {
                    $customerEmail = $order->userSnapshot['email']
                        ?? optional(User::find($order->userId))->email
                        ?? null;
                    $customerName  = $order->userSnapshot['name'] ?? '';
                    $firstName     = explode(' ', trim($customerName))[0] ?? 'Customer';
                    if ($customerEmail) {
                        Mail::to($customerEmail)->send(new OrderStatusMail(
                            firstName:   $firstName,
                            orderId:     (string) $order->_id,
                            newStatus:   $order->orderStatus,
                            totalAmount: (float) ($order->totalAmount ?? 0)
                        ));
                    }
                } catch (\Exception $e) {
                    Log::error('OrderController @updateStatus: Failed to send status email', [
                        'order_id' => (string) $order->_id,
                        'error'    => $e->getMessage(),
                    ]);
                }
            }

            return response()->json([
                'message' => 'Status updated',
                'order'   => $order,
            ]);
        } catch (\Illuminate\Validation\ValidationException $e) {
            return $this->validationErrorResponse($e);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'An unexpected error occurred while updating the order status.');
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
     * Sends a branded email to the store owner when a new order is placed.
     */
    private function notifyOwner(Order $order): void
    {
        try {
            $ownerEmail = env('ADMIN_EMAIL');
            if (!$ownerEmail) return;

            Mail::to($ownerEmail)->send(new AdminNewOrderMail(
                orderId:       (string) $order->_id,
                customerName:  $order->userSnapshot['name']  ?? 'Unknown',
                customerEmail: $order->userSnapshot['email'] ?? '',
                customerPhone: $order->userSnapshot['phone'] ?? '',
                items:         $order->items ?? [],
                totalAmount:   (float) ($order->totalAmount ?? 0),
                notes:         $order->notes ?? ''
            ));
        } catch (\Exception $e) {
            Log::error('OrderController@notifyOwner: ' . $e->getMessage());
        }
    }

    /**
     * POST /api/admin/orders/{id}/approve-design
     * Owner approves the customer's uploaded design.
     */
    public function approveDesign(Request $request, $id)
    {
        try {
            $user = $request->user();
            if (!$user || !in_array($user->role, ['admin', 'owner'])) {
                return $this->unauthorizedResponse();
            }

            $order = Order::find($id);
            if (!$order) {
                return $this->notFoundResponse('Order');
            }

            if (!$order->designFilePath && !$order->designNotes) {
                return $this->errorResponse('This order has no design to approve.', 422);
            }

            $order->designStatus = 'approved';
            $order->updatedAt    = now();
            $order->save();

            // Notify customer
            try {
                Notification::create([
                    'user_id'    => (string) $order->userId,
                    'type'       => 'design_approved',
                    'title'      => 'Design Approved!',
                    'message'    => 'Your design for order #' .
                        strtoupper(substr((string) $order->_id, -8)) .
                        ' has been approved. We\'ll begin production shortly.',
                    'is_read'    => false,
                    'data'       => [
                        'orderId'      => (string) $order->_id,
                        'designStatus' => 'approved',
                    ],
                    'created_at' => now(),
                ]);
            } catch (\Exception $notifErr) {
                Log::warning('approveDesign: notification failed', [
                    'error' => $notifErr->getMessage(),
                ]);
            }

            // Log activity
            try {
                ActivityLog::create([
                    'action'           => 'design_approved',
                    'entityType'       => 'order',
                    'entityId'         => (string) $order->_id,
                    'description'      => 'Design approved for order #' .
                        strtoupper(substr((string) $order->_id, -8)),
                    'performedBy'      => trim("{$user->firstName} {$user->lastName}"),
                    'performedByEmail' => $user->email ?? null,
                    'metadata'         => ['orderId' => (string) $order->_id],
                    'createdAt'        => now(),
                ]);
            } catch (\Exception $logErr) {
                Log::warning('ActivityLog write failed (approveDesign)', [
                    'error' => $logErr->getMessage(),
                ]);
            }

            return $this->successResponse('Design approved.', $order);

        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'Failed to approve design.');
        }
    }

    /**
     * POST /api/admin/orders/{id}/reject-design
     * Owner rejects the customer's uploaded design.
     */
    public function rejectDesign(Request $request, $id)
    {
        try {
            $user = $request->user();
            if (!$user || !in_array($user->role, ['admin', 'owner'])) {
                return $this->unauthorizedResponse();
            }

            $validated = $request->validate([
                'reason' => 'nullable|string|max:500',
            ]);

            $order = Order::find($id);
            if (!$order) {
                return $this->notFoundResponse('Order');
            }

            if (!$order->designFilePath && !$order->designNotes) {
                return $this->errorResponse('This order has no design to reject.', 422);
            }

            $order->designStatus = 'rejected';
            $order->updatedAt    = now();
            $order->save();

            $reason = $validated['reason'] ?? null;

            // Notify customer
            try {
                $message = 'Your design for order #' .
                    strtoupper(substr((string) $order->_id, -8)) .
                    ' needs revision.';
                if ($reason) {
                    $message .= ' Reason: ' . $reason;
                }
                Notification::create([
                    'user_id'    => (string) $order->userId,
                    'type'       => 'design_rejected',
                    'title'      => 'Design Needs Revision',
                    'message'    => $message,
                    'is_read'    => false,
                    'data'       => [
                        'orderId'      => (string) $order->_id,
                        'designStatus' => 'rejected',
                        'reason'       => $reason,
                    ],
                    'created_at' => now(),
                ]);
            } catch (\Exception $notifErr) {
                Log::warning('rejectDesign: notification failed', [
                    'error' => $notifErr->getMessage(),
                ]);
            }

            // Log activity
            try {
                ActivityLog::create([
                    'action'           => 'design_rejected',
                    'entityType'       => 'order',
                    'entityId'         => (string) $order->_id,
                    'description'      => 'Design rejected for order #' .
                        strtoupper(substr((string) $order->_id, -8)) .
                        ($reason ? '. Reason: ' . $reason : ''),
                    'performedBy'      => trim("{$user->firstName} {$user->lastName}"),
                    'performedByEmail' => $user->email ?? null,
                    'metadata'         => [
                        'orderId' => (string) $order->_id,
                        'reason'  => $reason,
                    ],
                    'createdAt'        => now(),
                ]);
            } catch (\Exception $logErr) {
                Log::warning('ActivityLog write failed (rejectDesign)', [
                    'error' => $logErr->getMessage(),
                ]);
            }

            return $this->successResponse('Design rejected.', $order);

        } catch (\Illuminate\Validation\ValidationException $e) {
            return $this->validationErrorResponse($e);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'Failed to reject design.');
        }
    }

    /**
     * POST /api/orders/my/{id}/cancel
     * Customer cancels their own order — only allowed when Pending.
     */
    public function cancelMyOrder(Request $request, $id)
    {
        try {
            $user = $this->getAuthUser($request);
            if (!$user) {
                return $this->unauthorizedResponse();
            }

            $order = Order::where('_id', $id)
                          ->where('userId', (string) $user->_id)
                          ->first();

            if (!$order) {
                return $this->notFoundResponse('Order');
            }

            if ($order->orderStatus !== 'Pending') {
                return $this->errorResponse(
                    'This order can no longer be cancelled. Only Pending orders can be cancelled.',
                    422
                );
            }

            $order->orderStatus = 'Cancelled';
            $order->updatedAt   = now();
            $order->save();

            // Email notification to customer
            try {
                $customerEmail = $order->userSnapshot['email'] ?? null;
                $customerName  = $order->userSnapshot['name'] ?? '';
                $firstName     = explode(' ', trim($customerName))[0] ?? 'Customer';
                if ($customerEmail) {
                    Mail::to($customerEmail)->send(new OrderStatusMail(
                        firstName:   $firstName,
                        orderId:     (string) $order->_id,
                        newStatus:   'Cancelled',
                        totalAmount: (float) ($order->totalAmount ?? 0)
                    ));
                }
            } catch (\Exception $e) {
                Log::error('cancelMyOrder: Failed to send cancellation email', [
                    'order_id' => (string) $order->_id,
                    'error'    => $e->getMessage(),
                ]);
            }

            // In-app notification to customer
            try {
                Notification::create([
                    'user_id'    => (string) $order->userId,
                    'type'       => 'order_cancelled',
                    'title'      => 'Order Cancelled',
                    'message'    => 'Your order #' .
                        strtoupper(substr((string) $order->_id, -8)) .
                        ' has been cancelled.',
                    'is_read'    => false,
                    'data'       => ['orderId' => (string) $order->_id],
                    'created_at' => now(),
                ]);
            } catch (\Exception $e) {
                Log::warning('cancelMyOrder: notification failed', [
                    'error' => $e->getMessage(),
                ]);
            }

            // Activity log
            try {
                ActivityLog::create([
                    'action'           => 'order_cancelled_by_customer',
                    'entityType'       => 'order',
                    'entityId'         => (string) $order->_id,
                    'description'      => 'Order cancelled by customer.',
                    'performedBy'      => trim("{$user->firstName} {$user->lastName}"),
                    'performedByEmail' => $user->email ?? null,
                    'metadata'         => ['orderId' => (string) $order->_id],
                    'createdAt'        => now(),
                ]);
            } catch (\Exception $logErr) {
                Log::warning('ActivityLog write failed (cancelMyOrder)', [
                    'error' => $logErr->getMessage(),
                ]);
            }

            return $this->successResponse('Order cancelled successfully.', $order);

        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'Failed to cancel order.');
        }
    }
}