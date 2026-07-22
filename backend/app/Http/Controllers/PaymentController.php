<?php

namespace App\Http\Controllers;

use App\Models\Order;
use App\Models\OrderRequest;
use App\Models\Voucher;
use App\Models\Product;
use App\Models\Inventory;
use App\Models\StockHistory;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use App\Models\ActivityLog;
use App\Models\FlashSale;
use App\Models\Notification;
use App\Models\User;
use App\Models\SiteContent;
use App\Services\PriceResolver;
use App\Support\OrderStatus;

class PaymentController extends Controller
{
    private string $secretKey;
    private string $baseUrl = 'https://api.paymongo.com/v1';

    public function __construct()
    {
        $this->secretKey = config('services.paymongo.secret_key', '');
    }

    private function resolveCustomOrderStatus($request): string
    {
        $isCustom   = filter_var($request->input('isCustomOrder', false), FILTER_VALIDATE_BOOLEAN);
        $designType = $request->input('designType');
        // Fulfillment only. awaiting_production was wrong (it normalises to Processing and
        // claimed production before anyone had looked at the artwork), but so was
        // pending_review - it is not a canonical code, so the admin's transition table had
        // no entry for it and the order could not be moved at all. The design stage lives
        // in designStatus, exactly as OrderStatus documents.
        return OrderStatus::PENDING;
    }

    /**
     * Resolve the Bill of Materials for one order line.
     *
     * Multi-variant products carry a PER-VARIANT BOM (bomGroupName + the variant's
     * BOM id); single products carry one bomId. Stock pre-validation already handled
     * both, but the deduction pass checked `bomId` only — so per-variant products were
     * validated and then never deducted, silently drifting inventory away from reality.
     * Both passes now resolve through here so they can't disagree again.
     */
    private function resolveBom($product, $variantId = null)
    {
        return $product ? $product->resolveBom($variantId) : null;
    }

    /**
     * True unless the owner has explicitly disabled this method in Homepage CMS
     * → Payment Methods (SiteContent key 'payment_methods'). Missing key = enabled.
     */
    private function paymentMethodEnabled(string $type): bool
    {
        $row     = SiteContent::where('key', 'payment_methods')->first();
        $enabled = $row?->data['enabled'] ?? null;
        if ($enabled instanceof \MongoDB\Model\BSONDocument) $enabled = $enabled->getArrayCopy();
        if (!is_array($enabled)) return true;
        return ($enabled[$type] ?? true) !== false;
    }

    /**
     * POST /api/payment/create-link
     *
     * Atomic: creates Order (unpaid) + PayMongo Payment Link.
     * Returns { orderId, checkoutUrl } to frontend.
     * Frontend redirects customer to checkoutUrl.
     */
    public function createLink(Request $request)
    {
        try {
            $user = $request->user();
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
                'voucherCode'                 => 'nullable|string|max:50',
                'notes'                       => 'nullable|string|max:1000',
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
                'deliveryAddress.delivery_notes' => 'nullable|string|max:300',
                'design_file'                 => 'nullable|file|mimes:jpeg,jpg,png,webp,pdf|max:10240',
                'design_notes'                => 'nullable|string|max:2000',
                'shippingFee'                 => 'nullable|numeric|min:0|max:10000',
            ]);

            // ── Resolve prices + build order items ────────────────────
            $orderItems               = [];
            $totalAmount              = 0;
            $pendingFlashSaleIncrements = [];

            foreach ($validated['items'] as $item) {
                $product = Product::where('_id', $item['productId'])
                                  ->where('isActive', true)
                                  ->first();

                if (!$product) {
                    return $this->errorResponse(
                        "Product '{$item['productId']}' not found or unavailable.",
                        422
                    );
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
                    return $this->errorResponse(
                        "No price configured for product '{$product->name}'.",
                        422
                    );
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
                    'isMadeToOrder' => (bool) ($product->isMadeToOrder ?? false),
                    'thumbnail'   => $thumb,
                    'variantId'   => $variantId,
                    'variantName' => $item['variantName'] ?? null,
                    'qty'         => $qty,
                    'unitPrice'   => $unitPrice,
                    'lineTotal'   => $lineTotal,
                    'flashSaleId' => $flashSaleId,
                ];
            }

            // ── Handle design file upload ─────────────────────────────
            $designFilePath = null;
            if ($request->hasFile('design_file') && $request->file('design_file')->isValid()) {
                try {
                    $designFilePath = $request->file('design_file')
                        ->store('designs', 'public');
                } catch (\Exception $fileErr) {
                    Log::warning('Design file upload failed', [
                        'error'  => $fileErr->getMessage(),
                        'userId' => (string) $user->_id,
                    ]);
                    // Non-fatal — order proceeds without file
                }
            }

            // Add shipping fee to total
            $shippingFee  = (float) ($validated['shippingFee'] ?? 0);
            $totalAmount += $shippingFee;

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

            // ── Idempotency: check for existing unpaid order (same user, same items, last 5 min) ──
            $itemIds = collect($validated['items'])->pluck('productId')->sort()->values()->toArray();
            $recentOrder = Order::where('userId', (string) $user->_id)
                ->where('paymentStatus', 'unpaid')
                ->where('paymentMethod', 'online')
                ->where('createdAt', '>=', now()->subMinutes(30))
                ->latest('createdAt')
                ->first();

            if ($recentOrder) {
                $existingIds = collect($recentOrder->items ?? [])->pluck('productId')->sort()->values()->toArray();
                if ($existingIds === $itemIds && $recentOrder->checkoutUrl) {
                    return $this->successResponse('Existing payment link reused.', [
                        'orderId'     => (string) $recentOrder->_id,
                        'checkoutUrl' => $recentOrder->checkoutUrl,
                    ]);
                }
            }

            // ── Pre-validate BOM products ──────────────────────────────
            foreach ($orderItems as $item) {
                $bomProd   = \App\Models\Product::find($item['productId'] ?? null);
                $itemQty   = (int) ($item['qty'] ?? 1);
                $variantId = $item['variantId'] ?? null;
                if (!$bomProd) continue;
                $bom = $this->resolveBom($bomProd, $variantId);
                if (!$bom || empty($bom->components)) continue;
                if (!empty($bomProd->bomGroupName) && $variantId) {
                    $variantCap = isset($bomProd->variantStock[$variantId]) && (int) $bomProd->variantStock[$variantId] > 0
                        ? (int) $bomProd->variantStock[$variantId] : null;
                    if ($variantCap !== null && $itemQty > $variantCap)
                        return $this->errorResponse("\"{$bomProd->name}\" has a storefront cap of {$variantCap} unit(s) for that variant.", 422);
                } elseif ($bomProd->storeStockCap !== null && $itemQty > (int) $bomProd->storeStockCap) {
                    return $this->errorResponse("\"{$bomProd->name}\" has a storefront limit of {$bomProd->storeStockCap} unit(s).", 422);
                }
                $canProduce = PHP_INT_MAX;
                foreach ($bom->components as $component) {
                    $rawInv = Inventory::find($component['inventoryId'] ?? null);
                    if (!$rawInv || $rawInv->isOnDemand) continue;
                    $qpu = (float) ($component['qty'] ?? 0);
                    if ($qpu <= 0) continue;
                    $canProduce = min($canProduce, (int) floor(max(0, (int) ($rawInv->stockQty ?? 0) - (int) ($rawInv->reservedQty ?? 0)) / $qpu));
                }
                if ($canProduce !== PHP_INT_MAX && $itemQty > $canProduce)
                    return $this->errorResponse("\"{$bomProd->name}\" can only produce {$canProduce} unit(s) with current materials.", 422);
            }

