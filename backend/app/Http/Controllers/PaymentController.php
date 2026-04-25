<?php

namespace App\Http\Controllers;

use App\Models\Order;
use App\Models\OrderRequest;
use App\Models\Voucher;
use App\Models\Product;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use App\Models\ActivityLog;
use App\Models\FlashSale;
use App\Models\Notification;
use App\Models\User;
use App\Services\PriceResolver;

class PaymentController extends Controller
{
    private string $secretKey;
    private string $baseUrl = 'https://api.paymongo.com/v1';

    public function __construct()
    {
        $this->secretKey = config('services.paymongo.secret_key', '');
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
                ->where('createdAt', '>=', now()->subMinutes(5))
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
                'notes'           => htmlspecialchars(strip_tags(trim($validated['notes'] ?? '')), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'),
                'deliveryAddress' => $validated['deliveryAddress'] ?? null,
                'designNotes'     => isset($validated['design_notes'])
                    ? htmlspecialchars(strip_tags(trim($validated['design_notes'])), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8')
                    : null,
                'designFilePath'  => $designFilePath,
                'designStatus'    => $designFilePath ? 'pending_review' : null,
                'createdAt'       => now(),
                'updatedAt'       => now(),
            ]);

            // Deduct flash sale stock only after order is persisted
            foreach ($pendingFlashSaleIncrements as [$flashSale, $qty]) {
                $flashSale->increment('stockUsed', $qty);
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
                $pmLineItems = array_map(fn($item) => [
                    'currency' => 'PHP',
                    'amount'   => (int) round(($item['unitPrice'] ?? 0) * 100),
                    'name'     => ($item['productName'] ?? 'Product') . ($item['variantName'] ? ' — ' . $item['variantName'] : ''),
                    'quantity' => (int) ($item['qty'] ?? 1),
                ], $orderItems);
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
                                'phone' => $order->userSnapshot['phone'] ?? ($validated['deliveryAddress']['phone'] ?? ''),
                            ],
                            'reference_number'     => (string) $orderId,
                            'payment_method_types' => ['gcash', 'paymaya', 'card'],
                            'line_items'           => $pmLineItems,
                            'redirect'    => [
                                'success' => "{$frontendUrl}/shop/payment-success?id={$orderId}",
                                'failed'  => "{$frontendUrl}/shop/payment-failed?id={$orderId}",
                            ],
                            'cancel_url'  => "{$frontendUrl}/shop/checkout",
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
                'orderRequestId' => 'required|string|size:24',
                'type'           => 'required|in:downpayment,balance',
            ]);

            $orderRequest = OrderRequest::find($validated['orderRequestId']);

            if (!$orderRequest) {
                return $this->errorResponse('Order request not found.', 404);
            }

            // Ownership check
            if ((string) $orderRequest->customerId !== (string) $user->_id) {
                return $this->errorResponse('Forbidden.', 403);
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
            $downPayment = round($finalPrice * 0.5, 2);
            $balance     = round($finalPrice - $downPayment, 2);
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
                $label           = 'Downpayment (50%)';
            } else {
                if ($orderRequest->paymentStatus !== 'downpayment_paid') {
                    return $this->errorResponse(
                        'Downpayment must be completed before paying the balance.',
                        422
                    );
                }
                $amount          = $balance;
                $referenceNumber = 'OR-' . $validated['orderRequestId'] . '-bal';
                $label           = 'Remaining Balance (50%)';
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
                '/^OR-([a-f0-9]{24})-(down|bal)$/i',
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

                if ($paymentType === 'down' && $orderRequest->paymentStatus === 'unpaid') {
                    $orderRequest->paymentStatus = 'downpayment_paid';
                    $orderRequest->downPayment   = round((float) $orderRequest->finalPrice * 0.5, 2);
                    $orderRequest->updatedAt     = now();
                    $orderRequest->save();

                    Log::info('OrderRequest downpayment received', [
                        'orderRequestId' => $orderRequestId,
                        'paymentMethod'  => $paymentMethod,
                    ]);
                } elseif ($paymentType === 'bal' && $orderRequest->paymentStatus === 'downpayment_paid') {
                    $orderRequest->paymentStatus = 'paid';
                    $orderRequest->updatedAt     = now();
                    $orderRequest->save();

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

                $totalAmount = (float) ($order->totalAmount ?? 0);
                $order->paymentStatus           = 'paid';
                $order->paymentDate             = now();
                $order->paymentMethod           = $paymentMethod;
                $order->paymongoPaymentId       = $paymentId;
                $order->paymongoReferenceNumber = $referenceNum;
                $order->downPayment             = $totalAmount;
                $order->balance                 = 0;
                $order->paymentHistory          = [[
                    'amount'    => $totalAmount,
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
                            'amount'        => $order->totalAmount,
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
     * POST /api/payment/create-order-pay-link
     * Creates a PayMongo checkout session for an existing order's outstanding balance.
     * Used when a customer wants to pay online for a COD or previously unpaid order.
     * The webhook uses the raw orderId as reference_number to mark the order paid.
     */
    public function createOrderPayLink(Request $request)
    {
        try {
            $user = $request->user();
            if (!$user) {
                return $this->unauthorizedResponse();
            }

            $validated = $request->validate([
                'orderId' => 'required|string|regex:/^[a-f0-9]{24}$/i',
            ]);

            $order = Order::where('_id', $validated['orderId'])
                          ->where('userId', (string) $user->_id)
                          ->first();

            if (!$order) {
                return $this->notFoundResponse('Order');
            }

            if ($order->paymentStatus === 'paid') {
                return $this->errorResponse('This order has already been fully paid.', 422);
            }

            $totalPaid = collect($order->paymentHistory ?? [])->sum('amount');
            $amountDue = round(max(0, (float) ($order->totalAmount ?? 0) - $totalPaid), 2);

            if ($amountDue <= 0) {
                return $this->errorResponse('No outstanding balance on this order.', 422);
            }

            $orderId          = (string) $order->_id;
            $orderShortId     = strtoupper(substr($orderId, -8));
            $amountInCentavos = (int) round($amountDue * 100);
            $frontendUrl      = rtrim(config('app.frontend_url', env('FRONTEND_URL', 'http://localhost:3000')), '/');

            $pmResponse = Http::withBasicAuth($this->secretKey, '')
                ->post("{$this->baseUrl}/checkout_sessions", [
                    'data' => [
                        'attributes' => [
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
                                'amount'   => $amountInCentavos,
                                'name'     => "Order #{$orderShortId}",
                                'quantity' => 1,
                            ]],
                            'redirect' => [
                                'success' => "{$frontendUrl}/shop/payment-success?id={$orderId}",
                                'failed'  => "{$frontendUrl}/shop/payment-failed?id={$orderId}",
                            ],
                            'cancel_url' => "{$frontendUrl}/shop/orders-history",
                        ],
                    ],
                ]);

            if (!$pmResponse->successful()) {
                Log::error('PaymentController@createOrderPayLink: PayMongo error', [
                    'status' => $pmResponse->status(),
                    'body'   => $pmResponse->json(),
                ]);
                return $this->errorResponse('Failed to create payment session. Please try again.', 502);
            }

            $checkoutUrl = data_get($pmResponse->json(), 'data.attributes.checkout_url');
            if (!$checkoutUrl) {
                return $this->errorResponse('Payment session created but checkout URL is missing.', 502);
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
