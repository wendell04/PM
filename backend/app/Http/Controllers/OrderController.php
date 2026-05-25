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
use Illuminate\Support\Facades\Http;
use App\Models\StockHistory;
use App\Models\AuditLog;
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

    private function resolveInitialStatus($request): string
    {
        $isCustom    = filter_var($request->input('isCustomOrder', false), FILTER_VALIDATE_BOOLEAN);
        $designType  = $request->input('designType');
        if ($isCustom) {
            return $designType === 'upload' ? 'pending_review' : 'pending_design';
        }
        return 'Pending';
    }

    private function normalizeOrderForCustomer(Order $order): array
    {
        $arr                = $order->toArray();
        $arr['id']          = (string) ($order->_id ?? $order->id ?? '');
        $arr['status']      = $order->orderStatus;
        $arr['proofUrl']    = $order->adminDesignUrl ?? null;
        $arr['isCustomOrder'] = (bool) ($order->isCustomOrder ?? false);
        return $arr;
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
                'items.*.designUrl'           => 'nullable|string',
                'items.*.designNotes'         => 'nullable|string|max:2000',
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
                'isCustomOrder'               => 'nullable|boolean',
                'designType'                  => 'nullable|string|in:upload,request',
                'items.*.designRequested'     => 'nullable|boolean',
                'items.*.designFee'           => 'nullable|numeric|min:0',
            ]);

            // Build order items with pricing (no transaction wrapper for MongoDB compatibility)
            $orderItems               = [];
            $totalAmount              = 0;
            $pendingFlashSaleIncrements = [];
            $firstProduct             = null;

            foreach ($validated['items'] as $item) {
                $product = Product::where('_id', $item['productId'])
                                  ->where('isActive', true)
                                  ->first();

                if (!$product) {
                    throw new \Exception("Product '{$item['productId']}' not found or unavailable.");
                }

                if (!$firstProduct) $firstProduct = $product;

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

                $variantId         = $item['variantId'] ?? null;
                $variantImageUrls  = (array) ($product->variantImageUrls ?? []);
                $rawThumb          = ($variantId && !empty($variantImageUrls[$variantId]))
                    ? $variantImageUrls[$variantId]
                    : ($product->thumbnail ?? null);
                $thumb = $rawThumb
                    ? (str_starts_with($rawThumb, 'http') ? $rawThumb : asset('storage/' . $rawThumb))
                    : null;

                $orderItems[] = [
                    'productId'   => (string) $product->_id,
                    'productName' => $product->name,
                    'isCustom'    => (bool) $product->isCustom,
                    'thumbnail'   => $thumb,
                    'variantId'   => $variantId,
                    'variantName' => $item['variantName'] ?? null,
                    'qty'         => $qty,
                    'unitPrice'   => $unitPrice,
                    'lineTotal'   => $lineTotal,
                    'flashSaleId' => $flashSaleId,
                    'designUrl'   => $item['designUrl']   ?? null,
                    'designNotes' => $item['designNotes'] ?? null,
                ];
            }

            $requiresDownpayment = (bool) ($firstProduct?->requiresDownpayment ?? false);
            $orderDownpaymentPct = $requiresDownpayment ? (int) ($firstProduct?->downpaymentPercent ?? 0) : 0;

            // Add shipping fee to total
            $shippingFee  = (float) ($validated['shippingFee'] ?? 0);
            $totalAmount += $shippingFee;

            // Handle design file upload (non-fatal)
            $designFilePath = null;
            if ($request->hasFile('design_file') && $request->file('design_file')->isValid()) {
                try {
                    $cloudName    = config('services.cloudinary.cloud_name');
                    $uploadPreset = config('services.cloudinary.upload_preset');
                    $file         = $request->file('design_file');
                    $ext          = strtolower($file->getClientOriginalExtension());
                    $resourceType = in_array($ext, ['jpg','jpeg','png','webp','svg']) ? 'image' : 'raw';
                    $response     = Http::attach(
                        'file',
                        file_get_contents($file->getPathname()),
                        $file->getClientOriginalName()
                    )->post("https://api.cloudinary.com/v1_1/{$cloudName}/{$resourceType}/upload", [
                        'upload_preset' => $uploadPreset,
                        'folder'        => 'pmp-customer-designs',
                    ]);
                    if ($response->successful()) {
                        $designFilePath = $response->json()['secure_url'];
                    }
                } catch (\Exception $fileErr) {
                    Log::warning('OrderController@store: design file upload failed', [
                        'error'  => $fileErr->getMessage(),
                        'userId' => (string) $user->_id,
                    ]);
                }
            }

            $paymentMethod = $validated['paymentMethod'] ?? 'cod';

            // ── COD guard — reject if any product disallows COD ──────────
            if ($paymentMethod === 'cod') {
                foreach ($validated['items'] as $item) {
                    $prod = Product::find($item['productId'] ?? null);
                    if ($prod && $prod->allowCOD === false) {
                        return $this->errorResponse('One or more items in your order do not allow Cash on Delivery.', 422);
                    }
                }
            }

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

            // ── Pre-validate BOM products against can-produce ────────────
            foreach ($orderItems as $item) {
                $bomProd  = Product::find($item['productId'] ?? null);
                $itemQty  = (int) ($item['qty'] ?? 1);
                $variantId = $item['variantId'] ?? null;

                if (!$bomProd) continue;

                // Determine the BOM to validate against
                $bom = null;
                if (!empty($bomProd->bomGroupName) && $variantId) {
                    $bom = BillOfMaterial::find($variantId);
                } elseif (!empty($bomProd->bomId)) {
                    $bom = BillOfMaterial::find($bomProd->bomId);
                }
                // per-combination bomId: each combo stores its own bomId
                if (!$bom && $variantId && !empty($bomProd->combinations)) {
                    foreach ($bomProd->combinations as $combo) {
                        if ((string) ($combo['id'] ?? $combo['_id'] ?? '') === (string) $variantId && !empty($combo['bomId'])) {
                            $bom = BillOfMaterial::find($combo['bomId']);
                            break;
                        }
                    }
                }

                if (!$bom || empty($bom->components)) continue;

                // Per-variant manual cap stored in variantStock
                if (!empty($bomProd->bomGroupName) && $variantId) {
                    $variantCap = isset($bomProd->variantStock[$variantId]) && (int) $bomProd->variantStock[$variantId] > 0
                        ? (int) $bomProd->variantStock[$variantId]
                        : null;
                    if ($variantCap !== null && $itemQty > $variantCap) {
                        return $this->errorResponse(
                            "\"{$bomProd->name}\" has a storefront cap of {$variantCap} unit(s) for that variant.",
                            422
                        );
                    }
                } elseif ($bomProd->storeStockCap !== null && $itemQty > (int) $bomProd->storeStockCap) {
                    return $this->errorResponse(
                        "\"{$bomProd->name}\" has a storefront limit of {$bomProd->storeStockCap} unit(s).",
                        422
                    );
                }

                $canProduce = PHP_INT_MAX;
                foreach ($bom->components as $component) {
                    $rawInv = Inventory::find($component['inventoryId'] ?? null);
                    if (!$rawInv || $rawInv->isOnDemand) continue;
                    $qpu = (float) ($component['qty'] ?? 0);
                    if ($qpu <= 0) continue;
                    $canProduce = min($canProduce, (int) floor(($rawInv->stockQty ?? 0) / $qpu));
                }
                if ($canProduce !== PHP_INT_MAX && $itemQty > $canProduce) {
                    return $this->errorResponse(
                        "\"{$bomProd->name}\" can only produce {$canProduce} unit(s) with current materials.",
                        422
                    );
                }
            }

            // ── Atomic stock reservation BEFORE order creation ───────────
            // Uses findOneAndUpdate with $gte condition: if two buyers race,
            // only one succeeds; the other gets a 422 and no order is created.
            $stockReservations = [];
            foreach ($orderItems as $item) {
                $prod = Product::find($item['productId'] ?? null);
                if (!$prod || !$prod->inventoryId) continue;
                $inv = Inventory::find($prod->inventoryId);
                if (!$inv || $inv->isOnDemand) continue;

                $qty = (int) $item['qty'];

                $updated = DB::connection('mongodb')
                    ->getCollection('inventories')
                    ->findOneAndUpdate(
                        [
                            '_id'      => new \MongoDB\BSON\ObjectId((string) $inv->_id),
                            'stockQty' => ['$gte' => $qty],
                        ],
                        ['$inc' => ['stockQty' => -$qty]],
                        ['returnDocument' => \MongoDB\Operation\FindOneAndUpdate::RETURN_DOCUMENT_AFTER]
                    );

                if ($updated === null) {
                    // Rollback all previous reservations in this request
                    foreach ($stockReservations as $r) {
                        DB::connection('mongodb')
                            ->getCollection('inventories')
                            ->updateOne(
                                ['_id' => new \MongoDB\BSON\ObjectId($r['invId'])],
                                ['$inc' => ['stockQty' => $r['qty']]]
                            );
                    }
                    $currentStock = (int) ($inv->stockQty ?? 0);
                    return $this->errorResponse(
                        "\"{$prod->name}\" only has {$currentStock} item(s) in stock.",
                        422
                    );
                }

                $stockReservations[] = [
                    'invId'       => (string) $inv->_id,
                    'qty'         => $qty,
                    'newStockQty' => (int) ($updated->stockQty ?? 0),
                    'unitCost'    => (float) ($inv->averageCost ?? 0),
                    'productId'   => (string) $prod->_id,
                    'productName' => $prod->name ?? '',
                ];
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
                'orderStatus'     => $this->resolveInitialStatus($request),
                'paymentStatus'   => 'unpaid',
                'paymentMethod'   => $paymentMethod,
                'notes'           => htmlspecialchars(strip_tags(trim($validated['notes'] ?? '')), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'),
                'deliveryAddress' => $validated['deliveryAddress'] ?? null,
                'designNotes'     => isset($validated['design_notes'])
                    ? htmlspecialchars(strip_tags(trim($validated['design_notes'])), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8')
                    : null,
                'designFilePath'  => $designFilePath,
                'designStatus'    => $designFilePath ? 'pending_review' : null,
                'isCustomOrder'        => filter_var($request->input('isCustomOrder', false), FILTER_VALIDATE_BOOLEAN),
                'designType'           => $request->input('designType'),
                'requiresDownpayment'  => $requiresDownpayment,
                'downpaymentPercent'   => $orderDownpaymentPct > 0 ? $orderDownpaymentPct : null,
                'statusHistory'        => [['status' => $this->resolveInitialStatus($request), 'at' => now()->toISOString()]],
                'createdAt'       => now(),
                'updatedAt'       => now(),
            ]);

            // Deduct flash sale stock only after order is persisted
            foreach ($pendingFlashSaleIncrements as [$flashSale, $qty]) {
                $flashSale->increment('stockUsed', $qty);
            }

            // Record StockHistory for the atomically-reserved quantities
            foreach ($stockReservations as $r) {
                try {
                    StockHistory::create([
                        'inventoryId'  => $r['invId'],
                        'quantity'     => $r['qty'],
                        'remainingQty' => $r['newStockQty'],
                        'unitCost'     => $r['unitCost'],
                        'totalCost'    => $r['unitCost'] * $r['qty'],
                        'reason'       => 'sale_reserved',
                        'type'         => 'deduction',
                        'performedBy'  => 'system',
                        'orderId'      => (string) $order->_id,
                        'productId'    => $r['productId'],
                        'productName'  => $r['productName'],
                        'customerName' => $order->userSnapshot['name'] ?? '',
                        'remarks'      => 'Order: ' . (string) $order->_id,
                        'createdAt'    => now(),
                    ]);
                } catch (\Exception $e) {
                    Log::warning('store: StockHistory write failed', ['error' => $e->getMessage()]);
                }
            }

            // ── BOM material deduction at order creation ──────────────
            foreach ($orderItems as $item) {
                $prod      = Product::find($item['productId'] ?? null);
                $variantId = $item['variantId'] ?? null;
                if (!$prod) continue;
                try {
                    $bom = null;
                    if (!empty($prod->bomGroupName) && $variantId) {
                        $bom = BillOfMaterial::find($variantId);
                    } elseif (!empty($prod->bomId)) {
                        $bom = BillOfMaterial::find($prod->bomId);
                    }
                    // per-combination bomId: each combo stores its own bomId
                    if (!$bom && $variantId && !empty($prod->combinations)) {
                        foreach ($prod->combinations as $combo) {
                            if ((string) ($combo['id'] ?? $combo['_id'] ?? '') === (string) $variantId && !empty($combo['bomId'])) {
                                $bom = BillOfMaterial::find($combo['bomId']);
                                break;
                            }
                        }
                    }
                    if (!$bom || empty($bom->components)) continue;
                    foreach ($bom->components as $component) {
                        $rawInv = Inventory::find($component['inventoryId'] ?? null);
                        if (!$rawInv || $rawInv->isOnDemand) continue;
                        $deductQty = (int) round(($component['qty'] ?? 0) * ($item['qty'] ?? 1));
                        if ($deductQty <= 0) continue;
                        $this->deductInventoryFIFO(
                            inventory:    $rawInv,
                            qty:          $deductQty,
                            reason:       'sale_reserved',
                            unitPrice:    0.0,
                            orderId:      (string) $order->_id,
                            productId:    (string) $prod->_id,
                            productName:  $prod->name ?? '',
                            customerName: $order->userSnapshot['name'] ?? '',
                        );
                    }
                } catch (\Exception $bomErr) {
                    Log::warning('store: BOM deduction failed', [
                        'orderId'   => (string) $order->_id,
                        'productId' => $item['productId'],
                        'error'     => $bomErr->getMessage(),
                    ]);
                }
            }

            // Broadcast new order to admin channel
            try {
                broadcast(new OrderStatusUpdated(
                    (string) $order->_id,
                    'pending',
                    null
                ));
            } catch (\Throwable $e) {
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
                'data'       => $orders->map(fn($o) => $this->normalizeOrderForCustomer($o)),
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

            return $this->successResponse('Order fetched successfully.', $this->normalizeOrderForCustomer($order));
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
            if (!$this->hasPermission($request, 'orders')) {
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
                ->where('isArchived', '!=', true)
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
            if (!$this->hasPermission($request, 'orders')) {
                return $this->unauthorizedResponse();
            }

            $order = Order::find($id);

            if (!$order) {
                return $this->notFoundResponse('Order');
            }

            $validated = $request->validate([
                'orderStatus'   => 'sometimes|in:Pending,Processing,In Production,For QC,For Delivery,Delivered,Returned,Cancelled,pending_design,proof_sent,revision_requested,design_approved,awaiting_payment,awaiting_production,in_production,for_qc,ready_for_delivery,for_delivery,delivered,cancelled',
                'paymentStatus' => 'sometimes|in:unpaid,partial,paid',
                'notes'         => 'nullable|string|max:1000',
                'shippingFee'   => 'sometimes|numeric|min:0|max:50000',
            ]);

            // Block for_delivery if DP custom order hasn't been fully paid
            if (isset($validated['orderStatus']) && $validated['orderStatus'] === 'for_delivery') {
                if ($order->isCustomOrder && $order->paymentStatus !== 'paid') {
                    return response()->json(['message' => 'Customer must complete balance payment before the order can be moved to For Delivery.'], 422);
                }
            }

            $oldStatus = $order->orderStatus;

            // Store courier info when moving to For Delivery
            if (isset($validated['orderStatus']) && $validated['orderStatus'] === 'For Delivery') {
                $order->courierName    = $request->input('courierName') ?: null;
                $order->trackingNumber = $request->input('trackingNumber') ?: null;
            }

            $order->update($validated);

            // When shipping fee is updated, derive subtotal from existing data and recalculate total
            if (isset($validated['shippingFee'])) {
                $prevShipping = (float) ($order->getOriginal('shippingFee') ?? $order->shippingFee ?? 0);
                $subtotal = (float) ($order->subtotal ?? ($order->totalAmount - $prevShipping));
                $order->totalAmount = round($subtotal + (float) $validated['shippingFee'], 2);
                $order->save();
            }

            // Handle cancellation: cancel linked JobOrder and restore inventory
            if (isset($validated['orderStatus']) && $order->orderStatus === 'Cancelled' && $oldStatus !== 'Cancelled') {
                $this->cancelLinkedJobOrder($order);
                $this->restoreStockOnCancel($order);
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
            if (!$this->hasPermission($request, 'orders')) {
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
                    'saleDate'        => $order->createdAt ?? now(),
                    'customerName'    => $order->userSnapshot['name'] ?? 'Online Customer',
                    'customerEmail'   => $order->userSnapshot['email'] ?? null,
                    'source'          => 'online',
                    'status'          => 'completed',
                    'notes'           => "From Order: " . ($order->orderId ?? $order->_id),
                    'createdAt'       => now(),
                ]);

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

                // BOM materials are deducted at order creation (store/initiatePayment), not here.
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
        ?string $productId = null,
        ?string $productName = null,
        ?string $customerName = null,
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
                'orderId'      => $orderId,
                'productId'    => $productId,
                'productName'  => $productName,
                'customerName' => $customerName,
                'remarks'      => $orderId ? "Order: {$orderId}" : null,
                'createdAt'    => now(),
            ]);
            try {
                AuditLog::create([
                    'inventoryId'  => (string) $inventory->_id,
                    'productName'  => $inventory->name ?? 'Unknown',
                    'category'     => $inventory->category ?? 'Uncategorized',
                    'reason'       => $reason,
                    'quantity'     => -$qty,
                    'stockBefore'  => $inventory->stockQty + $qty,
                    'stockAfter'   => $inventory->stockQty,
                    'unitCost'     => (float) ($inventory->averageCost ?? 0),
                    'totalCost'    => (float) (($inventory->averageCost ?? 0) * $qty),
                    'remarks'      => $orderId ? "Order: {$orderId}" : '',
                    'performedBy'  => 'system',
                    'createdAt'    => now(),
                ]);
            } catch (\Exception $auditEx) {
                Log::warning('AuditLog write failed (OrderController@deductInventoryFIFO)', ['error' => $auditEx->getMessage()]);
            }
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
                'orderId'      => $orderId,
                'productId'    => $productId,
                'productName'  => $productName,
                'customerName' => $customerName,
                'remarks'      => $orderId ? "Order: {$orderId}" : null,
                'performedBy'  => 'system',
                'createdAt'    => now(),
            ]);
        }
        try {
            AuditLog::create([
                'inventoryId'  => (string) $inventory->_id,
                'productName'  => $inventory->name ?? 'Unknown',
                'category'     => $inventory->category ?? 'Uncategorized',
                'reason'       => $reason,
                'quantity'     => -$qty,
                'stockBefore'  => $newStock + $qty,
                'stockAfter'   => $newStock,
                'unitCost'     => (float) ($inventory->averageCost ?? 0),
                'totalCost'    => (float) (($inventory->averageCost ?? 0) * $qty),
                'remarks'      => $orderId ? "Order: {$orderId}" : '',
                'performedBy'  => 'system',
                'createdAt'    => now(),
            ]);
        } catch (\Exception $auditEx) {
            Log::warning('AuditLog write failed (OrderController@deductInventoryFIFO)', ['error' => $auditEx->getMessage()]);
        }
    }

    // ─── Admin API Endpoints (New Schema) ─────────────────────────────────────

    /**
     * DELETE /api/admin/orders/{id}
     * Soft-deletes (archives) an order. Owner/Admin only.
     */
    public function hardDelete(Request $request, $id)
    {
        try {
            $user = $request->user();
            if (!$user || !in_array($user->role, ['admin', 'owner'])) {
                return response()->json(['error' => 'Forbidden'], 403);
            }

            $order = Order::find($id);
            if (!$order) {
                return response()->json(['error' => 'Order not found'], 404);
            }

            $order->isArchived = true;
            $order->archivedAt = now();
            $order->save();

            return response()->json(['message' => 'Order archived']);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'Failed to archive order.');
        }
    }

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

            if (!$this->hasPermission($request, 'orders')) {
                return $this->unauthorizedResponse();
            }

            $limit = min(max((int) $request->input('limit', 50), 1), 200);
            $page = max((int) $request->input('page', 1), 1);
            $skip = ($page - 1) * $limit;

            $showArchived = $request->boolean('showArchived', false);

            $query = Order::select($this->orderListFields())
                ->orderBy('createdAt', 'desc')
                ->skip($skip)
                ->limit($limit);

            if (!$showArchived) {
                $query->where('isArchived', '!=', true);
            }

            $orders = $query->get();

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

            if (!$this->hasPermission($request, 'orders')) {
                return $this->unauthorizedResponse();
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

            if (!$this->hasPermission($request, 'orders')) {
                return $this->unauthorizedResponse();
            }

            $validated = $request->validate([
                'orderStatus' => 'required|in:Pending,In Production,For QC,For Delivery,Delivered,Returned,Cancelled',
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
                'In Production' => ['For QC', 'Cancelled'],
                'For QC'        => ['For Delivery', 'In Production'],
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
            } catch (\Throwable $e) {
                Log::warning('OrderController@updateStatus: broadcast failed', ['error' => $e->getMessage()]);
            }

            // Handle completion: create sales records and deduct inventory
            if ($order->orderStatus === 'Delivered' && $oldStatus !== 'Delivered') {
                $this->completeOrder($order);
            }

            // Handle cancellation: cancel linked JobOrder and restore inventory
            if ($order->orderStatus === 'Cancelled') {
                $this->cancelLinkedJobOrder($order);
                if ($oldStatus !== 'Cancelled') $this->restoreStockOnCancel($order);
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
     * Restores product inventory when an order is cancelled.
     * Mirrors the immediate deduction done in store().
     */
    private function restoreStockOnCancel(Order $order): void
    {
        try {
            foreach ($order->items as $item) {
                $product = Product::find($item['productId'] ?? null);
                if (!$product || !$product->inventoryId) continue;
                $inv = Inventory::find($product->inventoryId);
                if (!$inv || $inv->isOnDemand) continue;
                $qty = (int) ($item['qty'] ?? 0);
                if ($qty <= 0) continue;

                // Atomic restore — mirrors the atomic reservation on order creation
                $updated = DB::connection('mongodb')
                    ->getCollection('inventories')
                    ->findOneAndUpdate(
                        ['_id' => new \MongoDB\BSON\ObjectId((string) $inv->_id)],
                        ['$inc' => ['stockQty' => $qty]],
                        ['returnDocument' => \MongoDB\Operation\FindOneAndUpdate::RETURN_DOCUMENT_AFTER]
                    );

                $newQty = (int) ($updated->stockQty ?? (($inv->stockQty ?? 0) + $qty));

                StockHistory::create([
                    'inventoryId'  => (string) $inv->_id,
                    'quantity'     => $qty,
                    'remainingQty' => $newQty,
                    'unitCost'     => $inv->averageCost ?? 0,
                    'totalCost'    => 0,
                    'reason'       => 'order_cancelled',
                    'type'         => 'adjustment',
                    'performedBy'  => 'system',
                    'remarks'      => 'Order cancelled: ' . (string) $order->_id,
                    'createdAt'    => now(),
                ]);
                try {
                    AuditLog::create([
                        'inventoryId'  => (string) $inv->_id,
                        'productName'  => $inv->name ?? 'Unknown',
                        'category'     => $inv->category ?? 'Uncategorized',
                        'reason'       => 'return',
                        'quantity'     => $qty,
                        'stockBefore'  => $newQty - $qty,
                        'stockAfter'   => $newQty,
                        'unitCost'     => (float) ($inv->averageCost ?? 0),
                        'totalCost'    => 0.0,
                        'remarks'      => 'Order cancelled: ' . (string) $order->_id,
                        'performedBy'  => 'system',
                        'createdAt'    => now(),
                    ]);
                } catch (\Exception $auditEx) {
                    Log::warning('AuditLog write failed (OrderController@restoreStockOnCancel)', ['error' => $auditEx->getMessage()]);
                }
            }

            // Restore BOM raw materials deducted at order creation
            foreach ($order->items as $item) {
                $bomProduct = Product::find($item['productId'] ?? null);
                if (!$bomProduct) continue;
                $variantId = $item['variantId'] ?? null;

                // Same three-path BOM lookup used at order creation
                $bom = null;
                if (!empty($bomProduct->bomGroupName) && $variantId) {
                    $bom = BillOfMaterial::find($variantId);
                } elseif (!empty($bomProduct->bomId)) {
                    $bom = BillOfMaterial::find($bomProduct->bomId);
                }
                if (!$bom && $variantId && !empty($bomProduct->combinations)) {
                    foreach ($bomProduct->combinations as $combo) {
                        if ((string) ($combo['id'] ?? $combo['_id'] ?? '') === (string) $variantId && !empty($combo['bomId'])) {
                            $bom = BillOfMaterial::find($combo['bomId']);
                            break;
                        }
                    }
                }

                if (!$bom || empty($bom->components)) continue;
                try {
                    foreach ($bom->components as $component) {
                        $rawInv = Inventory::find($component['inventoryId'] ?? null);
                        if (!$rawInv || $rawInv->isOnDemand) continue;
                        $qty = (int) round(($component['qty'] ?? 0) * ($item['qty'] ?? 0));
                        if ($qty <= 0) continue;
                        $updated = DB::connection('mongodb')
                            ->getCollection('inventories')
                            ->findOneAndUpdate(
                                ['_id' => new \MongoDB\BSON\ObjectId((string) $rawInv->_id)],
                                ['$inc' => ['stockQty' => $qty]],
                                ['returnDocument' => \MongoDB\Operation\FindOneAndUpdate::RETURN_DOCUMENT_AFTER]
                            );
                        $newQty = (int) ($updated->stockQty ?? (($rawInv->stockQty ?? 0) + $qty));
                        StockHistory::create([
                            'inventoryId'  => (string) $rawInv->_id,
                            'quantity'     => $qty,
                            'remainingQty' => $newQty,
                            'unitCost'     => $rawInv->averageCost ?? 0,
                            'totalCost'    => 0,
                            'reason'       => 'order_cancelled',
                            'type'         => 'adjustment',
                            'performedBy'  => 'system',
                            'orderId'      => (string) $order->_id,
                            'productId'    => (string) ($bomProduct->_id ?? ''),
                            'productName'  => $bomProduct->name ?? '',
                            'customerName' => $order->userSnapshot['name'] ?? '',
                            'remarks'      => 'Order cancelled (BOM restore): ' . (string) $order->_id,
                            'createdAt'    => now(),
                        ]);
                    }
                } catch (\Exception $bomErr) {
                    Log::warning('restoreStockOnCancel: BOM restore failed', [
                        'orderId'   => (string) $order->_id,
                        'productId' => $item['productId'],
                        'error'     => $bomErr->getMessage(),
                    ]);
                }
            }
        } catch (\Exception $e) {
            Log::error('restoreStockOnCancel: failed', [
                'orderId' => (string) $order->_id,
                'error'   => $e->getMessage(),
            ]);
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

            // Restore inventory reserved at order creation
            $this->restoreStockOnCancel($order);

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

    /**
     * POST /api/orders/my/{id}/reupload-design
     * Customer re-uploads design after admin rejection.
     * Only allowed when designStatus === 'rejected'.
     */
    public function reuploadDesign(Request $request, $id)
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

            if ($order->designStatus !== 'rejected') {
                return $this->errorResponse('Design can only be re-uploaded when the previous submission was rejected.', 422);
            }

            $validated = $request->validate([
                'design_file'  => 'nullable|file|mimes:jpeg,jpg,png,webp,pdf,ai,psd,svg|max:10240',
                'design_notes' => 'nullable|string|max:2000',
            ]);

            if (!$request->hasFile('design_file') && empty(trim($validated['design_notes'] ?? ''))) {
                return $this->errorResponse('Please provide a new design file or updated notes.', 422);
            }

            $designFilePath = $order->designFilePath;
            if ($request->hasFile('design_file') && $request->file('design_file')->isValid()) {
                try {
                    $cloudName    = config('services.cloudinary.cloud_name');
                    $uploadPreset = config('services.cloudinary.upload_preset');
                    $file         = $request->file('design_file');
                    $ext          = strtolower($file->getClientOriginalExtension());
                    $resourceType = in_array($ext, ['jpg','jpeg','png','webp','svg']) ? 'image' : 'raw';
                    $response     = Http::attach(
                        'file',
                        file_get_contents($file->getPathname()),
                        $file->getClientOriginalName()
                    )->post("https://api.cloudinary.com/v1_1/{$cloudName}/{$resourceType}/upload", [
                        'upload_preset' => $uploadPreset,
                        'folder'        => 'pmp-customer-designs',
                    ]);
                    if ($response->successful()) {
                        $designFilePath = $response->json()['secure_url'];
                    }
                } catch (\Exception $fileErr) {
                    Log::warning('reuploadDesign: file upload failed', ['error' => $fileErr->getMessage()]);
                }
            }

            $order->designFilePath        = $designFilePath;
            $order->designStatus          = 'pending_review';
            $order->designRejectionReason = null;

            if (!empty(trim($validated['design_notes'] ?? ''))) {
                $order->designNotes = htmlspecialchars(
                    strip_tags(trim($validated['design_notes'])),
                    ENT_QUOTES | ENT_SUBSTITUTE,
                    'UTF-8'
                );
            }

            $order->updatedAt = now();
            $order->save();

            // Notify all admins/owners
            try {
                $admins = User::whereIn('role', ['admin', 'owner'])->get();
                $customerName = trim("{$user->firstName} {$user->lastName}");
                $orderShort   = strtoupper(substr((string) $order->_id, -8));
                foreach ($admins as $admin) {
                    Notification::create([
                        'user_id'    => (string) $admin->_id,
                        'type'       => 'design_resubmitted',
                        'title'      => 'Design Resubmitted',
                        'message'    => "{$customerName} resubmitted a design for order #{$orderShort}. Please review.",
                        'is_read'    => false,
                        'data'       => ['orderId' => (string) $order->_id],
                        'created_at' => now(),
                    ]);
                }
            } catch (\Exception $notifErr) {
                Log::warning('reuploadDesign: admin notification failed', ['error' => $notifErr->getMessage()]);
            }

            try {
                ActivityLog::create([
                    'action'           => 'design_resubmitted',
                    'entityType'       => 'order',
                    'entityId'         => (string) $order->_id,
                    'description'      => 'Customer resubmitted design for order #' .
                        strtoupper(substr((string) $order->_id, -8)),
                    'performedBy'      => trim("{$user->firstName} {$user->lastName}"),
                    'performedByEmail' => $user->email ?? null,
                    'metadata'         => ['orderId' => (string) $order->_id],
                    'createdAt'        => now(),
                ]);
            } catch (\Exception $logErr) {
                Log::warning('ActivityLog write failed (reuploadDesign)', ['error' => $logErr->getMessage()]);
            }

            return $this->successResponse('Design resubmitted for review.', $order);

        } catch (\Illuminate\Validation\ValidationException $e) {
            return $this->validationErrorResponse($e);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'Failed to resubmit design.');
        }
    }

    /**
     * POST /api/orders/my/{id}/approve-admin-design
     * Customer approves the admin's uploaded design draft.
     */
    public function approveAdminDesign(Request $request, $id)
    {
        try {
            $user = $this->getAuthUser($request);
            if (!$user) return $this->unauthorizedResponse();

            $order = Order::find($id);
            if (!$order || (string) $order->userId !== (string) $user->_id) {
                return $this->notFoundResponse('Order');
            }

            if (!$order->adminDesignUrl) {
                return $this->errorResponse('No design draft available for this order.', 422);
            }

            $history              = $order->statusHistory ?? [];
            $history[]            = ['status' => 'design_approved', 'at' => now()->toISOString()];
            $order->designStatus  = 'approved';
            $order->orderStatus   = 'design_approved';
            $order->statusHistory = $history;
            $order->updatedAt     = now();
            $order->save();

            try { broadcast(new \App\Events\OrderStatusUpdated((string) $order->_id, 'design_approved', null)); } catch (\Throwable) {}

            try {
                $admins = User::whereIn('role', ['admin', 'owner'])->get();
                foreach ($admins as $admin) {
                    Notification::create([
                        'user_id'    => (string) $admin->_id,
                        'type'       => 'design_approved_by_customer',
                        'title'      => 'Design Approved',
                        'message'    => 'Customer approved the design for order #' .
                            strtoupper(substr((string) $order->_id, -8)) . '. Set to Awaiting Payment so the customer can complete their order.',
                        'is_read'    => false,
                        'data'       => ['orderId' => (string) $order->_id],
                        'created_at' => now(),
                    ]);
                }
            } catch (\Exception $notifErr) {
                Log::warning('approveAdminDesign: notification failed', ['error' => $notifErr->getMessage()]);
            }

            return $this->successResponse('Design approved. We\'ll proceed to production.', $this->normalizeOrderForCustomer($order));

        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'Failed to approve design.');
        }
    }

    /**
     * POST /api/orders/my/{id}/request-revision
     * Customer requests a revision on the admin's design draft.
     */
    public function requestDesignRevision(Request $request, $id)
    {
        try {
            $user = $this->getAuthUser($request);
            if (!$user) return $this->unauthorizedResponse();

            $order = Order::find($id);
            if (!$order || (string) $order->userId !== (string) $user->_id) {
                return $this->notFoundResponse('Order');
            }

            if (!$order->adminDesignUrl) {
                return $this->errorResponse('No design draft available for this order.', 422);
            }

            $validated = $request->validate([
                'notes' => 'nullable|string|max:2000',
            ]);

            $history               = $order->statusHistory ?? [];
            $history[]             = ['status' => 'revision_requested', 'at' => now()->toISOString()];
            $order->designStatus   = 'revision_requested';
            $order->orderStatus    = 'revision_requested';
            $order->statusHistory  = $history;
            $order->revisionNotes  = isset($validated['notes'])
                ? htmlspecialchars(strip_tags(trim($validated['notes'])), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8')
                : null;
            $order->updatedAt      = now();
            $order->save();

            try {
                $admins = User::whereIn('role', ['admin', 'owner'])->get();
                foreach ($admins as $admin) {
                    Notification::create([
                        'user_id'    => (string) $admin->_id,
                        'type'       => 'design_revision_requested',
                        'title'      => 'Design Revision Requested',
                        'message'    => 'Customer requested a revision for order #' .
                            strtoupper(substr((string) $order->_id, -8)) .
                            ($order->revisionNotes ? ': ' . substr($order->revisionNotes, 0, 100) : '.'),
                        'is_read'    => false,
                        'data'       => ['orderId' => (string) $order->_id],
                        'created_at' => now(),
                    ]);
                }
            } catch (\Exception $notifErr) {
                Log::warning('requestDesignRevision: notification failed', ['error' => $notifErr->getMessage()]);
            }

            return $this->successResponse('Revision request sent. We\'ll update the design and notify you.', $this->normalizeOrderForCustomer($order));

        } catch (\Illuminate\Validation\ValidationException $e) {
            return $this->validationErrorResponse($e);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'Failed to submit revision request.');
        }
    }

    /**
     * POST /api/admin/orders/{id}/upload-design
     * Admin uploads a design draft for a design-service order.
     */
    public function adminUploadDesign(Request $request, $id)
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

            if (!$request->hasFile('design')) {
                return response()->json(['message' => 'At least one design file is required.'], 422);
            }

            $cloudName    = config('services.cloudinary.cloud_name');
            $uploadPreset = config('services.cloudinary.upload_preset');

            if (!$cloudName || !$uploadPreset) {
                return response()->json(['message' => 'Cloudinary configuration missing.'], 500);
            }

            $rawFiles = $request->file('design');
            $files    = is_array($rawFiles) ? $rawFiles : [$rawFiles];

            $uploadedUrls = [];
            foreach ($files as $file) {
                if ($file->getSize() > 20 * 1024 * 1024) {
                    return response()->json(['message' => 'Each file must be under 20 MB.'], 422);
                }
                $response = Http::attach(
                    'file',
                    file_get_contents($file->getPathname()),
                    $file->getClientOriginalName()
                )->post("https://api.cloudinary.com/v1_1/{$cloudName}/auto/upload", [
                    'upload_preset' => $uploadPreset,
                    'folder'        => 'pmp-admin-designs',
                ]);

                if (!$response->successful()) {
                    Log::warning('adminUploadDesign: Cloudinary error', ['body' => $response->body()]);
                    return response()->json(['message' => 'Failed to upload design to Cloudinary.'], 500);
                }

                $uploadedUrls[] = $response->json()['secure_url'];
            }

            $adminDesignUrl  = $uploadedUrls[0];
            $adminDesignUrls = $uploadedUrls;

            $history                = $order->statusHistory ?? [];
            $history[]              = ['status' => 'proof_sent', 'at' => now()->toISOString()];
            $order->adminDesignUrl  = $adminDesignUrl;
            $order->adminDesignUrls = $adminDesignUrls;
            $order->designStatus   = 'draft_ready';
            $order->orderStatus    = 'proof_sent';
            $order->statusHistory  = $history;
            $order->updatedAt      = now();
            $order->save();

            try { broadcast(new \App\Events\OrderStatusUpdated((string) $order->_id, 'proof_sent', null)); } catch (\Throwable) {}

            try {
                Notification::create([
                    'user_id'    => (string) $order->userId,
                    'type'       => 'design_draft_ready',
                    'title'      => 'Your Design Draft is Ready!',
                    'message'    => 'Your custom design for order #' .
                        strtoupper(substr((string) $order->_id, -8)) .
                        ' is ready for review. Open your order to view it.',
                    'is_read'    => false,
                    'data'       => [
                        'orderId'         => (string) $order->_id,
                        'designStatus'    => 'draft_ready',
                        'adminDesignUrl'  => $adminDesignUrl,
                        'adminDesignUrls' => $adminDesignUrls,
                    ],
                    'created_at' => now(),
                ]);
            } catch (\Exception $notifErr) {
                Log::warning('adminUploadDesign: notification failed', ['error' => $notifErr->getMessage()]);
            }

            try {
                ActivityLog::create([
                    'action'           => 'design_draft_uploaded',
                    'entityType'       => 'order',
                    'entityId'         => (string) $order->_id,
                    'description'      => 'Design draft uploaded for order #' .
                        strtoupper(substr((string) $order->_id, -8)),
                    'performedBy'      => trim("{$user->firstName} {$user->lastName}"),
                    'performedByEmail' => $user->email ?? null,
                    'metadata'         => ['orderId' => (string) $order->_id],
                    'createdAt'        => now(),
                ]);
            } catch (\Exception $logErr) {
                Log::warning('ActivityLog write failed (adminUploadDesign)', ['error' => $logErr->getMessage()]);
            }

            return $this->successResponse('Design draft uploaded. Customer has been notified.', $order);

        } catch (\Illuminate\Validation\ValidationException $e) {
            return $this->validationErrorResponse($e);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'Failed to upload design draft.');
        }
    }

    public function approveUploadDesign(Request $request, $id)
    {
        try {
            $user = $request->user();
            if (!$user || !in_array($user->role, ['admin', 'owner'])) {
                return $this->unauthorizedResponse();
            }

            $order = Order::find($id);
            if (!$order) return $this->notFoundResponse('Order');

            $history   = $order->statusHistory ?? [];
            $history[] = ['status' => 'awaiting_payment', 'at' => now()->toISOString(), 'by' => 'admin', 'note' => 'Upload approved — awaiting customer payment'];
            $order->orderStatus   = 'awaiting_payment';
            $order->statusHistory = $history;
            $order->updatedAt     = now();
            $order->save();

            try { broadcast(new \App\Events\OrderStatusUpdated((string) $order->_id, 'awaiting_payment', null)); } catch (\Throwable) {}

            try {
                Notification::create([
                    'user_id' => (string) $order->userId,
                    'type'    => 'upload_approved',
                    'title'   => 'Your Design Was Approved!',
                    'message' => 'Your uploaded design for order #' .
                        strtoupper(substr((string) $order->_id, -8)) .
                        ' has been approved. Please complete your payment to begin production.',
                    'is_read' => false,
                    'data'    => ['orderId' => (string) $order->_id],
                    'created_at' => now(),
                ]);
            } catch (\Exception $e) {
                Log::warning('approveUploadDesign: notification failed', ['error' => $e->getMessage()]);
            }

            return $this->successResponse('Upload approved. Customer notified to complete payment.', $order);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'Failed to approve upload.');
        }
    }
}