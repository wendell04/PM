<?php

namespace App\Http\Controllers;

use App\Events\OrderStatusUpdated;
use App\Mail\AdminNewOrderMail;
use App\Mail\OrderConfirmationMail;
use App\Mail\OrderStatusMail;
use App\Models\Order;
use App\Models\Product;
use App\Models\User;
use App\Models\Sale;
use App\Models\Inventory;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Storage;
use App\Models\ActivityLog;
use App\Models\Notification;
use App\Models\Voucher;
use App\Models\FlashSale;
use App\Models\BillOfMaterial;
use Illuminate\Support\Facades\DB;
use App\Models\StockHistory;
use App\Services\PriceResolver;

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
                'items.*.flashSaleId'         => 'nullable|string|max:24',
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
                'voucherCode'                 => 'nullable|string|max:50',
                'shippingFee'                 => 'nullable|numeric|min:0|max:10000',
            ]);

            // Build order items with pricing (no transaction wrapper for MongoDB compatibility)
            $orderItems               = [];
            $totalAmount              = 0;
            $pendingFlashSaleIncrements = [];

            foreach ($validated['items'] as $item) {
                $product = Product::where('_id', $item['productId'])
                                  ->where('isActive', true)
                                  ->first();

                if (!$product) {
                    throw new \Exception("Product '{$item['productId']}' not found or unavailable.");
                }

                $qty              = (int) $item['qty'];
                $variantId        = $item['variantId'] ?? null;
                $flashSaleId      = isset($item['flashSaleId']) && $item['flashSaleId'] !== '' ? $item['flashSaleId'] : null;
                $appliedFlashSale = null;

                if ($flashSaleId) {
                    $fs = FlashSale::live()
                        ->where('_id', $flashSaleId)
                        ->where('productId', (string) $product->_id)
                        ->first();

                    if ($fs && (
                        $fs->stockLimit === null ||
                        ($fs->stockUsed ?? 0) < $fs->stockLimit
                    )) {
                        $appliedFlashSale = $fs;
                    }
                }

                $unitPrice = PriceResolver::resolve($product, $qty, $variantId, $appliedFlashSale);

                if ($unitPrice === null) {
                    throw new \Exception("No price configured for product '{$product->name}'.");
                }

                $lineTotal    = $unitPrice * $qty;
                $totalAmount += $lineTotal;

                if ($appliedFlashSale) {
                    $pendingFlashSaleIncrements[] = [$appliedFlashSale, $qty];
                }

                $orderItems[] = [
                    'productId'   => (string) $product->_id,
                    'productName' => $product->name,
                    'variantId'   => $item['variantId']   ?? null,
                    'variantName' => $item['variantName'] ?? null,
                    'qty'         => $qty,
                    'unitPrice'   => $unitPrice,
                    'lineTotal'   => $lineTotal,
                    'flashSaleId' => $flashSaleId,
                ];
            }

            // Add shipping fee to total
            $shippingFee  = (float) ($validated['shippingFee'] ?? 0);
            $totalAmount += $shippingFee;

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

            // ── Voucher discount — atomic claim ───────────────────────────
            $discountAmount = 0.0;
            $appliedVoucher = null;

            if (!empty($validated['voucherCode'])) {
                $voucherCode = strtoupper(trim($validated['voucherCode']));
                $userId      = (string) $user->_id;
                $now         = now();

                $voucher = Voucher::where('code', $voucherCode)->first();

                $preValid = $voucher
                    && $voucher->isActive
                    && (!$voucher->expiresAt || $voucher->expiresAt >= $now)
                    && ($voucher->maxUses === null || $voucher->usedCount < $voucher->maxUses)
                    && !in_array($userId, $voucher->usedBy ?? [], true)
                    && ($voucher->minOrderAmount === null || $totalAmount >= $voucher->minOrderAmount);

                if ($preValid) {
                    $discountAmount = $voucher->discountType === 'percentage'
                        ? round($totalAmount * $voucher->discountValue / 100, 2)
                        : min((float) $voucher->discountValue, $totalAmount);

                    $filter = [
                        'code'     => $voucherCode,
                        'isActive' => true,
                        'usedBy'   => ['$nin' => [$userId]],
                    ];
                    if ($voucher->maxUses !== null) {
                        $filter['$expr'] = ['$lt' => ['$usedCount', '$maxUses']];
                    }

                    $claimed = DB::connection('mongodb')
                        ->getCollection('vouchers')
                        ->findOneAndUpdate(
                            $filter,
                            [
                                '$inc'      => ['usedCount' => 1],
                                '$addToSet' => ['usedBy' => $userId],
                            ],
                            ['returnDocument' => \MongoDB\Operation\FindOneAndUpdate::RETURN_DOCUMENT_AFTER]
                        );

                    if ($claimed) {
                        $totalAmount    = max(0, $totalAmount - $discountAmount);
                        $appliedVoucher = $voucher;
                    } else {
                        $discountAmount = 0.0;
                    }
                }
            }

            $order = Order::create([
                'userId'          => (string) $user->_id,
                'userSnapshot'    => [
                    'name'  => trim("{$user->firstName} {$user->lastName}"),
                    'email' => $user->email,
                    'phone' => $user->phoneNumber,
                ],
                'items'           => $orderItems,
                'totalAmount'     => $totalAmount,
                'shippingFee'     => $shippingFee,
                'discountAmount'  => $discountAmount > 0 ? $discountAmount : null,
                'voucherCode'     => $appliedVoucher?->code ?? null,
                'orderStatus'     => 'Pending',
                'paymentStatus'   => 'unpaid',
                'paymentMethod'   => $paymentMethod,
                'notes'           => htmlspecialchars(strip_tags(trim($validated['notes'] ?? '')), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'),
                'deliveryAddress' => $validated['deliveryAddress'] ?? null,
                'designNotes'     => isset($validated['design_notes'])
                    ? htmlspecialchars(strip_tags(trim($validated['design_notes'])), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8')
                    : null,
                'designFilePath'  => $designFilePath,
                'designStatus'    => $designFilePath ? 'pending_review' : null,
                'statusHistory'   => [['status' => 'Pending', 'at' => now()->toISOString()]],
                'createdAt'       => now(),
                'updatedAt'       => now(),
            ]);

            // Deduct flash sale stock only after order is persisted
            foreach ($pendingFlashSaleIncrements as [$flashSale, $qty]) {
                $flashSale->increment('stockUsed', $qty);
            }

            // Broadcast new order to admin channel
            try {
                broadcast(new OrderStatusUpdated(
                    (string) $order->_id,
                    'pending',
                    null
                ));
            } catch (\Exception $e) {
                Log::warning('OrderController@store: broadcast failed', ['error' => $e->getMessage()]);
            }

            // Notify owner
            $this->notifyOwner($order);

            // In-app notification to admin — B-13
            try {
                $admin = \App\Models\User::where('role', 'admin')->first();
                if ($admin) {
                    Notification::create([
                        'user_id'    => (string) $admin->_id,
                        'type'       => 'new_order',
                        'title'      => 'New Order Received',
                        'message'    => 'Order #' . strtoupper(substr((string) $order->_id, -8)) .
                                        ' placed by ' . ($order->userSnapshot['name'] ?? 'Unknown') . '.',
                        'is_read'    => false,
                        'data'       => ['orderId' => (string) $order->_id],
                        'created_at' => now(),
                    ]);
                }
            } catch (\Exception $e) {
                Log::warning('store: admin notification failed', ['error' => $e->getMessage()]);
            }

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

            $limit  = min(100, max(1, (int) $request->query('limit', 50)));
            $page   = max(1, (int) $request->query('page', 1));
            $offset = ($page - 1) * $limit;

            $total  = Order::where('userId', (string) $user->_id)->count();
            $orders = Order::where('userId', (string) $user->_id)
                           ->orderBy('createdAt', 'desc')
                           ->skip($offset)
                           ->limit($limit)
                           ->get();

            return $this->successResponse('Orders fetched successfully.', [
                'data'       => $orders,
                'total'      => $total,
                'page'       => $page,
                'limit'      => $limit,
                'totalPages' => (int) ceil($total / $limit),
            ]);
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

            $query = Order::select($this->orderListFields())
                ->with(['jobOrder' => function ($q) {
                    $q->select([
                        '_id',
                        'orderId',
                        'joStatus',
                        'targetCompletion',
                        'assignedTo',
                        'isRush',
                    ]);
                }])
                ->orderBy('createdAt', 'desc');

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
     * MongoDB projection for admin/API order list responses (avoids loading unused fields).
     *
     * @return array<int, string>
     */
    private function orderListFields(): array
    {
        return [
            '_id',
            'orderId',
            'userId',
            'orderStatus',
            'paymentStatus',
            'customerName',
            'customer',
            'userSnapshot',
            'items',
            'subtotal',
            'shippingFee',
            'totalAmount',
            'total',
            'totalPrice',
            'downPayment',
            'balance',
            'paymentMethod',
            'paymentHistory',
            'notes',
            'joId',
            'joStatus',
            'isRush',
            'targetCompletion',
            'orderSource',
            'voucherCode',
            'discountAmount',
            'courierName',
            'trackingNumber',
            'createdAt',
            'updatedAt',
            'shippingAddress',
            'deliveryAddress',
            'designNotes',
            'designStatus',
            'designFilePath',
        ];
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

            // Enforce valid status transitions when orderStatus is being changed
            if (isset($validated['orderStatus']) && $validated['orderStatus'] !== $oldStatus) {
                $allowedTransitions = [
                    'Pending'       => ['In Production', 'Cancelled'],
                    'In Production' => ['For Delivery', 'Cancelled'],
                    'For Delivery'  => ['Delivered', 'Returned'],
                    'Delivered'     => [],
                    'Returned'      => [],
                    'Cancelled'     => [],
                ];

                $allowed = $allowedTransitions[$oldStatus] ?? [];
                if (!in_array($validated['orderStatus'], $allowed)) {
                    return response()->json([
                        'error' => "Invalid transition: cannot move from '{$oldStatus}' to '{$validated['orderStatus']}'.",
                    ], 422);
                }

                // Payment gate — same rule as updateStatus()
                if ($validated['orderStatus'] === 'In Production') {
                    $downPayment    = $order->downPayment ?? 0;
                    $paymentMethod  = $order->paymentMethod ?? '';
                    $paymentHistory = $order->paymentHistory ?? [];
                    $paymentStatus  = $order->paymentStatus ?? '';

                    $hasCodMethod  = $paymentMethod === 'cod';
                    $hasAnyPayment = $downPayment > 0 || count($paymentHistory) > 0 || $paymentStatus === 'paid';

                    if (!$hasCodMethod && !$hasAnyPayment) {
                        return response()->json([
                            'error' => 'A downpayment is required before moving this order to production. Please collect at least a partial payment first.',
                        ], 422);
                    }
                }

                // Courier gate — same rule as updateStatus()
                if ($validated['orderStatus'] === 'For Delivery') {
                    $courierValidated = $request->validate([
                        'courierName'    => 'required|string|max:100',
                        'trackingNumber' => 'nullable|string|max:200',
                    ]);
                    $order->courierName    = $courierValidated['courierName'];
                    $order->trackingNumber = $courierValidated['trackingNumber'] ?? null;
                }
            }

            $order->update($validated);

            // Handle cancellation: cancel linked JobOrder
            if (isset($validated['orderStatus']) && $order->orderStatus === 'Cancelled' && $oldStatus !== 'Cancelled') {
                $this->cancelLinkedJobOrder($order);
            }

            // Handle return: restore inventory
            if (isset($validated['orderStatus']) && $order->orderStatus === 'Returned' && $oldStatus !== 'Returned') {
                $this->restoreInventoryOnReturn($order);
            }

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
            if (!$this->isAdmin($request)) {
                return $this->unauthorizedResponse();
            }

            $cacheKey = 'admin_order_stats_' . md5($request->query->__toString());
            $data = Cache::remember($cacheKey, 30, function () use ($request) {
                $base = Order::query()
                    ->when($request->filled('startDate'), fn($q) => $q->where('createdAt', '>=', $request->startDate))
                    ->when($request->filled('endDate'),   fn($q) => $q->where('createdAt', '<=', $request->endDate));

                $totalOrders     = (clone $base)->count();
                $pendingOrders   = (clone $base)->where('orderStatus', 'Pending')->count();
                $completedOrders = (clone $base)->where('orderStatus', 'Delivered')->count();
                $cancelledOrders = (clone $base)->where('orderStatus', 'Cancelled')->count();
                $totalRevenue    = (clone $base)->where('orderStatus', 'Delivered')->sum('totalAmount');

                $cancellationRate = $totalOrders > 0
                    ? round(($cancelledOrders / $totalOrders) * 100, 2)
                    : 0;

                return [
                    'totalOrders'      => $totalOrders,
                    'pendingOrders'    => $pendingOrders,
                    'completedOrders'  => $completedOrders,
                    'cancelledOrders'  => $cancelledOrders,
                    'totalRevenue'     => $totalRevenue,
                    'cancellationRate' => $cancellationRate,
                ];
            });

            return $this->successResponse('Order statistics fetched successfully.', $data);
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
            // Idempotency guard — if sales already exist for this order, skip entirely
            $existingSale = Sale::where('notes', 'like', '%' . ($order->orderId ?? $order->_id) . '%')->first();
            if ($existingSale) {
                Log::warning('completeOrder: sales already exist for order, skipping to prevent duplication', [
                    'orderId' => (string) $order->_id,
                ]);
                return;
            }

            foreach ($order->items as $item) {
                $product = Product::find($item['productId']);
                if (!$product) continue;

                $inventory = null;
                if ($product->inventoryId) {
                    $inventory = Inventory::find($product->inventoryId);
                    if (!$inventory) {
                        Log::warning('completeOrder: inventory record not found for product', [
                            'orderId'     => $order->_id,
                            'productId'   => $item['productId'],
                            'inventoryId' => $product->inventoryId,
                        ]);
                    }
                }

                // 1. Always create Sale Record (even for custom products with no inventory)
                $newSaleId = 'SALE-' . strtoupper(substr(str_replace('-', '',
                    \Illuminate\Support\Str::uuid()->toString()), 0, 8));

                $cost        = $inventory ? (float) ($inventory->averageCost ?? 0) * $item['qty'] : 0.0;
                $profit      = $item['lineTotal'] - $cost;
                $variantName = $item['variantName'] ?? '';

                Sale::create([
                    'saleId'          => $newSaleId,
                    'inventoryId'     => $inventory ? (string) $inventory->_id : null,
                    'productName'     => $product->name . ($variantName ? " ({$variantName})" : ""),
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

                // 2. Deduct Inventory FIFO only if inventory exists and is not on-demand
                if ($inventory && !$inventory->isOnDemand) {
                    $this->deductInventoryFIFO(
                        inventory:    $inventory,
                        qty:          (int) $item['qty'],
                        reason:       'sale',
                        unitPrice:    (float) ($item['unitPrice'] ?? 0),
                        orderId:      (string) $order->_id,
                    );
                }

                // 3. Increment Flash Sale stockUsed (if item was part of a flash sale)
                if (!empty($item['flashSaleId'])) {
                    try {
                        $flashSale = FlashSale::find($item['flashSaleId']);
                        if ($flashSale && $flashSale->isActive) {
                            $flashSale->stockUsed = ($flashSale->stockUsed ?? 0) + $item['qty'];
                            if ($flashSale->stockLimit !== null &&
                                $flashSale->stockUsed >= $flashSale->stockLimit) {
                                $flashSale->isActive = false;
                            }
                            $flashSale->save();
                        }
                    } catch (\Exception $flashErr) {
                        Log::warning('completeOrder: failed to update flash sale stockUsed', [
                            'orderId'     => (string) $order->_id,
                            'flashSaleId' => $item['flashSaleId'],
                            'error'       => $flashErr->getMessage(),
                        ]);
                    }
                }

                // 4. Deduct BOM raw materials (if product has a linked BOM)
                if (!empty($product->bomId)) {
                    try {
                        $bom = BillOfMaterial::find($product->bomId);
                        if ($bom && !empty($bom->components)) {
                            foreach ($bom->components as $component) {
                                $rawInventory = Inventory::find($component['inventoryId']);
                                if (!$rawInventory || $rawInventory->isOnDemand) continue;
                                $deductQty = $component['qty'] * $item['qty'];
                                $this->deductInventoryFIFO(
                                    inventory:    $rawInventory,
                                    qty:          (int) $deductQty,
                                    reason:       'bom_deduction',
                                    unitPrice:    0.0,
                                    orderId:      (string) $order->_id,
                                );
                            }
                        }
                    } catch (\Exception $bomErr) {
                        Log::warning('completeOrder: failed to deduct BOM components', [
                            'orderId'   => (string) $order->_id,
                            'productId' => $item['productId'],
                            'bomId'     => (string) $product->bomId,
                            'error'     => $bomErr->getMessage(),
                        ]);
                    }
                }
            }
        } catch (\Exception $e) {
            Log::error('OrderController@completeOrder: Failed for order ' . $order->_id, ['error' => $e->getMessage()]);
            // We don't throw exception here to avoid failing the order update,
            // but we log it for manual intervention.
        }
    }

    /**
     * Deduct inventory via FIFO across batches.
     * Mirrors WalkInOrderController::deductInventoryFIFO but takes a
     * $reason for the StockHistory record.
     */
    private function deductInventoryFIFO(
        Inventory $inventory,
        int $qty,
        string $reason,
        float $unitPrice = 0.0,
        ?string $orderId = null,
    ): void {
        $qty = max(0, $qty);
        if ($qty <= 0) return;

        $batches = $inventory->batches ?? [];
        usort($batches, function ($a, $b) {
            return strtotime($a['dateReceived'] ?? '0')
                <=> strtotime($b['dateReceived'] ?? '0');
        });

        $available = array_reduce($batches, function ($carry, $b) {
            return $carry + ($b['remainingQty'] ?? $b['goodQty'] ?? 0);
        }, 0);

        if ($available < $qty) {
            Log::warning('OrderController@deductInventoryFIFO: insufficient batch stock', [
                'inventoryId' => (string) $inventory->_id,
                'requested'   => $qty,
                'available'   => $available,
            ]);
            // Fall back to stockQty only — batches may be unpopulated
            $inventory->stockQty = max(0, (int) ($inventory->stockQty ?? 0) - $qty);
            $inventory->updatedAt = now();
            $inventory->save();
            StockHistory::create([
                'inventoryId'  => (string) $inventory->_id,
                'quantity'     => $qty,
                'remainingQty' => $inventory->stockQty,
                'unitCost'     => $inventory->averageCost ?? 0,
                'totalCost'    => ($inventory->averageCost ?? 0) * $qty,
                'reason'       => $reason,
                'type'         => 'deduction',
                'remarks'      => $orderId ? "Order: {$orderId}" : null,
                'createdAt'    => now(),
            ]);
            return;
        }

        $remaining = $qty;
        $batchDeductions = [];
        foreach ($batches as &$batch) {
            if ($remaining <= 0) break;
            $batchQty = $batch['remainingQty'] ?? $batch['goodQty'] ?? 0;
            if ($batchQty <= 0) continue;
            $deduct = min($batchQty, $remaining);
            $batch['remainingQty'] = $batchQty - $deduct;
            $remaining -= $deduct;
            $batchDeductions[] = [
                'batchId'  => $batch['batchId'] ?? null,
                'qty'      => $deduct,
                'unitCost' => $batch['unitCost'] ?? 0,
            ];
        }
        unset($batch);

        $newStock = max(0, (int) ($inventory->stockQty ?? 0) - $qty);
        $inventory->batches   = $batches;
        $inventory->stockQty  = $newStock;
        $inventory->updatedAt = now();
        $inventory->save();

        $runningRemaining = $newStock + $qty;
        foreach ($batchDeductions as $bd) {
            $runningRemaining -= $bd['qty'];
            StockHistory::create([
                'inventoryId'  => (string) $inventory->_id,
                'quantity'     => $bd['qty'],
                'remainingQty' => $runningRemaining,
                'unitCost'     => $bd['unitCost'],
                'totalCost'    => $bd['qty'] * $bd['unitCost'],
                'reason'       => $reason,
                'type'         => 'deduction',
                'batchId'      => $bd['batchId'],
                'sellingPrice' => $unitPrice,
                'remarks'      => $orderId ? "Order: {$orderId}" : null,
                'performedBy'  => 'system',
                'createdAt'    => now(),
            ]);
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

            $limit = min(max((int) $request->input('limit', 50), 1), 200);
            $page = max((int) $request->input('page', 1), 1);
            $skip = ($page - 1) * $limit;

            $orders = Order::select($this->orderListFields())
                ->orderBy('createdAt', 'desc')
                ->skip($skip)
                ->limit($limit)
                ->get();

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

            // Try exact _id match first
            $order = Order::find($id);

            // Fall back to suffix match if not found and input looks like a short code
            // (8 hex chars, case-insensitive — matches the #XXXXXXXX shown on receipts)
            if (!$order && preg_match('/^[0-9a-fA-F]{8}$/', $id)) {
                $order = Order::whereRaw([
                    '$expr' => [
                        '$eq' => [
                            ['$substr' => [['$toString' => '$_id'], 16, 8]],
                            strtolower($id),
                        ],
                    ],
                ])->first();
            }

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
            $newStatus = $validated['orderStatus'];

            // Enforce valid status transitions
            $allowedTransitions = [
                'Pending'       => ['In Production', 'Cancelled'],
                'In Production' => ['For Delivery', 'Cancelled'],
                'For Delivery'  => ['Delivered', 'Returned'],
                'Delivered'     => [],
                'Returned'      => [],
                'Cancelled'     => [],
            ];

            $allowed = $allowedTransitions[$oldStatus] ?? [];
            if (!in_array($newStatus, $allowed)) {
                return response()->json([
                    'error' => "Invalid transition: cannot move from '{$oldStatus}' to '{$newStatus}'.",
                ], 422);
            }

            // Payment gate — downpayment required before entering production
            // COD orders are exempt from this gate if paymentMethod is 'cod'
            // or if at least one payment has been recorded via paymentHistory.
            if ($newStatus === 'In Production') {
                $downPayment    = $order->downPayment ?? 0;
                $paymentMethod  = $order->paymentMethod ?? '';
                $paymentHistory = $order->paymentHistory ?? [];
                $paymentStatus  = $order->paymentStatus ?? '';

                $hasCodMethod    = $paymentMethod === 'cod';
                $hasAnyPayment   = $downPayment > 0 || count($paymentHistory) > 0 || $paymentStatus === 'paid';

                if (!$hasCodMethod && !$hasAnyPayment) {
                    return response()->json([
                        'error' => 'A downpayment is required before moving this order to production. Please collect at least a partial payment first.',
                    ], 422);
                }
            }

            // Courier required when moving to For Delivery
            if ($newStatus === 'For Delivery') {
                $validated2 = $request->validate([
                    'courierName'    => 'required|string|max:100',
                    'trackingNumber' => 'nullable|string|max:200',
                ]);
                $order->courierName    = $validated2['courierName'];
                $order->trackingNumber = $validated2['trackingNumber'] ?? null;
            }

            $order->orderStatus    = $newStatus;
            $order->updatedAt      = now();
            $history               = $order->statusHistory ?? [];
            $history[]             = ['status' => $newStatus, 'at' => now()->toISOString()];
            $order->statusHistory  = $history;
            $order->save();

            // Broadcast status update to order subscribers and admin channel
            try {
                broadcast(new OrderStatusUpdated(
                    (string) $order->_id,
                    $order->orderStatus,
                    trim(($user->firstName ?? '') . ' ' . ($user->lastName ?? '')) ?: null
                ))->toOthers();
            } catch (\Exception $e) {
                Log::warning('OrderController@updateStatus: broadcast failed', ['error' => $e->getMessage()]);
            }

            // Handle completion: create sales records and deduct inventory
            if ($order->orderStatus === 'Delivered' && $oldStatus !== 'Delivered') {
                $this->completeOrder($order);
            }

            // Handle cancellation: cancel linked JobOrder
            if ($order->orderStatus === 'Cancelled') {
                $this->cancelLinkedJobOrder($order);
            }

            // Handle return: restore inventory
            if ($order->orderStatus === 'Returned' && $oldStatus !== 'Returned') {
                $this->restoreInventoryOnReturn($order);
            }

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

    /**
     * Cancels the linked JobOrder when an Order is cancelled.
     * Prevents production staff from continuing work on a dead order.
     */
    private function cancelLinkedJobOrder(Order $order): void
    {
        try {
            $jobOrder = \App\Models\JobOrder::where('orderId', (string) $order->_id)
                ->whereIn('joStatus', ['Queued', 'In Progress'])
                ->first();

            if ($jobOrder) {
                $jobOrder->joStatus  = 'Cancelled';
                $jobOrder->updatedAt = now();
                $jobOrder->save();

                Log::info('cancelLinkedJobOrder: JobOrder cancelled', [
                    'orderId'    => (string) $order->_id,
                    'jobOrderId' => (string) $jobOrder->_id,
                ]);
            }
        } catch (\Exception $e) {
            Log::error('cancelLinkedJobOrder: failed', [
                'orderId' => (string) $order->_id,
                'error'   => $e->getMessage(),
            ]);
        }
    }

    /**
     * Restores inventory stock when an Order is returned.
     * Mirrors the deduction done in completeOrder().
     */
    private function restoreInventoryOnReturn(Order $order): void
    {
        // Raw materials consumed during printing are physically gone.
        // We do NOT restore stockQty — that would corrupt inventory data.
        // We only log the return event to StockHistory for audit purposes.
        try {
            foreach ($order->items as $item) {
                $product = Product::find($item['productId']);
                if (!$product || !$product->inventoryId) continue;

                $inventory = Inventory::find($product->inventoryId);
                if (!$inventory || $inventory->isOnDemand) continue;

                StockHistory::create([
                    'inventoryId'  => (string) $inventory->_id,
                    'quantity'     => $item['qty'],
                    'remainingQty' => $inventory->stockQty ?? 0,
                    'unitCost'     => $inventory->averageCost ?? 0,
                    'totalCost'    => ($inventory->averageCost ?? 0) * $item['qty'],
                    'reason'       => 'customer_return',
                    'type'         => 'adjustment',
                    'performedBy'  => 'system',
                    'createdAt'    => now(),
                ]);
            }
        } catch (\Exception $e) {
            Log::error('OrderController: inventory restoration failed', [
                'orderId' => (string) $order->_id,
                'error'   => $e->getMessage(),
            ]);
        }
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
     * POST /api/admin/orders/{id}/record-payment
     * Records a cash payment against an order (COD or partial payment).
     * Appends to paymentHistory[], recalculates downPayment and balance.
     */
    public function recordPayment(Request $request, $id)
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

            if (in_array($order->orderStatus, ['Cancelled', 'Returned'])) {
                return response()->json([
                    'error' => "Cannot record payment for an order with status: {$order->orderStatus}.",
                ], 422);
            }

            // Allow payment recording on Delivered orders only if:
            // - payment method is COD (courier collects after delivery), AND
            // - order is not already fully paid
            if ($order->orderStatus === 'Delivered') {
                $isCod       = ($order->paymentMethod ?? '') === 'cod';
                $isFullyPaid = ($order->paymentStatus ?? '') === 'paid';
                if (!$isCod || $isFullyPaid) {
                    return response()->json([
                        'error' => $isFullyPaid
                            ? 'This order has already been fully paid.'
                            : 'Cannot record payment for a delivered non-COD order.',
                    ], 422);
                }
            }

            $validated = $request->validate([
                'amount'     => 'required|numeric|min:0.01',
                'method'     => 'required|string|in:cash,gcash,bank_transfer,cod',
                'note'       => 'nullable|string|max:500',
            ]);

            $recordedBy = trim("{$user->firstName} {$user->lastName}");

            $newEntry = [
                'amount'     => (float) $validated['amount'],
                'method'     => $validated['method'],
                'note'       => isset($validated['note'])
                    ? htmlspecialchars(strip_tags(trim($validated['note'])), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8')
                    : null,
                'recordedBy' => $recordedBy,
                'recordedAt' => now()->toISOString(),
            ];

            // Append to paymentHistory
            $history   = $order->paymentHistory ?? [];
            $history[] = $newEntry;

            // Recalculate downPayment as sum of all recorded payments
            $totalPaid = collect($history)->sum('amount');
            $balance   = max(0, (float) ($order->totalAmount ?? 0) - $totalPaid);

            $order->paymentHistory = $history;
            $order->downPayment    = $totalPaid;
            $order->balance        = $balance;
            $order->paymentStatus  = $balance <= 0 ? 'paid' : 'partial';
            $order->updatedAt      = now();
            $order->save();

            return $this->successResponse('Payment recorded successfully.', $order);

        } catch (\Illuminate\Validation\ValidationException $e) {
            return $this->validationErrorResponse($e);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'Failed to record payment.');
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

            // In-app notification to admin — B-13
            try {
                $admin = \App\Models\User::where('role', 'admin')->first();
                if ($admin) {
                    Notification::create([
                        'user_id'    => (string) $admin->_id,
                        'type'       => 'order_cancelled',
                        'title'      => 'Order Cancelled by Customer',
                        'message'    => 'Order #' . strtoupper(substr((string) $order->_id, -8)) .
                                        ' was cancelled by ' . trim("{$user->firstName} {$user->lastName}") . '.',
                        'is_read'    => false,
                        'data'       => ['orderId' => (string) $order->_id],
                        'created_at' => now(),
                    ]);
                }
            } catch (\Exception $e) {
                Log::warning('cancelMyOrder: admin notification failed', ['error' => $e->getMessage()]);
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