            // ── Atomic stock reservation BEFORE order creation ──────────
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
                ];
            }

            // ── Create order (paymentStatus: unpaid) ──────────────────
            $order = Order::create([
                'userId'          => (string) $user->_id,
                'userSnapshot'    => [
                    'name'  => trim("{$user->firstName} {$user->lastName}"),
                    'email' => $user->email,
                    'phone' => $user->phoneNumber ?? '',
                ],
                'items'           => $orderItems,
                'totalAmount'     => $totalAmount,
                'shippingFee'     => $shippingFee,
                'discountAmount'  => $discountAmount > 0 ? $discountAmount : null,
                'voucherCode'     => $appliedVoucher?->code ?? null,
                'orderStatus'     => 'Pending',
                'paymentStatus'   => 'unpaid',
                'paymentMethod'   => 'online',
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
                        'remarks'      => 'Order: ' . (string) $order->_id,
                        'createdAt'    => now(),
                    ]);
                } catch (\Exception $e) {
                    Log::warning('createLink: StockHistory write failed', ['error' => $e->getMessage()]);
                }
            }

            // BOM material deduction at order creation
            foreach ($orderItems as $item) {
                $bomProd = \App\Models\Product::find($item['productId'] ?? null);
                if (!$bomProd) continue;
                try {
                    // Must resolve the SAME way pre-validation did (per-variant BOMs
                    // included), otherwise validated stock is never actually deducted.
                    $bom = $this->resolveBom($bomProd, $item['variantId'] ?? null);
                    if ($bom && !empty($bom->components)) {
                        foreach ($bom->components as $component) {
                            $rawInv = Inventory::find($component['inventoryId'] ?? null);
                            if (!$rawInv || $rawInv->isOnDemand) continue;
                            $deductQty = (int) round(($component['qty'] ?? 0) * ($item['qty'] ?? 1));
                            if ($deductQty <= 0) continue;
                            $updatedRaw = DB::connection('mongodb')->getCollection('inventories')
                                ->findOneAndUpdate(
                                    ['_id' => new \MongoDB\BSON\ObjectId((string) $rawInv->_id)],
                                    ['$inc' => ['stockQty' => -$deductQty]],
                                    ['returnDocument' => \MongoDB\Operation\FindOneAndUpdate::RETURN_DOCUMENT_AFTER]
                                );
                            $newRawQty = (int) ($updatedRaw->stockQty ?? max(0, ($rawInv->stockQty ?? 0) - $deductQty));
                            StockHistory::create([
                                'inventoryId' => (string) $rawInv->_id, 'quantity' => $deductQty,
                                'remainingQty' => $newRawQty, 'unitCost' => $rawInv->averageCost ?? 0,
                                'totalCost' => 0, 'reason' => 'sale_reserved', 'type' => 'deduction',
                                'performedBy' => 'system', 'remarks' => 'Order: ' . (string) $order->_id,
                                'createdAt' => now(),
                            ]);
                        }
                    }
                } catch (\Exception $bomErr) {
                    Log::warning('createLink: BOM deduction failed', [
                        'orderId' => (string) $order->_id, 'productId' => $item['productId'],
                        'error' => $bomErr->getMessage(),
                    ]);
                }
            }

            $orderId     = (string) $order->_id;
            $frontendUrl = config('app.frontend_url', 'http://localhost:3000');
            $amountInCentavos = (int) round($totalAmount * 100);

            // ── Build PayMongo line items ─────────────────────────────────
            // Show per-product breakdown when no voucher discount (amounts must sum to total).
            // Fall back to a single bundled item when a voucher reduces the total.
            if ($discountAmount > 0) {
                $pmLineItems = [[
                    'currency' => 'PHP',
                    'amount'   => $amountInCentavos,
                    'name'     => 'Order #' . strtoupper(substr($orderId, -8)) . ' (' . count($orderItems) . ' item' . (count($orderItems) !== 1 ? 's' : '') . ')',
                    'quantity' => 1,
                ]];
            } else {
                $pmLineItems = array_map(function ($item) {
                    $lineItem = [
                        'currency' => 'PHP',
                        'amount'   => (int) round(($item['unitPrice'] ?? 0) * 100),
                        'name'     => ($item['productName'] ?? 'Product') . ($item['variantName'] ? ' — ' . $item['variantName'] : ''),
                        'quantity' => (int) ($item['qty'] ?? 1),
                    ];
                    if (!empty($item['thumbnail'])) {
                        $lineItem['images'] = [$item['thumbnail']];
                    }
                    return $lineItem;
                }, $orderItems);
            }

            // Delivery fee — only shown when a real fee is set (manually booked courier).
            // Omitted entirely when 0 so PayMongo does not display a ₱0 fee row.
            if ($shippingFee > 0) {
                $pmLineItems[] = [
                    'currency' => 'PHP',
                    'amount'   => (int) round($shippingFee * 100),
                    'name'     => 'Delivery Fee',
                    'quantity' => 1,
                ];
            }

            // ── Create PayMongo Checkout Session (/v1/checkout_sessions) ──
            $response = Http::withBasicAuth($this->secretKey, '')
                ->post("{$this->baseUrl}/checkout_sessions", [
                    'data' => [
                        'attributes' => [
                            'billing'              => [
                                'name'  => $order->userSnapshot['name'] ?? '',
                                'email' => $order->userSnapshot['email'] ?? '',
                                'phone' => (function ($p) {
                                    $p = preg_replace('/\s+/', '', $p ?? '');
                                    $p = preg_replace('/^\+?63/', '', $p);
                                    return ltrim($p, '0');
                                })($order->userSnapshot['phone'] ?? ($validated['deliveryAddress']['phone'] ?? '')),
                            ],
                            'reference_number'     => (string) $orderId,
                            'payment_method_types' => ['gcash', 'paymaya', 'card'],
                            'line_items'           => $pmLineItems,
                            'redirect'    => [
                                'success' => "{$frontendUrl}/shop/payment-success?id={$orderId}",
                                'failed'  => "{$frontendUrl}/shop/payment-failed?id={$orderId}",
                            ],
                            'cancel_url'  => "{$frontendUrl}/shop/checkout?payment_cancelled=1",
                        ],
                    ],
                ]);

            if (!$response->successful()) {
                // Order exists but link failed — log, order stays unpaid
                Log::error('PayMongo createLink failed', [
                    'order_id' => $orderId,
                    'status'   => $response->status(),
                    'body'     => $response->body(),
                ]);
                return $this->errorResponse(
                    'Payment gateway error. Please try again.',
                    502
                );
            }

            $linkData    = $response->json();
            $checkoutUrl = $linkData['data']['attributes']['checkout_url']
                        ?? $linkData['data']['attributes']['url']
                        ?? null;
            $linkId      = $linkData['data']['id'] ?? null;

            if (!$checkoutUrl) {
                Log::error('PayMongo createLink: no checkout_url', [
                    'order_id' => $orderId,
                    'body'     => $linkData,
                ]);
                return $this->errorResponse(
                    'Payment gateway returned an invalid response.',
                    502
                );
            }

            // Store PayMongo link reference on order
            $order->paymongoLinkId = $linkId;
            $order->checkoutUrl    = $checkoutUrl;
            $order->save();

            return $this->successResponse('Payment link created.', [
                'orderId'     => $orderId,
                'checkoutUrl' => $checkoutUrl,
            ]);

        } catch (\Illuminate\Validation\ValidationException $e) {
            return $this->validationErrorResponse($e);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'Failed to create payment link.');
        }
    }

    /**
     * POST /api/payment/initiate
     *
     * Custom payment flow using Payment Intents — bypasses PayMongo hosted checkout.
     * paymentType: gcash | paymaya | card
     * paymentMethodId: card PM ID created client-side with the public key (card only)
     */
    public function initiatePayment(Request $request)
    {
        try {
            $user = $request->user();
            if (!$user) return $this->unauthorizedResponse();

            $validated = $request->validate([
                'items'                       => 'required|array|min:1',
                'items.*.productId'           => 'required|string',
                'items.*.variantId'           => 'nullable|string',
                'items.*.variantName'         => 'nullable|string',
                'items.*.qty'                 => 'required|integer|min:1',
                'items.*.flashSaleId'         => 'nullable|string|max:24',
                'voucherCode'                 => 'nullable|string|max:50',
                'notes'                       => 'nullable|string|max:1000',
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
                'deliveryAddress.delivery_notes' => 'nullable|string|max:300',
                'design_notes'                => 'nullable|string|max:2000',
                'shippingFee'                 => 'nullable|numeric|min:0|max:10000',
                'paymentType'                 => 'required|in:gcash,paymaya,card',
                'paymentMethodId'             => 'nullable|string',
                'eWalletPhone'                => 'nullable|string|max:20',
                'isCustomOrder'               => 'nullable|boolean',
                // Without these the checkout's "Pay 50% now" was decoration - the customer
                // was shown ₱528.94 and charged the full ₱1,057.88.
                'isDownpayment'               => 'nullable|boolean',
                'downpaymentPercent'          => 'nullable|integer|min:1|max:100',
                'designType'                  => 'nullable|string|in:upload,request',
                'items.*.designRequested'     => 'nullable|boolean',
                'items.*.designFee'           => 'nullable|numeric|min:0',
                // Each cart line carries its own artwork now. Without these the design was
                // accepted at checkout and then dropped on the floor when the order was
                // built - the customer paid and the store never saw which file went where.
                'items.*.designUrl'           => 'nullable|string|max:600',
                'items.*.designName'          => 'nullable|string|max:255',
                'items.*.designNotes'         => 'nullable|string|max:2000',
                'items.*.designFiles'         => 'nullable|array|max:5',
                'items.*.designFiles.*.url'   => 'required_with:items.*.designFiles|string|max:600',
                'items.*.designFiles.*.name'  => 'nullable|string|max:255',
                'isDesignFeeOnly'             => 'nullable|boolean',
            ]);

            $paymentType      = $validated['paymentType'];
            if (!$this->paymentMethodEnabled($paymentType)) {
                return $this->errorResponse('This payment method is currently unavailable. Please choose another.', 422);
            }
            $isDesignFeeOnly  = filter_var($request->input('isDesignFeeOnly', false), FILTER_VALIDATE_BOOLEAN);

            // ── Resolve prices + build order items ────────────────────
            $orderItems               = [];
            $totalAmount              = 0;
            $pendingFlashSaleIncrements = [];
            $firstProduct             = null;

            foreach ($validated['items'] as $item) {
                $product = Product::where('_id', $item['productId'])
                                  ->where('isActive', true)
                                  ->first();

                if (!$product) {
                    return $this->errorResponse("Product '{$item['productId']}' not found or unavailable.", 422);
                }

                if (!$firstProduct) $firstProduct = $product;

                $qty         = (int) $item['qty'];
                $variantId   = $item['variantId'] ?? null;
                $flashSaleId = isset($item['flashSaleId']) && $item['flashSaleId'] !== '' ? $item['flashSaleId'] : null;
                $appliedFlashSale = null;

                if ($flashSaleId) {
                    $fs = FlashSale::live()
                        ->where('_id', $flashSaleId)
                        ->where('productId', (string) $product->_id)
                        ->first();
                    if ($fs && ($fs->stockLimit === null || ($fs->stockUsed ?? 0) < $fs->stockLimit)) {
                        $appliedFlashSale = $fs;
                    }
                }

                $unitPrice = PriceResolver::resolve($product, $qty, $variantId, $appliedFlashSale);
                if ($unitPrice === null) {
                    return $this->errorResponse("No price configured for product '{$product->name}'.", 422);
                }

                $lineTotal    = $unitPrice * $qty;
                $totalAmount += $lineTotal;

                if ($appliedFlashSale) $pendingFlashSaleIncrements[] = [$appliedFlashSale, $qty];

                $variantImageUrls = (array) ($product->variantImageUrls ?? []);
                $rawThumb = ($variantId && !empty($variantImageUrls[$variantId]))
                    ? $variantImageUrls[$variantId]
                    : ($product->thumbnail ?? null);
                $thumb = $rawThumb
                    ? (str_starts_with($rawThumb, 'http') ? $rawThumb : asset('storage/' . $rawThumb))
                    : null;

                $orderItems[] = [
                    'productId'       => (string) $product->_id,
                    'productName'     => $product->name,
                    'isCustom'        => (bool) $product->isCustom,
                    'isMadeToOrder'   => (bool) ($product->isMadeToOrder ?? false),
                    'thumbnail'       => $thumb,
                    'variantId'       => $variantId,
                    'variantName'     => $item['variantName'] ?? null,
                    'qty'             => $qty,
                    'unitPrice'       => $unitPrice,
                    'lineTotal'       => $lineTotal,
                    'flashSaleId'     => $flashSaleId,
                    'designRequested' => (bool) ($item['designRequested'] ?? false),
                    'designFee'       => isset($item['designFee']) ? (float) $item['designFee'] : null,
                    'designUrl'       => $item['designUrl']   ?? null,
                    'designName'      => $item['designName']  ?? null,
                    'designNotes'     => $item['designNotes'] ?? null,
                    // Up to five files per line - one design for the ladies, one for the
                    // gents. designUrl above stays the first of them.
                    'designFiles'     => $item['designFiles'] ?? null,
                    'designStatus'    => !empty($item['designUrl']) ? 'pending_review' : null,
                ];
            }

            $requiresDownpayment = (bool) ($firstProduct?->requiresDownpayment ?? false);
            $orderDownpaymentPct = $requiresDownpayment ? (int) ($firstProduct?->downpaymentPercent ?? 0) : 0;

            // ONE design fee for the order - the same rule the cart and checkout display.
            // It was shown to the customer and then never charged: the storefront quoted
            // ₱1,157.88 and PayMongo collected ₱1,057.88, so every request-design order
            // gave the artwork away for free.
            $orderDesignFee = 0.0;
            $designLines = array_filter(
                $validated['items'],
                fn($i) => filter_var($i['designRequested'] ?? false, FILTER_VALIDATE_BOOLEAN)
            );
            if (count($designLines) > 0) {
                $storeFee = (float) (User::where('role', 'owner')->first()->designRequestFee ?? 100);
                $lineFees = array_map(fn($i) => (float) ($i['designFee'] ?? 0), $designLines);
                // Highest wins, once. Summing it charged a fee per product, which is the
                // opposite of "one artwork across a mug and a totebag is one piece of work".
                $orderDesignFee = round(max($storeFee, ...$lineFees), 2);
            }
            // The order still records the full value of the goods; isDesignFeeOnly only
            // changes what is collected NOW.
            $totalAmount += $orderDesignFee;

            $shippingFee  = (float) ($validated['shippingFee'] ?? 0);
            $totalAmount += $shippingFee;

            // ── Voucher ───────────────────────────────────────────────
            $discountAmount = 0.0;
            $appliedVoucher = null;

            if (!empty($validated['voucherCode'])) {
                $voucherCode = strtoupper(trim($validated['voucherCode']));
                $userId      = (string) $user->_id;
                $voucher     = Voucher::where('code', $voucherCode)->first();

                $preValid = $voucher && $voucher->isActive
                    && (!$voucher->expiresAt || $voucher->expiresAt >= now())
                    && ($voucher->maxUses === null || $voucher->usedCount < $voucher->maxUses)
                    && !in_array($userId, $voucher->usedBy ?? [], true)
                    && ($voucher->minOrderAmount === null || $totalAmount >= $voucher->minOrderAmount);

                if ($preValid) {
                    $discountAmount = $voucher->discountType === 'percentage'
                        ? round($totalAmount * $voucher->discountValue / 100, 2)
                        : min((float) $voucher->discountValue, $totalAmount);

                    $filter = ['code' => $voucherCode, 'isActive' => true, 'usedBy' => ['$nin' => [$userId]]];
                    if ($voucher->maxUses !== null) $filter['$expr'] = ['$lt' => ['$usedCount', '$maxUses']];

                    $claimed = DB::connection('mongodb')->getCollection('vouchers')->findOneAndUpdate(
                        $filter,
                        ['$inc' => ['usedCount' => 1], '$addToSet' => ['usedBy' => $userId]],
                        ['returnDocument' => \MongoDB\Operation\FindOneAndUpdate::RETURN_DOCUMENT_AFTER]
                    );

                    if ($claimed) { $totalAmount = max(0, $totalAmount - $discountAmount); $appliedVoucher = $voucher; }
                    else { $discountAmount = 0.0; }
                }
            }

            // ── Pre-validate BOM products ──────────────────────────────
            foreach ($orderItems as $item) {
                $bomProd   = \App\Models\Product::find($item['productId'] ?? null);
                $itemQty   = (int) ($item['qty'] ?? 1);
                $variantId = $item['variantId'] ?? null;
                if (!$bomProd) continue;
                $bom = $this->resolveBom($bomProd, $variantId);
                if (!$bom || empty($bom->components)) continue;
                if (!empty($bomProd->bomGroupName) && $variantId) {
                    $variantCap = isset($bomProd->variantStock[$variantId]) && (int) $bomProd->variantStock[$variantId] > 0
                        ? (int) $bomProd->variantStock[$variantId] : null;
                    if ($variantCap !== null && $itemQty > $variantCap)
                        return $this->errorResponse("\"{$bomProd->name}\" has a storefront cap of {$variantCap} unit(s) for that variant.", 422);
                } elseif ($bomProd->storeStockCap !== null && $itemQty > (int) $bomProd->storeStockCap) {
                    return $this->errorResponse("\"{$bomProd->name}\" has a storefront limit of {$bomProd->storeStockCap} unit(s).", 422);
                }
                $canProduce = PHP_INT_MAX;
                foreach ($bom->components as $component) {
                    $rawInv = Inventory::find($component['inventoryId'] ?? null);
                    if (!$rawInv || $rawInv->isOnDemand) continue;
                    $qpu = (float) ($component['qty'] ?? 0);
                    if ($qpu <= 0) continue;
                    $canProduce = min($canProduce, (int) floor(max(0, (int) ($rawInv->stockQty ?? 0) - (int) ($rawInv->reservedQty ?? 0)) / $qpu));
                }
                if ($canProduce !== PHP_INT_MAX && $itemQty > $canProduce)
                    return $this->errorResponse("\"{$bomProd->name}\" can only produce {$canProduce} unit(s) with current materials.", 422);
            }

            $stockReservations = [];
            foreach ($orderItems as $item) {
                $prod = Product::find($item['productId'] ?? null);
                if (!$prod || !$prod->inventoryId) continue;
                $inv = Inventory::find($prod->inventoryId);
                if (!$inv || $inv->isOnDemand) continue;

                $qty     = (int) $item['qty'];
                $updated = DB::connection('mongodb')->getCollection('inventories')->findOneAndUpdate(
                    ['_id' => new \MongoDB\BSON\ObjectId((string) $inv->_id), 'stockQty' => ['$gte' => $qty]],
                    ['$inc' => ['stockQty' => -$qty]],
                    ['returnDocument' => \MongoDB\Operation\FindOneAndUpdate::RETURN_DOCUMENT_AFTER]
                );

                if ($updated === null) {
                    foreach ($stockReservations as $r) {
                        DB::connection('mongodb')->getCollection('inventories')
                            ->updateOne(['_id' => new \MongoDB\BSON\ObjectId($r['invId'])], ['$inc' => ['stockQty' => $r['qty']]]);
                    }
                    return $this->errorResponse("\"{$prod->name}\" only has {$inv->stockQty} item(s) in stock.", 422);
                }

                $stockReservations[] = [
                    'invId' => (string) $inv->_id, 'qty' => $qty,
                    'newStockQty' => (int) ($updated->stockQty ?? 0), 'unitCost' => (float) ($inv->averageCost ?? 0),
                ];
            }

            // ── Proof gate ────────────────────────────────────────────
            // A cart order derives these from its own lines. Read only from the request,
            // they stayed false/null, so a multi-item custom order slipped past the
            // approval gate in JobOrderController and went to production unreviewed.
            $anyCustom    = false;
            $anyUploaded  = false;
            $anyRequested = false;
            $firstDesign  = null;
            foreach ($orderItems as $oi) {
                if (!empty($oi['isCustom']))        $anyCustom = true;
                if (!empty($oi['designRequested'])) $anyRequested = true;
                if (!empty($oi['designUrl'])) {
                    $anyUploaded = true;
                    $firstDesign = $firstDesign ?? $oi['designUrl'];
                }
            }
            // Computed here because the order is written before the charge is built, and
            // the webhook reads pendingPaymentType/Amount to record a partial payment.
            $payDownpaymentNow = filter_var($request->input('isDownpayment', false), FILTER_VALIDATE_BOOLEAN);
            $dpPctRequested    = (int) $request->input('downpaymentPercent', 0);
            $takesDownpayment  = $payDownpaymentNow && $dpPctRequested > 0 && $dpPctRequested < 100;

            $isCustomOrder = filter_var($request->input('isCustomOrder', false), FILTER_VALIDATE_BOOLEAN) || $anyCustom;
            // Uploaded artwork waits for the store to check it. Requested artwork has
            // nothing to check yet - the store draws it, then the customer approves.
            $orderDesignStatus = $anyUploaded ? 'pending_review' : null;
            $orderDesignType   = $request->input('designType')
                ?? ($anyUploaded ? 'upload' : ($anyRequested ? 'request' : null));

            // ── Create order ──────────────────────────────────────────
            $order = Order::create([
                'userId'          => (string) $user->_id,
                'userSnapshot'    => ['name' => trim("{$user->firstName} {$user->lastName}"), 'email' => $user->email, 'phone' => $user->phoneNumber ?? ''],
                'items'           => $orderItems,
                'totalAmount'     => $totalAmount,
                'shippingFee'     => $shippingFee,
                'discountAmount'  => $discountAmount > 0 ? $discountAmount : null,
                'voucherCode'     => $appliedVoucher?->code ?? null,
                'orderStatus'     => $this->resolveCustomOrderStatus($request),
                'paymentStatus'   => 'unpaid',
                'paymentMethod'   => $paymentType,
                'notes'           => htmlspecialchars(strip_tags(trim($validated['notes'] ?? '')), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'),
                'deliveryAddress' => $validated['deliveryAddress'] ?? null,
                'designNotes'     => isset($validated['design_notes']) ? htmlspecialchars(strip_tags(trim($validated['design_notes'])), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') : null,
                'isCustomOrder'        => $isCustomOrder,
                'designType'           => $orderDesignType,
                // Mirrored at order level so the existing approve / reject / re-upload
                // screens and the production gate all see a cart order too.
                'designFilePath'       => $firstDesign,
                'designStatus'         => $orderDesignStatus,
                'isDesignFeeOnly'      => $isDesignFeeOnly,
                'designFee'            => $orderDesignFee > 0 ? $orderDesignFee : null,
                'requiresDownpayment'  => $requiresDownpayment,
                'downpaymentPercent'   => $orderDownpaymentPct > 0 ? $orderDownpaymentPct : null,
                // Tells the webhook this payment settles only part of the order, so it
                // records paymentStatus = partial with a real remaining balance instead of
                // marking a half-paid order as fully paid.
                'pendingPaymentType'   => $takesDownpayment ? 'downpayment' : null,
                'pendingPaymentAmount' => $takesDownpayment ? round($totalAmount * $dpPctRequested / 100, 2) : null,
                'statusHistory'        => [['status' => $this->resolveCustomOrderStatus($request), 'at' => now()->toISOString()]],
                'createdAt'       => now(),
                'updatedAt'       => now(),
            ]);

            foreach ($pendingFlashSaleIncrements as [$fs, $qty]) $fs->increment('stockUsed', $qty);

            $orderId = (string) $order->_id;

            foreach ($stockReservations as $r) {
                try {
                    StockHistory::create([
                        'inventoryId' => $r['invId'], 'quantity' => $r['qty'], 'remainingQty' => $r['newStockQty'],
                        'unitCost' => $r['unitCost'], 'totalCost' => $r['unitCost'] * $r['qty'],
                        'reason' => 'sale_reserved', 'type' => 'deduction', 'performedBy' => 'system',
                        'remarks' => 'Order: ' . $orderId, 'createdAt' => now(),
                    ]);
                } catch (\Exception $e) {
                    Log::warning('initiatePayment: StockHistory failed', ['error' => $e->getMessage()]);
                }
            }

            // BOM material deduction at order creation
            foreach ($orderItems as $item) {
                $bomProd   = \App\Models\Product::find($item['productId'] ?? null);
                $variantId = $item['variantId'] ?? null;
                if (!$bomProd) continue;
                try {
                    $bom = $this->resolveBom($bomProd, $variantId);
                    if (!$bom || empty($bom->components)) continue;
                    // Made-to-order / custom items RESERVE now (consumed at QC pass via the JO);
                    // stocked ready-made items DEDUCT now.
                    $producedItem = (bool) ($bomProd->isMadeToOrder ?? false) || (bool) ($bomProd->isCustom ?? false);
                    foreach ($bom->components as $component) {
                        $rawInv = Inventory::find($component['inventoryId'] ?? null);
                        if (!$rawInv || $rawInv->isOnDemand) continue;
                        $deductQty = (int) round(($component['qty'] ?? 0) * ($item['qty'] ?? 1));
                        if ($deductQty <= 0) continue;
                        if ($producedItem) {
                            $rawInv->reservedQty = (int) ($rawInv->reservedQty ?? 0) + $deductQty;
                            $rawInv->save();
                            StockHistory::create([
                                'inventoryId'  => (string) $rawInv->_id,
                                'quantity'     => $deductQty,
                                'remainingQty' => (int) ($rawInv->stockQty ?? 0),
                                'unitCost'     => $rawInv->averageCost ?? 0,
                                'totalCost'    => 0,
                                'reason'       => 'production_reserved',
                                'type'         => 'reservation',
                                'orderId'      => (string) $order->_id,
                                'productId'    => $item['productId'] ?? null,
                                'productName'  => $bomProd->name ?? '',
                                'customerName' => trim(($user->firstName ?? '') . ' ' . ($user->lastName ?? '')),
                                'performedBy'  => 'system',
                                'remarks'      => 'Reserved for production: ' . (string) $order->_id,
                                'createdAt'    => now(),
                            ]);
                            continue;
                        }
                        $updatedRaw = DB::connection('mongodb')->getCollection('inventories')
                            ->findOneAndUpdate(
                                ['_id' => new \MongoDB\BSON\ObjectId((string) $rawInv->_id)],
                                ['$inc' => ['stockQty' => -$deductQty]],
                                ['returnDocument' => \MongoDB\Operation\FindOneAndUpdate::RETURN_DOCUMENT_AFTER]
                            );
                        $newRawQty = (int) ($updatedRaw->stockQty ?? max(0, ($rawInv->stockQty ?? 0) - $deductQty));
                        StockHistory::create([
                            'inventoryId' => (string) $rawInv->_id,
                            'quantity'    => $deductQty,
                            'remainingQty'=> $newRawQty,
                            'unitCost'    => $rawInv->averageCost ?? 0,
                            'totalCost'   => ($rawInv->averageCost ?? 0) * $deductQty,
                            'reason'      => 'sale_reserved',
                            'type'        => 'deduction',
                            'orderId'      => (string) $order->_id,
                            'productId'    => $item['productId'] ?? null,
                            'productName'  => $bomProd->name ?? '',
                            'customerName' => trim(($user->firstName ?? '') . ' ' . ($user->lastName ?? '')),
                            'performedBy'  => 'system',
                            'remarks'      => 'Order: ' . (string) $order->_id,
                            'createdAt'   => now(),
                        ]);
                    }
                } catch (\Exception $bomErr) {
                    Log::warning('initiatePayment: BOM deduction failed', [
                        'orderId' => (string) $order->_id, 'productId' => $item['productId'],
                        'error' => $bomErr->getMessage(),
                    ]);
                }
            }

            $frontendUrl    = config('app.frontend_url', 'http://localhost:3000');
            // One fee for the order, not one per line - a cart holding a mug and a totebag
            // that share a single artwork pays ₱100, not ₱200.
            $designFeeTotal = $isDesignFeeOnly ? $orderDesignFee : 0.0;

            if ($isDesignFeeOnly && $designFeeTotal <= 0) {
                // designFee not set on product — fall back to full amount
                // This prevents charging ₱0 or wrong amount
                Log::warning('initiatePayment: isDesignFeeOnly=true but designFeeTotal=0', [
                    'orderId' => $orderId,
                    'items'   => $validated['items'],
                ]);
                $order->delete(); // remove orphan order
                return $this->errorResponse(
                    'Design fee is not configured for this product. Please contact support.',
                    422
                );
            }

            // Charge what the customer was shown. A downpayment order takes its percentage
            // now; the balance is collected later against the same order.
            $chargeAmount = $isDesignFeeOnly
                ? $designFeeTotal
                : ($takesDownpayment ? round($totalAmount * $dpPctRequested / 100, 2) : $totalAmount);
            $amountCentavos = (int) round($chargeAmount * 100);


            // ── Create Payment Intent ─────────────────────────────────
            $intentRes = Http::withBasicAuth($this->secretKey, '')
                ->post("{$this->baseUrl}/payment_intents", [
                    'data' => ['attributes' => [
                        'amount'                 => $amountCentavos,
                        'payment_method_allowed' => [$paymentType],
                        'payment_method_options' => ['card' => ['request_three_d_secure' => 'any']],
                        'currency'               => 'PHP',
                        'capture_type'           => 'automatic',
                        'description'            => 'Personalize Me Prints — Order #' . strtoupper(substr($orderId, -8)),
                        'metadata'               => ['order_id' => $orderId],
                    ]]
                ]);

            if (!$intentRes->successful()) {
                Log::error('initiatePayment: intent failed', ['order_id' => $orderId, 'body' => $intentRes->body()]);
                return $this->errorResponse('Payment gateway error. Please try again.', 502);
            }

            $intentId = $intentRes->json()['data']['id'];

            // ── Create Payment Method for GCash/Maya (card PM comes from frontend) ──
            $paymentMethodId = $validated['paymentMethodId'] ?? null;

            if ($paymentType !== 'card') {
                $rawPhone = !empty($validated['eWalletPhone'])
                    ? $validated['eWalletPhone']
                    : ($user->phoneNumber ?? ($validated['deliveryAddress']['phone'] ?? ''));
                $phone = preg_replace('/\s+/', '', $rawPhone);
                $phone = ltrim(preg_replace('/^\+?63/', '', $phone), '0');

                $pmRes = Http::withBasicAuth($this->secretKey, '')
                    ->post("{$this->baseUrl}/payment_methods", [
                        'data' => ['attributes' => [
                            'type'    => $paymentType,
                            'billing' => [
                                'name'  => trim("{$user->firstName} {$user->lastName}"),
                                'email' => $user->email,
                                'phone' => $phone,
                            ],
                        ]]
                    ]);

                if (!$pmRes->successful()) {
                    Log::error('initiatePayment: PM failed', ['order_id' => $orderId, 'body' => $pmRes->body()]);
                    return $this->errorResponse('Failed to initialize payment method.', 502);
                }
                $paymentMethodId = $pmRes->json()['data']['id'];
            }

            if (!$paymentMethodId) {
                return $this->errorResponse('Card payment method ID is required.', 422);
            }

            // ── Attach Payment Method to Intent ──────────────────────
            $attachRes = Http::withBasicAuth($this->secretKey, '')
                ->post("{$this->baseUrl}/payment_intents/{$intentId}/attach", [
                    'data' => ['attributes' => [
                        'payment_method' => $paymentMethodId,
                        'return_url'     => "{$frontendUrl}/shop/payment-success?id={$orderId}",
                    ]]
                ]);

            if (!$attachRes->successful()) {
                Log::error('initiatePayment: attach failed', ['order_id' => $orderId, 'body' => $attachRes->body()]);
                return $this->errorResponse('Failed to attach payment. Please try again.', 502);
            }

            $attachData   = $attachRes->json()['data'];
            $intentStatus = $attachData['attributes']['status'];
            $nextAction   = $attachData['attributes']['next_action'] ?? null;
            $redirectUrl  = $nextAction['redirect']['url'] ?? null;

            $order->paymongoIntentId = $intentId;
            $order->save();

            if ($intentStatus === 'succeeded') {
                if ($isDesignFeeOnly) {
                    $order->update([
                        'designFeePaid'       => true,
                        'designFeePaidAmount' => $chargeAmount,
                    ]);
                } else {
                    $order->update(['paymentStatus' => 'paid']);
                }
                return $this->successResponse('Payment completed.', [
                    'orderId' => $orderId, 'status' => 'succeeded', 'redirectUrl' => null,
                ]);
            }

            return $this->successResponse('Payment initiated.', [
                'orderId' => $orderId, 'status' => $intentStatus, 'redirectUrl' => $redirectUrl,
            ]);

        } catch (\Illuminate\Validation\ValidationException $e) {
            return $this->validationErrorResponse($e);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'Failed to initiate payment.');
        }
    }

    /**
     * POST /api/payment/order-request-link
     *
     * Creates a PayMongo checkout session for an order request payment.
     * type = 'downpayment' → charges downPayment amount (50% of finalPrice)
     * type = 'balance'     → charges remaining balance (finalPrice - downPayment)
     *
     * Reference number format: OR-{orderRequestId}-down or OR-{orderRequestId}-bal
     * This prefix allows the webhook to route correctly.
     */
    public function createOrderRequestLink(Request $request)
    {
        try {
            $user = $request->user();
            if (!$user) {
                return $this->unauthorizedResponse();
            }

            $validated = $request->validate([
                'orderRequestId'  => 'required|string|size:24',
                'type'            => 'required|in:downpayment,balance,full',
                'deliveryAddress' => 'nullable|array',
            ]);

            $orderRequest = OrderRequest::find($validated['orderRequestId']);

            if (!$orderRequest) {
                return $this->errorResponse('Order request not found.', 404);
            }

            // Ownership check
            if ((string) $orderRequest->customerId !== (string) $user->_id) {
                return $this->errorResponse('Forbidden.', 403);
            }

            // Quote expiry — an unpaid quote past its expiresAt can no longer be paid at the quoted price.
            if ($orderRequest->expiresAt
                && ($orderRequest->paymentStatus ?? 'unpaid') === 'unpaid'
                && now()->greaterThan($orderRequest->expiresAt)) {
                return $this->errorResponse('This quote has expired. Please ask the seller for a new quote.', 422);
            }

            // Persist the delivery address on the quote so the webhook can attach it to the
            // converted Order (the webhook is server-to-server and has no request context).
            // Required on the first (converting) payment: downpayment or full.
            if (in_array($validated['type'], ['downpayment', 'full'], true)) {
                $address = $validated['deliveryAddress'] ?? $orderRequest->deliveryAddress;
                if (empty($address)) {
                    return $this->errorResponse('A delivery address is required before payment.', 422);
                }
                $orderRequest->deliveryAddress = $address;
                // Keep the admin-set delivery fee (already folded into finalPrice); do not zero it out.
                $orderRequest->save();
            }

            // Must be confirmed before payment
            if (!in_array($orderRequest->status, ['confirmed', 'processing', 'ready'])) {
                return $this->errorResponse(
                    'Payment is only available after admin confirmation.',
                    422
                );
            }

            if ($orderRequest->finalPrice === null || $orderRequest->finalPrice <= 0) {
                return $this->errorResponse('Final price has not been set yet.', 422);
            }

            $finalPrice  = (float) $orderRequest->finalPrice;
            // Use the downpayment the admin set on the quote; fall back to 50% if none was set.
            $downPayment = ($orderRequest->downPayment !== null && (float) $orderRequest->downPayment > 0)
                ? round((float) $orderRequest->downPayment, 2)
                : round($finalPrice * 0.5, 2);
            $balance     = round($finalPrice - $downPayment, 2);
            $dpPct       = $finalPrice > 0 ? (int) round($downPayment / $finalPrice * 100) : 50;
            $type        = $validated['type'];

            // Determine amount and validate current paymentStatus
            if ($type === 'downpayment') {
                if ($orderRequest->paymentStatus !== 'unpaid') {
                    return $this->errorResponse(
                        'Downpayment has already been paid.',
                        422
                    );
                }
                $amount          = $downPayment;
                $referenceNumber = 'OR-' . $validated['orderRequestId'] . '-down';
                $label           = "Downpayment ({$dpPct}%)";
            } elseif ($type === 'full') {
                // Customer opts to pay the whole amount upfront instead of just the downpayment.
                if ($orderRequest->paymentStatus !== 'unpaid') {
                    return $this->errorResponse(
                        'This order has already been paid.',
                        422
                    );
                }
                $amount          = $finalPrice;
                $referenceNumber = 'OR-' . $validated['orderRequestId'] . '-full';
                $label           = 'Full Payment';
            } else {
                if ($orderRequest->paymentStatus !== 'downpayment_paid') {
                    return $this->errorResponse(
                        'Downpayment must be completed before paying the balance.',
                        422
                    );
                }
                $amount          = $balance;
                $referenceNumber = 'OR-' . $validated['orderRequestId'] . '-bal';
                $label           = 'Remaining Balance';
            }

            $amountInCentavos = (int) round($amount * 100);
            $frontendUrl      = config('app.frontend_url', 'http://localhost:3000');
            $orderId          = $validated['orderRequestId'];
            $description      = "PersonalizeMe Prints — Custom Order {$label} #{$orderId}";

            $response = Http::withBasicAuth($this->secretKey, '')
                ->post("{$this->baseUrl}/checkout_sessions", [
                    'data' => [
                        'attributes' => [
                            'billing'              => [
                                'name'  => trim("{$user->firstName} {$user->lastName}"),
                                'email' => $user->email,
                                'phone' => $user->phoneNumber ?? '',
                            ],
                            'reference_number'     => $referenceNumber,
                            'payment_method_types' => ['gcash', 'paymaya', 'card'],
                            'line_items'           => [[
                                'currency' => 'PHP',
                                'amount'   => $amountInCentavos,
                                'name'     => $description,
                                'quantity' => 1,
                            ]],
                            'redirect' => [
                                'success' => "{$frontendUrl}/shop/payment-success?id={$orderId}&type=order_request",
                                'failed'  => "{$frontendUrl}/shop/payment-failed?id={$orderId}&type=order_request",
                            ],
                            'cancel_url' => "{$frontendUrl}/shop/orders",
                        ],
                    ],
                ]);

            if (!$response->successful()) {
                Log::error('PayMongo createOrderRequestLink failed', [
                    'orderRequestId' => $orderId,
                    'type'           => $type,
                    'status'         => $response->status(),
                    'body'           => $response->body(),
                ]);
                return $this->errorResponse('Payment gateway error. Please try again.', 502);
            }

            $linkData    = $response->json();
            $checkoutUrl = $linkData['data']['attributes']['checkout_url']
                        ?? $linkData['data']['attributes']['url']
                        ?? null;

            if (!$checkoutUrl) {
                Log::error('PayMongo createOrderRequestLink: no checkout_url', [
                    'orderRequestId' => $orderId,
                    'body'           => $linkData,
                ]);
                return $this->errorResponse('Payment gateway returned an invalid response.', 502);
            }

            return $this->successResponse('Payment link created.', [
                'orderRequestId' => $orderId,
                'checkoutUrl'    => $checkoutUrl,
                'amount'         => $amount,
                'type'           => $type,
            ]);

        } catch (\Illuminate\Validation\ValidationException $e) {
            return $this->validationErrorResponse($e);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'Failed to create order request payment link.');
        }
    }

    /**
     * Convert a paid OrderRequest (RFQ quote) into a real Order so it enters the
     * canonical JO → Production → QC → balance-gate pipeline. Idempotent: if the
     * request was already converted, the existing order is returned untouched.
     *
     * @param string $paymentType 'down' (downpayment → partial) or 'full' (paid upfront)
     */
    /**
     * Hold the materials the quote said the job would consume.
     *
     * A quote records its own materials per line - including for a SERVICE whose product
     * carries no BOM at all - so this is the only place that knows what a quoted job will
     * really eat. Until now nothing was held here, so every quote sold left stock counts
     * drifting away from reality.
     *
     * Quote orders are made-to-order, so stock is RESERVED and consumed later at QC pass
     * via the job order. Deducting here as well would take it twice. Materials bought per
     * order are skipped - there is no stock to hold against.
     */
    private function reserveQuoteMaterials(OrderRequest $orderRequest, Order $order): void
    {
        foreach ($orderRequest->lineItems ?? [] as $line) {
            foreach ($line['materials'] ?? [] as $mat) {
                try {
                    $inv = Inventory::find($mat['inventoryId'] ?? null);
                    $qty = (int) round((float) ($mat['qty'] ?? 0));
                    if (!$inv || $inv->isOnDemand || $qty <= 0) continue;

                    $inv->reservedQty = (int) ($inv->reservedQty ?? 0) + $qty;
                    $inv->save();

                    StockHistory::create([
                        'inventoryId'  => (string) $inv->_id,
                        'quantity'     => $qty,
                        'remainingQty' => (int) ($inv->stockQty ?? 0),
                        'unitCost'     => $inv->averageCost ?? 0,
                        'totalCost'    => 0,
                        'reason'       => 'production_reserved',
                        'type'         => 'reservation',
                        'orderId'      => (string) $order->_id,
                        'productId'    => $line['productId'] ?? null,
                        'productName'  => $line['productName'] ?? '',
                        'customerName' => $orderRequest->customerName ?? '',
                        'performedBy'  => 'system',
                        'remarks'      => 'Reserved from quote: ' . (string) $orderRequest->_id,
                        'createdAt'    => now(),
                    ]);
                } catch (\Throwable $e) {
                    // One bad material must not undo a paid order.
                    Log::warning('reserveQuoteMaterials failed', [
                        'orderRequestId' => (string) $orderRequest->_id,
                        'inventoryId'    => $mat['inventoryId'] ?? null,
                        'error'          => $e->getMessage(),
                    ]);
                }
            }
        }
    }

    private function convertOrderRequestToOrder(OrderRequest $orderRequest, string $paymentType, array $paymentMeta = []): ?Order
    {
        // Idempotency guard — never mint a second order for the same quote.
        if (!empty($orderRequest->convertedOrderId)) {
            return Order::find($orderRequest->convertedOrderId);
        }

        $customer   = User::find($orderRequest->customerId);
        $finalPrice = round((float) $orderRequest->finalPrice, 2);

        $downPayment = ($orderRequest->downPayment !== null && (float) $orderRequest->downPayment > 0)
            ? round((float) $orderRequest->downPayment, 2)
            : round($finalPrice * 0.5, 2);

        $paidInFull = $paymentType === 'full';
        $paidAmount = $paidInFull ? $finalPrice : $downPayment;
        $balance    = $paidInFull ? 0.0 : round($finalPrice - $downPayment, 2);
        $dpPct      = $finalPrice > 0 ? (int) round($downPayment / $finalPrice * 100) : null;

        // Canonical order item shape (matches OrderController@store). A quote can hold several
        // products; lineItems normalises both the multi-item and the legacy single-product shape.
        // Prices come straight from the quote lines — design/delivery fees stay OUT of unitPrice
        // (they are separate components of finalPrice, not part of what a piece costs).
        $items = array_map(fn ($line) => [
            'productId'     => (string) ($line['productId'] ?? ''),
            'productName'   => $line['productName'] ?? null,
            'isCustom'      => true,
            'isMadeToOrder' => true,
            'thumbnail'     => $line['thumbnail'] ?? null,
            // Carry the quoted variant through - without it the order cannot tell which
            // BOM was priced, and production would have to guess the colour.
            'variantId'     => $line['variantId'] ?? null,
            'variantName'   => $line['variantName'] ?? null,
            'qty'           => max(1, (int) ($line['qty'] ?? 1)),
            'unitPrice'     => round((float) ($line['unitPrice'] ?? 0), 2),
            'lineTotal'     => round((float) ($line['lineTotal'] ?? 0), 2),
            'flashSaleId'   => null,
            'designUrl'     => $orderRequest->designUrl,
            'designNotes'   => $orderRequest->designNotes,
            'selectedVariants' => $orderRequest->selectedVariants ?? [],
        ], $orderRequest->lineItems);

        $order = Order::create([
            'userId'        => (string) $orderRequest->customerId,
            'userSnapshot'  => [
                'name'  => $orderRequest->customerName
                    ?: trim(($customer->firstName ?? '') . ' ' . ($customer->lastName ?? '')),
                'email' => $orderRequest->customerEmail ?? ($customer->email ?? null),
                'phone' => $customer->phoneNumber ?? null,
            ],
            'items'                => $items,
            'totalAmount'          => $finalPrice,
            // Informational — the delivery fee the admin set on the quote is already inside finalPrice.
            'shippingFee'          => round((float) ($orderRequest->shippingFee ?? 0), 2),
            'orderStatus'          => 'awaiting_production',
            'paymentStatus'        => $paidInFull ? 'paid' : 'partial',
            'downPayment'          => $paidAmount,
            'balance'              => $balance,
            'requiresDownpayment'  => true,
            'downpaymentPercent'   => $dpPct,
            'paymentMethod'        => $paymentMeta['method'] ?? null,
            'paymentDate'          => now(),
            'paymongoPaymentId'    => $paymentMeta['paymentId'] ?? null,
            'paymongoReferenceNumber' => $paymentMeta['ref'] ?? null,
            'deliveryAddress'      => $orderRequest->deliveryAddress,
            'isCustomOrder'        => true,
            'orderSource'          => 'inquiry',
            'designType'           => $orderRequest->designType,
            'designFilePath'       => $orderRequest->designUrl,
            'designNotes'          => $orderRequest->designNotes,
            // An owner-attached quote design is pre-approved (agreed in chat) → no proof gate.
            // A customer-uploaded design still needs the store to review it.
            'designStatus'         => $orderRequest->designUrl
                ? ($orderRequest->designApproved ? 'approved' : 'pending_review')
                : null,
            'materials'            => $orderRequest->materials,
            'materialsCost'        => $orderRequest->materialsCost,
            'orderRequestId'       => (string) $orderRequest->_id,
            'paymentHistory'       => [[
                'amount' => $paidAmount,
                'method' => $paymentMeta['method'] ?? 'online',
                'note'   => ($paidInFull ? 'Full payment' : 'Downpayment')
                    . ' via PayMongo' . (!empty($paymentMeta['ref']) ? " ({$paymentMeta['ref']})" : ''),
                'paidAt' => now()->toDateTimeString(),
            ]],
            'statusHistory'        => [['status' => 'awaiting_production', 'at' => now()->toISOString()]],
            'createdAt'            => now(),
            'updatedAt'            => now(),
        ]);

        $orderRequest->convertedOrderId = (string) $order->_id;
        $orderRequest->save();

        $this->reserveQuoteMaterials($orderRequest, $order);

        Log::info('OrderRequest converted to Order', [
            'orderRequestId' => (string) $orderRequest->_id,
            'orderId'        => (string) $order->_id,
            'paymentType'    => $paymentType,
        ]);

        // Admin in-app notification for the new production-bound order.
        try {
            $admin = User::whereIn('role', ['admin', 'owner'])->first();
            if ($admin) {
                Notification::create([
                    'user_id'    => (string) $admin->_id,
                    'type'       => 'new_order',
                    'title'      => 'Custom Order Paid',
                    'message'    => 'Inquiry order #' . strtoupper(substr((string) $order->_id, -8))
                        . ' paid (' . ($paidInFull ? 'full' : 'downpayment') . ') by '
                        . ($order->userSnapshot['name'] ?? 'a customer') . '.',
                    'is_read'    => false,
                    'data'       => ['orderId' => (string) $order->_id, 'orderRequestId' => (string) $orderRequest->_id],
                    'created_at' => now(),
                ]);
            }
        } catch (\Throwable $e) {
            Log::warning('convert notification failed', ['error' => $e->getMessage()]);
        }

        return $order;
    }

    /**
     * POST /api/payment/webhook
     *
     * PayMongo sends payment.paid event.
     * Extracts orderId from reference_number, marks order as paid.
     * No auth middleware — verified by signature.
     */
    public function webhook(Request $request)
    {
        try {
            $webhookSecret = config('services.paymongo.webhook_secret', '');

            // ── Signature verification ────────────────────────────────
            if (!$webhookSecret) {
                Log::critical('PayMongo webhook: PAYMONGO_WEBHOOK_SECRET is not set. Rejecting all webhook calls.');
                return response()->json(['error' => 'Webhook not configured.'], 500);
            }

            $sigHeader = $request->header('Paymongo-Signature');
            if (!$sigHeader) {
                Log::warning('PayMongo webhook: missing signature');
                return response()->json(['error' => 'Missing signature'], 401);
            }

            $parts = [];
            foreach (explode(',', $sigHeader) as $part) {
                [$k, $v] = explode('=', $part, 2);
                $parts[$k] = $v;
            }

            $timestamp     = $parts['t']  ?? '';
            $testSig       = $parts['te'] ?? '';
            $liveSig       = $parts['li'] ?? '';
            $rawBody       = $request->getContent();
            $signedPayload = "{$timestamp}.{$rawBody}";
            $computedSig   = hash_hmac('sha256', $signedPayload, $webhookSecret);
            $expectedSig   = app()->environment('production') ? $liveSig : $testSig;

            if (!hash_equals($computedSig, $expectedSig)) {
                Log::warning('PayMongo webhook: invalid signature');
                return response()->json(['error' => 'Invalid signature'], 401);
            }

            // ── Extract event type ────────────────────────────────────
            $payload   = $request->json()->all();
            $eventType = $payload['data']['attributes']['type'] ?? null;

            if ($eventType !== 'payment.paid') {
                return response()->json(['received' => true]);
            }

            // ── Extract orderId from reference_number ─────────────────
            $data    = $payload['data']['attributes']['data'] ?? [];
            $remarks = $data['attributes']['reference_number'] ?? '';

            // Route: OR-{24hexId}-down or OR-{24hexId}-bal → OrderRequest
            // Route: raw 24-hex → Order
            $isOrderRequest = preg_match(
                '/^OR-([a-f0-9]{24})-(down|bal|full)$/i',
                $remarks,
                $orMatches
            );

            if ($isOrderRequest) {
                $orderRequestId = $orMatches[1];
                $paymentType    = strtolower($orMatches[2]); // 'down' or 'bal'

                $orderRequest = OrderRequest::find($orderRequestId);
                if (!$orderRequest) {
                    Log::warning('PayMongo webhook: order request not found', [
                        'reference_number' => $remarks,
                    ]);
                    return response()->json(['received' => true]);
                }

                $paymentAttrs  = $data['attributes'] ?? [];
                $paymentMethod = $paymentAttrs['source']['type']
                    ?? $paymentAttrs['payment_method_type']
                    ?? null;

                $convertMeta = [
                    'method'    => $paymentMethod,
                    'paymentId' => $data['id'] ?? null,
                    'ref'       => $remarks,
                ];

                if ($paymentType === 'down' && $orderRequest->paymentStatus === 'unpaid') {
                    $orderRequest->paymentStatus = 'downpayment_paid';
                    // Keep the downpayment the admin set on the quote — do NOT overwrite with 50%.
                    if ($orderRequest->downPayment === null || (float) $orderRequest->downPayment <= 0) {
                        $orderRequest->downPayment = round((float) $orderRequest->finalPrice * 0.5, 2);
                    }
                    $orderRequest->updatedAt     = now();
                    $orderRequest->save();

                    // Convert the quote into a real Order → enters the JO/Production/QC pipeline.
                    $this->convertOrderRequestToOrder($orderRequest, 'down', $convertMeta);

                    Log::info('OrderRequest downpayment received', [
                        'orderRequestId' => $orderRequestId,
                        'paymentMethod'  => $paymentMethod,
                    ]);
                } elseif ($paymentType === 'full' && $orderRequest->paymentStatus === 'unpaid') {
                    // Customer chose to pay the whole amount upfront.
                    $orderRequest->paymentStatus = 'paid';
                    $orderRequest->downPayment   = round((float) $orderRequest->finalPrice, 2);
                    $orderRequest->updatedAt     = now();
                    $orderRequest->save();

                    // Convert to a fully-paid Order (balance = 0) → straight into production.
                    $this->convertOrderRequestToOrder($orderRequest, 'full', $convertMeta);

                    Log::info('OrderRequest paid in full upfront', [
                        'orderRequestId' => $orderRequestId,
                        'paymentMethod'  => $paymentMethod,
                    ]);
                } elseif ($paymentType === 'bal' && $orderRequest->paymentStatus === 'downpayment_paid') {
                    $orderRequest->paymentStatus = 'paid';
                    $orderRequest->updatedAt     = now();
                    $orderRequest->save();

                    // If already converted, settle the balance on the linked Order too.
                    if (!empty($orderRequest->convertedOrderId)) {
                        $linked = Order::find($orderRequest->convertedOrderId);
                        if ($linked && $linked->paymentStatus !== 'paid') {
                            $paidNow = round((float) ($linked->balance ?? 0), 2);
                            $history = $linked->paymentHistory ?? [];
                            $history[] = [
                                'amount' => $paidNow,
                                'method' => $paymentMethod ?? 'online',
                                'note'   => 'Balance via PayMongo' . ($remarks ? " ({$remarks})" : ''),
                                'paidAt' => now()->toDateTimeString(),
                            ];
                            $linked->paymentStatus  = 'paid';
                            $linked->downPayment    = round((float) ($linked->totalAmount ?? 0), 2);
                            $linked->balance        = 0;
                            $linked->paymentHistory = $history;
                            $linked->updatedAt      = now();
                            $linked->save();
                        }
                    }

                    Log::info('OrderRequest balance paid in full', [
                        'orderRequestId' => $orderRequestId,
                        'paymentMethod'  => $paymentMethod,
                    ]);
                } else {
                    Log::warning('PayMongo webhook: order request payment already processed or wrong sequence', [
                        'reference_number' => $remarks,
                        'paymentStatus'    => $orderRequest->paymentStatus,
                    ]);
                }

                return response()->json(['received' => true]);
            }

            // ── Standard cart order path ─────────────────────────────────────
            preg_match('/^([a-f0-9]{24})$/i', $remarks, $matches);
            $orderId = $matches[1] ?? null;

            if (!$orderId) {
                Log::warning('PayMongo webhook: could not extract orderId', [
                    'reference_number' => $remarks,
                ]);
                return response()->json(['received' => true]);
            }

            // ── Update order paymentStatus ────────────────────────────────────
            $order = Order::find($orderId);
            if (!$order) {
                Log::warning('PayMongo webhook: order not found', [
                    'orderId' => $orderId,
                ]);
                return response()->json(['received' => true]);
            }

            if ($order->paymentStatus !== 'paid') {
                // Extract payment metadata from webhook payload
                $paymentAttrs  = $data['attributes'] ?? [];
                $paymentMethod = $paymentAttrs['source']['type']
                    ?? $paymentAttrs['payment_method_type']
                    ?? null;
                $paymentId     = $data['id'] ?? null;
                $referenceNum  = $paymentAttrs['reference_number']
                    ?? $paymentAttrs['external_reference_number']
                    ?? null;

                $orderTotal      = (float) ($order->totalAmount ?? 0);
                $paidAmount      = round((float) ($paymentAttrs['amount'] ?? $paymentAttrs['net_amount'] ?? ($orderTotal * 100)) / 100, 2);
                $isDesignFeeOnly = (bool) ($order->isDesignFeeOnly ?? false);

                if ($isDesignFeeOnly) {
                    $order->designFeePaid = true;
                    $order->designFeePaidAmount = $paidAmount;
                    // paymentStatus stays 'unpaid' — design fee is separate from order payment
                } elseif (($order->pendingPaymentType ?? null) === 'downpayment') {
                    $dpAmt = (float) ($order->pendingPaymentAmount ?? $paidAmount);
                    $order->paymentStatus        = 'partial';
                    $order->downPayment          = $dpAmt;
                    $order->balance              = round($orderTotal - $dpAmt, 2);
                    $order->pendingPaymentType   = null;
                    $order->pendingPaymentAmount = null;
                    if ($order->isCustomOrder && $order->orderStatus === 'awaiting_payment') {
                        $order->orderStatus = 'awaiting_production';
                    }
                } else {
                    $order->paymentStatus = 'paid';
                    $order->downPayment   = $orderTotal;
                    $order->balance       = 0;
                    if ($order->isCustomOrder && $order->orderStatus === 'awaiting_payment') {
                        $order->orderStatus = 'awaiting_production';
                    }
                    if ($order->isCustomOrder && $order->orderStatus === 'ready_for_delivery') {
                        $order->orderStatus = 'for_delivery';
                    }
                }
                $order->paymentDate             = now();
                $order->paymentMethod           = $paymentMethod;
                $order->paymongoPaymentId       = $paymentId;
                $order->paymongoReferenceNumber = $referenceNum;
                $order->paymentHistory          = [[
                    'amount'    => $paidAmount,
                    'method'    => $paymentMethod ?? 'online',
                    'note'      => 'Online payment via PayMongo' . ($referenceNum ? " ({$referenceNum})" : ''),
                    'paidAt'    => now()->toDateTimeString(),
                ]];
                $order->updatedAt               = now();
                $order->save();

                // Admin in-app notification
                try {
                    $admin = User::where('role', 'admin')->first();
                    if ($admin) {
                        Notification::create([
                            'user_id'    => (string) $admin->_id,
                            'type'       => 'new_order',
                            'title'      => 'Payment Received',
                            'message'    => 'Order #' . strtoupper(substr($orderId, -8)) .
                                            ' paid by ' . ($order->userSnapshot['name'] ?? 'Unknown') .
                                            ($paymentMethod ? " via {$paymentMethod}" : '') . '.',
                            'is_read'    => false,
                            'data'       => ['orderId' => $orderId],
                            'created_at' => now(),
                        ]);
                    }
                } catch (\Exception $notifErr) {
                    Log::warning('webhook: admin notification failed', ['error' => $notifErr->getMessage()]);
                }

                // Log activity
                try {
                    ActivityLog::create([
                        'action'           => 'payment_received',
                        'entityType'       => 'order',
                        'entityId'         => $orderId,
                        'description'      => "Payment received for order #{$orderId}" .
                            ($paymentMethod ? " via {$paymentMethod}" : ''),
                        'performedBy'      => 'system',
                        'performedByEmail' => null,
                        'metadata'         => [
                            'orderId'       => $orderId,
                            'paymentMethod' => $paymentMethod,
                            'paymentId'     => $paymentId,
                            'referenceNum'  => $referenceNum,
                            'amount'        => $paidAmount,
                        ],
                        'createdAt'        => now(),
                    ]);
                } catch (\Exception $logErr) {
                    Log::warning('ActivityLog write failed (webhook)', [
                        'error' => $logErr->getMessage(),
                    ]);
                }

                Log::info('PayMongo webhook: order marked paid', [
                    'orderId'       => $orderId,
                    'paymentMethod' => $paymentMethod,
                    'paymentId'     => $paymentId,
                ]);
            }

            return response()->json(['received' => true]);

        } catch (\Exception $e) {
            Log::error('PayMongo webhook error', [
                'error' => $e->getMessage(),
            ]);
            // Always 200 to prevent PayMongo retries
            return response()->json(['received' => true]);
        }
    }

    /**
     * POST /api/payment/verify-intent
     *
     * Checks the stored Payment Intent status directly against PayMongo and marks
     * the order as paid if the intent has succeeded. Used as a webhook fallback —
     * the payment-success page calls this once so local dev (no webhook) still works.
     */
    public function verifyIntent(Request $request)
    {
        try {
            $user = $request->user();
            if (!$user) return $this->unauthorizedResponse();

            $validated = $request->validate([
                'orderId' => 'required|string|regex:/^[a-f0-9]{24}$/i',
            ]);

            $order = Order::where('_id', $validated['orderId'])
                          ->where('userId', (string) $user->_id)
                          ->first();

            if (!$order) return $this->notFoundResponse('Order');

            if ($order->paymentStatus === 'paid') {
                return $this->successResponse('Already paid.', ['paymentStatus' => 'paid']);
            }

            $intentId  = $order->paymongoIntentId ?? null;
            $sessionId = $order->paymongoLinkId   ?? null;

            if (!$intentId && !$sessionId) {
                return $this->errorResponse('No payment reference on this order.', 422);
            }

            // ── Checkout session verification path ────────────────────────────
            if (!$intentId && $sessionId) {
                $res = Http::withBasicAuth($this->secretKey, '')
                    ->get("{$this->baseUrl}/checkout_sessions/{$sessionId}");

                if (!$res->successful()) {
                    Log::warning('verifyIntent: checkout session fetch failed', [
                        'order_id' => $validated['orderId'],
                        'status'   => $res->status(),
                    ]);
                    return $this->errorResponse('Could not reach payment gateway.', 502);
                }

                $sessionData   = $res->json()['data'] ?? [];
                $sessionStatus = $sessionData['attributes']['status'] ?? null;
                $payments      = $sessionData['attributes']['payments'] ?? [];

                if ($sessionStatus !== 'completed' || empty($payments)) {
                    return $this->successResponse('Payment not yet confirmed.', ['paymentStatus' => $sessionStatus]);
                }

                $latestPayment   = $payments[0];
                $paymentId       = $latestPayment['id'] ?? null;
                $payAttrs        = $latestPayment['attributes'] ?? [];
                $paymentMethod   = $payAttrs['source']['type'] ?? $payAttrs['payment_method_type'] ?? 'online';
                $paidAmount      = round((float) ($payAttrs['amount'] ?? $payAttrs['net_amount'] ?? 0) / 100, 2);
                $totalAmount     = (float) ($order->totalAmount ?? 0);
                $isDesignFeeOnly = (bool) ($order->isDesignFeeOnly ?? false);

                if ($isDesignFeeOnly && ($order->designFeePaid ?? false)) {
                    return $this->successResponse('Design fee already confirmed.', [
                        'paymentStatus' => $order->paymentStatus,
                        'designFeePaid' => true,
                    ]);
                }

                if ($isDesignFeeOnly) {
                    $order->designFeePaid       = true;
                    $order->designFeePaidAmount = $paidAmount;
                } elseif (($order->pendingPaymentType ?? null) === 'downpayment') {
                    $dpAmt = (float) ($order->pendingPaymentAmount ?? $paidAmount);
                    $order->paymentStatus        = 'partial';
                    $order->downPayment          = $dpAmt;
                    $order->balance              = round($totalAmount - $dpAmt, 2);
                    $order->pendingPaymentType   = null;
                    $order->pendingPaymentAmount = null;
                    if ($order->isCustomOrder && $order->orderStatus === 'awaiting_payment') {
                        $order->orderStatus = 'awaiting_production';
                    }
                } else {
                    $order->paymentStatus = 'paid';
                    $order->downPayment   = $totalAmount;
                    $order->balance       = 0;
                    if ($order->isCustomOrder && $order->orderStatus === 'awaiting_payment') {
                        $order->orderStatus = 'awaiting_production';
                    }
                    if ($order->isCustomOrder && $order->orderStatus === 'ready_for_delivery') {
                        $order->orderStatus = 'for_delivery';
                    }
                }
                $history   = $order->paymentHistory ?? [];
                $history[] = ['amount' => $paidAmount, 'method' => $paymentMethod, 'note' => 'Payment confirmed via PayMongo Checkout Session (' . $sessionId . ')', 'paidAt' => now()->toDateTimeString()];
                $order->paymentDate       = now();
                $order->paymentMethod     = $paymentMethod;
                $order->paymongoPaymentId = $paymentId;
                $order->paymentHistory    = $history;
                $order->updatedAt = now();
                $order->save();

                try {
                    $admin = User::where('role', 'admin')->first();
                    if ($admin) {
                        Notification::create([
                            'user_id'    => (string) $admin->_id,
                            'type'       => 'new_order',
                            'title'      => 'Payment Received',
                            'message'    => 'Order #' . strtoupper(substr((string) $order->_id, -8)) .
                                            ' paid by ' . ($order->userSnapshot['name'] ?? 'Unknown') .
                                            " via {$paymentMethod}.",
                            'is_read'    => false,
                            'data'       => ['orderId' => (string) $order->_id],
                            'created_at' => now(),
                        ]);
                    }
                } catch (\Exception $e) {
                    Log::warning('verifyIntent: admin notification failed', ['error' => $e->getMessage()]);
                }

                Log::info('verifyIntent: order marked paid via checkout session', [
                    'orderId'   => (string) $order->_id,
                    'sessionId' => $sessionId,
                ]);

                return $this->successResponse('Payment verified and order marked paid.', ['paymentStatus' => 'paid']);
            }

            $res = Http::withBasicAuth($this->secretKey, '')
                ->get("{$this->baseUrl}/payment_intents/{$intentId}");

            if (!$res->successful()) {
                Log::warning('verifyIntent: PayMongo fetch failed', [
                    'order_id' => $validated['orderId'],
                    'status'   => $res->status(),
                ]);
                return $this->errorResponse('Could not reach payment gateway.', 502);
            }

            $intentData   = $res->json()['data'];
            $intentStatus = $intentData['attributes']['status'] ?? null;

            if ($intentStatus !== 'succeeded') {
                return $this->successResponse('Payment not yet confirmed.', ['paymentStatus' => $intentStatus]);
            }

            $payments      = $intentData['attributes']['payments'] ?? [];
            $latestPayment = !empty($payments) ? $payments[0] : [];
            $paymentId     = $latestPayment['id'] ?? null;
            $payAttrs      = $latestPayment['attributes'] ?? [];
            $paymentMethod = $payAttrs['source']['type'] ?? $payAttrs['payment_method_type'] ?? $order->paymentMethod ?? 'online';
            $totalAmount   = (float) ($order->totalAmount ?? 0);
            $paidAmount    = round((float) ($intentData['attributes']['amount'] ?? ($totalAmount * 100)) / 100, 2);
            $isDesignFeeOnly = (bool) ($order->isDesignFeeOnly ?? false);

            if ($isDesignFeeOnly && ($order->designFeePaid ?? false)) {
                return $this->successResponse('Design fee already confirmed.', [
                    'paymentStatus' => $order->paymentStatus,
                    'designFeePaid' => true,
                ]);
            }

            if ($isDesignFeeOnly) {
                $order->designFeePaid = true;
                // paymentStatus stays 'unpaid' — design fee is separate from order payment
            } elseif (($order->pendingPaymentType ?? null) === 'downpayment') {
                $dpAmt = (float) ($order->pendingPaymentAmount ?? $paidAmount);
                $order->paymentStatus        = 'partial';
                $order->downPayment          = $dpAmt;
                $order->balance              = round($totalAmount - $dpAmt, 2);
                $order->pendingPaymentType   = null;
                $order->pendingPaymentAmount = null;
                if ($order->isCustomOrder && $order->orderStatus === 'awaiting_payment') {
                    $order->orderStatus = 'awaiting_production';
                }
            } else {
                $order->paymentStatus = 'paid';
                $order->downPayment   = $totalAmount;
                $order->balance       = 0;
                if ($order->isCustomOrder && $order->orderStatus === 'awaiting_payment') {
                    $order->orderStatus = 'awaiting_production';
                }
                if ($order->isCustomOrder && $order->orderStatus === 'ready_for_delivery') {
                    $order->orderStatus = 'for_delivery';
                }
            }
            $history   = $order->paymentHistory ?? [];
            $history[] = ['amount' => $paidAmount, 'method' => $paymentMethod, 'note' => 'Payment confirmed via PayMongo (' . $intentId . ')', 'paidAt' => now()->toDateTimeString()];
            $order->paymentDate       = now();
            $order->paymentMethod     = $paymentMethod;
            $order->paymongoPaymentId = $paymentId;
            $order->paymentHistory    = $history;
            $order->updatedAt = now();
            $order->save();

            try {
                $admin = User::where('role', 'admin')->first();
                if ($admin) {
                    Notification::create([
                        'user_id'    => (string) $admin->_id,
                        'type'       => 'new_order',
                        'title'      => 'Payment Received',
                        'message'    => 'Order #' . strtoupper(substr((string) $order->_id, -8)) .
                                        ' paid by ' . ($order->userSnapshot['name'] ?? 'Unknown') .
                                        " via {$paymentMethod}.",
                        'is_read'    => false,
                        'data'       => ['orderId' => (string) $order->_id],
                        'created_at' => now(),
                    ]);
                }
            } catch (\Exception $e) {
                Log::warning('verifyIntent: admin notification failed', ['error' => $e->getMessage()]);
            }

            Log::info('verifyIntent: order marked paid', [
                'orderId'       => (string) $order->_id,
                'paymentMethod' => $paymentMethod,
                'intentId'      => $intentId,
            ]);

            return $this->successResponse('Payment verified and order marked paid.', ['paymentStatus' => 'paid']);

        } catch (\Illuminate\Validation\ValidationException $e) {
            return $this->validationErrorResponse($e);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'Failed to verify payment.');
        }
    }

    /**
     * POST /api/payment/create-order-pay-link
     * Creates a PayMongo checkout session for an existing order's outstanding balance.
     * Used when a customer wants to pay online for a COD or previously unpaid order.
     * The webhook uses the raw orderId as reference_number to mark the order paid.
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
        usort($batches, fn($a, $b) =>
            strtotime($a['dateReceived'] ?? '0') <=> strtotime($b['dateReceived'] ?? '0')
        );

        $available = array_reduce($batches, fn($carry, $b) =>
            $carry + ($b['remainingQty'] ?? $b['goodQty'] ?? 0), 0
        );

        if ($available < $qty) {
            $inventory->stockQty  = max(0, (int) ($inventory->stockQty ?? 0) - $qty);
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
                'performedBy'  => 'system',
                'remarks'      => $orderId ? "Order: {$orderId}" : null,
                'createdAt'    => now(),
            ]);
            return;
        }

        $remaining       = $qty;
        $batchDeductions = [];
        foreach ($batches as &$batch) {
            if ($remaining <= 0) break;
            $batchQty = $batch['remainingQty'] ?? $batch['goodQty'] ?? 0;
            if ($batchQty <= 0) continue;
            $deduct                  = min($batchQty, $remaining);
            $batch['remainingQty']   = $batchQty - $deduct;
            $remaining              -= $deduct;
            $batchDeductions[]       = [
                'batchId'  => $batch['batchId'] ?? null,
                'qty'      => $deduct,
                'unitCost' => $batch['unitCost'] ?? 0,
            ];
        }
        unset($batch);

        $newStock             = max(0, (int) ($inventory->stockQty ?? 0) - $qty);
        $inventory->batches   = $batches;
        $inventory->stockQty  = $newStock;
        $inventory->updatedAt = now();
        $inventory->save();

        $running = $newStock + $qty;
        foreach ($batchDeductions as $bd) {
            $running -= $bd['qty'];
            StockHistory::create([
                'inventoryId'  => (string) $inventory->_id,
                'quantity'     => $bd['qty'],
                'remainingQty' => $running,
                'unitCost'     => $bd['unitCost'],
                'totalCost'    => $bd['qty'] * $bd['unitCost'],
                'reason'       => $reason,
                'type'         => 'deduction',
                'batchId'      => $bd['batchId'],
                'sellingPrice' => $unitPrice,
                'performedBy'  => 'system',
                'remarks'      => $orderId ? "Order: {$orderId}" : null,
                'createdAt'    => now(),
            ]);
        }
    }

    public function createOrderPayLink(Request $request)
    {
        try {
            $user = $request->user();
            if (!$user) return $this->unauthorizedResponse();

            $validated = $request->validate([
                'orderId'         => 'required|string|regex:/^[a-f0-9]{24}$/i',
                'paymentMethod'   => 'nullable|string|in:gcash,paymaya,card',
                'paymentMethodId' => 'nullable|string',
                'eWalletPhone'    => 'nullable|string|max:20',
                'payFull'         => 'nullable|boolean',
            ]);

            $order = Order::where('_id', $validated['orderId'])
                          ->where('userId', (string) $user->_id)
                          ->first();

            if (!$order) return $this->notFoundResponse('Order');

            if ($order->paymentStatus === 'paid') {
                return $this->errorResponse('This order has already been fully paid.', 422);
            }

            $totalPaid = collect($order->paymentHistory ?? [])->sum('amount');
            $amountDue = round(max(0, (float) ($order->totalAmount ?? 0) - $totalPaid), 2);

            if ($amountDue <= 0) {
                return $this->errorResponse('No outstanding balance on this order.', 422);
            }

            $orderId        = (string) $order->_id;
            $frontendUrl    = rtrim(config('app.frontend_url', env('FRONTEND_URL', 'http://localhost:3000')), '/');
            $paymentType    = $validated['paymentMethod'] ?? null;
            $payFull        = filter_var($validated['payFull'] ?? true, FILTER_VALIDATE_BOOLEAN);
            $isDP           = false;
            $dpAmount       = 0.0;

            // ── Downpayment vs full-payment resolution ────────────────────
            if (!$payFull && $order->paymentStatus === 'unpaid') {
                $dpPercent = (int) ($order->downpaymentPercent ?? 0);
                if ($dpPercent <= 0) {
                    $firstProdId = $order->items[0]['productId'] ?? null;
                    if ($firstProdId) {
                        $prod = Product::find($firstProdId);
                        $dpPercent = ($prod && $prod->requiresDownpayment) ? (int) ($prod->downpaymentPercent ?? 0) : 0;
                    }
                }
                if ($dpPercent > 0) {
                    $dpAmount = round((float) ($order->totalAmount ?? 0) * $dpPercent / 100, 2);
                    $isDP     = true;
                }
            }

            $chargeAmount   = $isDP ? $dpAmount : $amountDue;
            $amountCentavos = (int) round($chargeAmount * 100);

            if ($isDP) {
                $order->pendingPaymentType   = 'downpayment';
                $order->pendingPaymentAmount = $dpAmount;
                $order->save();
            }

            // ── Payment Intent flow (GCash, Maya, Card) ──────────────────
            if ($paymentType && in_array($paymentType, ['gcash', 'paymaya', 'card'])) {

                $intentRes = Http::withBasicAuth($this->secretKey, '')
                    ->post("{$this->baseUrl}/payment_intents", [
                        'data' => ['attributes' => [
                            'amount'                 => $amountCentavos,
                            'payment_method_allowed' => [$paymentType],
                            'payment_method_options' => ['card' => ['request_three_d_secure' => 'any']],
                            'currency'               => 'PHP',
                            'capture_type'           => 'automatic',
                            'description'            => 'Order #' . strtoupper(substr($orderId, -8)),
                            'metadata'               => ['order_id' => $orderId],
                        ]]
                    ]);

                if (!$intentRes->successful()) {
                    Log::error('createOrderPayLink: intent failed', ['order_id' => $orderId, 'body' => $intentRes->body()]);
                    return $this->errorResponse('Payment gateway error. Please try again.', 502);
                }

                $intentId        = $intentRes->json()['data']['id'];
                $paymentMethodId = $validated['paymentMethodId'] ?? null;

                if ($paymentType !== 'card') {
                    $rawPhone = !empty($validated['eWalletPhone'])
                        ? $validated['eWalletPhone']
                        : ($user->phoneNumber ?? '');
                    $phone = ltrim(preg_replace('/^\+?63/', '', preg_replace('/\s+/', '', $rawPhone)), '0');

                    $pmRes = Http::withBasicAuth($this->secretKey, '')
                        ->post("{$this->baseUrl}/payment_methods", [
                            'data' => ['attributes' => [
                                'type'    => $paymentType,
                                'billing' => [
                                    'name'  => trim("{$user->firstName} {$user->lastName}"),
                                    'email' => $user->email,
                                    'phone' => $phone,
                                ],
                            ]]
                        ]);

                    if (!$pmRes->successful()) {
                        return $this->errorResponse('Failed to initialize payment method.', 502);
                    }
                    $paymentMethodId = $pmRes->json()['data']['id'];
                }

                if (!$paymentMethodId) {
                    return $this->errorResponse('Card payment method ID is required.', 422);
                }

                $attachRes = Http::withBasicAuth($this->secretKey, '')
                    ->post("{$this->baseUrl}/payment_intents/{$intentId}/attach", [
                        'data' => ['attributes' => [
                            'payment_method' => $paymentMethodId,
                            'return_url'     => "{$frontendUrl}/shop/payment-success?id={$orderId}",
                        ]]
                    ]);

                if (!$attachRes->successful()) {
                    Log::error('createOrderPayLink: attach failed', ['order_id' => $orderId, 'body' => $attachRes->body()]);
                    return $this->errorResponse('Failed to attach payment. Please try again.', 502);
                }

                $attachData   = $attachRes->json()['data'];
                $intentStatus = $attachData['attributes']['status'];
                $redirectUrl  = $attachData['attributes']['next_action']['redirect']['url'] ?? null;

                $order->paymongoIntentId = $intentId;
                $order->save();

                if ($intentStatus === 'succeeded') {
                    $updates = [
                        'paymentMethod' => $paymentType,
                        'paymentDate'   => now(),
                    ];
                    if ($isDP) {
                        $updates['paymentStatus']         = 'partial';
                        $updates['downPayment']           = $dpAmount;
                        $updates['balance']               = round((float) $order->totalAmount - $dpAmount, 2);
                        $updates['pendingPaymentType']    = null;
                        $updates['pendingPaymentAmount']  = null;
                        if ($order->isCustomOrder && $order->orderStatus === 'awaiting_payment') {
                            $updates['orderStatus'] = 'awaiting_production';
                        }
                    } else {
                        $updates['paymentStatus'] = 'paid';
                        if ($order->isCustomOrder && $order->orderStatus === 'awaiting_payment') {
                            $updates['orderStatus'] = 'awaiting_production';
                        }
                        if ($order->isCustomOrder && $order->orderStatus === 'ready_for_delivery') {
                            $updates['orderStatus'] = 'for_delivery';
                        }
                    }
                    $order->update($updates);
                    return $this->successResponse('Payment completed.', [
                        'orderId' => $orderId,
                        'status'  => 'succeeded',
                    ]);
                }

                return $this->successResponse('Payment initiated.', [
                    'orderId'     => $orderId,
                    'status'      => $intentStatus,
                    'checkoutUrl' => $redirectUrl,
                ]);
            }

            // ── Fallback: hosted checkout (no paymentMethod specified) ────
            $orderShortId = strtoupper(substr($orderId, -8));

            $pmResponse = Http::withBasicAuth($this->secretKey, '')
                ->post("{$this->baseUrl}/checkout_sessions", [
                    'data' => ['attributes' => [
                        'billing' => [
                            'name'  => trim(($user->firstName ?? '') . ' ' . ($user->lastName ?? '')),
                            'email' => $user->email ?? '',
                            'phone' => $user->phoneNumber ?? $user->phone ?? '',
                        ],
                        'send_email_receipt'   => true,
                        'show_description'     => true,
                        'show_line_items'      => true,
                        'reference_number'     => $orderId,
                        'payment_method_types' => ['gcash', 'paymaya', 'card'],
                        'line_items' => [[
                            'currency' => 'PHP',
                            'amount'   => $amountCentavos,
                            'name'     => "Order #{$orderShortId}",
                            'quantity' => 1,
                        ]],
                        'redirect' => [
                            'success' => "{$frontendUrl}/shop/payment-success?id={$orderId}",
                            'failed'  => "{$frontendUrl}/shop/payment-failed?id={$orderId}",
                        ],
                        'cancel_url' => "{$frontendUrl}/shop/orders-history?payment_cancelled=1",
                    ]],
                ]);

            if (!$pmResponse->successful()) {
                Log::error('PaymentController@createOrderPayLink: PayMongo error', [
                    'status' => $pmResponse->status(),
                    'body'   => $pmResponse->json(),
                ]);
                return $this->errorResponse('Failed to create payment session. Please try again.', 502);
            }

            $pmJson      = $pmResponse->json();
            $checkoutUrl = data_get($pmJson, 'data.attributes.checkout_url');
            if (!$checkoutUrl) {
                return $this->errorResponse('Payment session created but checkout URL is missing.', 502);
            }

            $sessionId = data_get($pmJson, 'data.id');
            if ($sessionId) {
                $order->paymongoLinkId = $sessionId;
                $order->save();
            }

            return $this->successResponse('Payment link created.', [
                'orderId'     => $orderId,
                'checkoutUrl' => $checkoutUrl,
                'amountDue'   => $amountDue,
            ]);

        } catch (\Illuminate\Validation\ValidationException $e) {
            return $this->validationErrorResponse($e);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'Failed to create payment link.');
        }
    }

}
