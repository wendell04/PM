<?php

namespace App\Http\Controllers;

use App\Models\OrderRequest;
use App\Models\Product;
use App\Models\Sale;
use App\Models\Inventory;
use App\Models\StockHistory;
use App\Models\Conversation;
use App\Models\Message;
use App\Models\Notification;
use App\Models\User;
use App\Events\MessageSent;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Facades\Http;
use App\Mail\OrderSubmittedMail;
use App\Mail\OrderConfirmedMail;
use App\Mail\OrderStatusMail;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

class OrderRequestController extends Controller
{
    /**
     * POST /order-requests
     */
    public function store(Request $request)
    {
        $user = $request->user();

        if (!$user) {
            return $this->unauthorizedResponse();
        }

        $validated = Validator::make($request->all(), [
            'productId'        => 'required|string',
            'quantity'         => 'required|integer|min:1',
            'designNotes'      => 'nullable|string|max:1000',
            'designUrl'        => 'nullable|string|url',
            'selectedVariants' => 'nullable|array',
            'isCustom'         => 'nullable|boolean',
            'designType'       => 'nullable|string|in:upload,request',
            'designFee'        => 'nullable|numeric|min:0',
        ])->validate();

        // Fetch product
        $product = Product::where('_id', $validated['productId'])
            ->where('isActive', true)
            ->where('isPublished', true)
            ->first();

        if (!$product) {
            return response()->json([
                'message' => 'Product not found or unavailable.',
            ], 422);
        }

        // Compute suggestedPrice
        $tiers = $product->priceTiers ?? $product->tiers ?? [];
        $qty = $validated['quantity'];
        $selectedVariants = $validated['selectedVariants'] ?? [];
        $suggestedPrice = null;

        if ($product->priceType === 'tiered' && count($tiers)) {
            $matchedTier = null;
            foreach ($tiers as $tier) {
                $min = (int) ($tier['minQty'] ?? 0);
                $max = $tier['maxQty'] !== null && $tier['maxQty'] !== ''
                    ? (int) $tier['maxQty'] : PHP_INT_MAX;
                if ($qty >= $min && $qty <= $max) {
                    $matchedTier = $tier;
                    break;
                }
            }
            if ($matchedTier) {
                $prices = $matchedTier['prices'] ?? [];
                if (count($selectedVariants) && count($prices) > 1) {
                    $sorted = $selectedVariants;
                    ksort($sorted);
                    $comboKey = json_encode($sorted, JSON_UNESCAPED_UNICODE);
                    $unitPrice = $prices[$comboKey]
                        ?? array_values($prices)[0] ?? null;
                } else {
                    $unitPrice = $prices['__base__']
                        ?? array_values($prices)[0] ?? null;
                }
                $suggestedPrice = $unitPrice !== null
                    ? (float) $unitPrice * $qty : null;
            }
        } elseif ($product->priceType === 'fixed') {
            $variantPrices = $product->variantPrices ?? [];
            if (count($selectedVariants) && count($variantPrices)) {
                $sorted = $selectedVariants;
                ksort($sorted);
                $comboKey = json_encode($sorted, JSON_UNESCAPED_UNICODE);
                $unitPrice = $variantPrices[$comboKey]
                    ?? array_values($variantPrices)[0] ?? null;
            } else {
                $unitPrice = $product->price ?? $product->flatPrice ?? null;
            }
            $suggestedPrice = $unitPrice !== null
                ? (float) $unitPrice * $qty : null;
        }

        // Build statusHistory entry
        $statusHistoryEntry = [
            'status'    => 'pending_review',
            'timestamp' => now()->toJSON(),
            'note'      => 'Order request submitted by customer.',
        ];

        $orderRequest = OrderRequest::create([
            'customerId'       => (string) $user->id,
            'customerName'     => trim(($user->firstName ?? '') . ' ' . ($user->lastName ?? '')),
            'customerEmail'    => $user->email ?? '',
            'productId'        => $validated['productId'],
            'productName'      => $product->subCategoryName ?? $product->name ?? '',
            'productThumbnail' => $product->thumbnail ?? null,
            'category'         => $product->category ?? '',
            'priceType'        => $product->priceType ?? 'inquiry',
            'selectedVariants' => $selectedVariants,
            'quantity'         => $validated['quantity'],
            'designUrl'        => $validated['designUrl'] ?? null,
            'designNotes'      => isset($validated['designNotes'])
                ? htmlspecialchars(strip_tags(trim($validated['designNotes'])), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8')
                : null,
            'designType'       => $validated['designType'] ?? 'upload',
            'designFee'        => isset($validated['designFee']) ? (float) $validated['designFee'] : 0,
            'isCustom'         => $validated['isCustom'] ?? false,
            'suggestedPrice'   => $suggestedPrice,
            'finalPrice'       => null,
            'downPayment'      => null,
            'paymentStatus'    => 'unpaid',
            'status'           => 'pending_review',
            'statusHistory'    => [$statusHistoryEntry],
        ]);

        try {
            // Inquiry requests are handled entirely via chat / Messenger — skip the "request received" email.
            if (($orderRequest->priceType ?? '') !== 'inquiry') {
                Mail::to($orderRequest->customerEmail)
                    ->send(new OrderSubmittedMail(
                        customerName:   $orderRequest->customerName,
                        orderId:        (string) $orderRequest->_id,
                        productName:    $orderRequest->productName,
                        quantity:       (int) $orderRequest->quantity,
                        suggestedPrice: (float) ($orderRequest->suggestedPrice ?? 0),
                    ));
            }
        } catch (\Exception $e) {
            Log::error('OrderSubmittedMail failed', [
                'orderId' => (string) $orderRequest->_id,
                'error'   => $e->getMessage(),
            ]);
        }

        return response()->json($orderRequest, 201);
    }

    /**
     * GET /admin/order-requests
     */
    public function index(Request $request)
    {
        $limit = min((int) $request->query('limit', 50), 100);
        $status = $request->query('status', null);

        $query = OrderRequest::orderBy('createdAt', 'desc')
            ->limit($limit);

        if ($status) {
            $query->where('status', $status);
        }

        $requests = $query->get();

        return response()->json([
            'data'  => $requests,
            'total' => $requests->count(),
        ]);
    }

    /**
     * GET /admin/order-requests/{id}
     */
    public function show($id)
    {
        $req = OrderRequest::find($id);
        if (!$req) {
            return response()->json([
                'message' => 'Order request not found.',
            ], 404);
        }

        return response()->json($req);
    }

    /**
     * PATCH /admin/order-requests/{id}/status
     */
    public function updateStatus(Request $request, $id)
    {
        $req = OrderRequest::find($id);
        if (!$req) {
            return response()->json([
                'message' => 'Order request not found.',
            ], 404);
        }

        $validated = Validator::make($request->all(), [
            'status'     => 'required|in:pending_review,confirmed,processing,ready,delivered,cancelled',
            'finalPrice' => 'nullable|numeric|min:0',
            'downPayment' => 'nullable|numeric|min:0',
            'paymentStatus' => 'nullable|in:unpaid,downpayment_paid,partial,paid',
            'eta' => 'nullable|date',
            'note'          => 'nullable|string|max:500',
            'adminComment'  => 'nullable|string|max:2000',
            'mockupUrl'     => 'nullable|string|url',
            'materials'                => 'nullable|array',
            'materials.*.inventoryId'  => 'required_with:materials|string',
            'materials.*.materialName' => 'nullable|string',
            'materials.*.qty'          => 'required_with:materials|numeric|min:0',
            'materials.*.unitCost'     => 'nullable|numeric|min:0',
        ])->validate();

        $user = $request->user();

        $newEntry = [
            'status'    => $validated['status'],
            'timestamp' => now()->toJSON(),
            'note'      => isset($validated['note'])
                ? htmlspecialchars(strip_tags(trim($validated['note'])), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8')
                : null,
            'updatedBy' => $user ? trim(($user->firstName ?? '') . ' ' . ($user->lastName ?? '')) : 'admin',
        ];

        $history = $req->statusHistory ?? [];
        $history[] = $newEntry;

        // Enforce valid status transitions
        $transitions = [
            'pending_review' => ['confirmed', 'cancelled'],
            'confirmed'      => ['processing', 'cancelled'],
            'processing'     => ['ready', 'cancelled'],
            'ready'          => ['delivered', 'cancelled'],
            'delivered'      => [],
            'cancelled'      => [],
        ];
        $currentStatus = $req->status ?? 'pending_review';
        $allowed = $transitions[$currentStatus] ?? [];
        if (!in_array($validated['status'], $allowed, true)) {
            return response()->json([
                'message' => "Invalid status transition: cannot move from '{$currentStatus}' to '{$validated['status']}'.",
            ], 422);
        }

        $req->status = $validated['status'];
        $req->statusHistory = $history;

        if (isset($validated['finalPrice']) && $validated['finalPrice'] !== null) {
            $req->finalPrice = (float) $validated['finalPrice'];
        }

        if (array_key_exists('downPayment', $validated)) {
            $req->downPayment = $validated['downPayment'] !== null
                ? (float) $validated['downPayment']
                : null;
        }

        if (array_key_exists('paymentStatus', $validated) && $validated['paymentStatus'] !== null) {
            $req->paymentStatus = (string) $validated['paymentStatus'];
        }

        if (array_key_exists('eta', $validated)) {
            $req->eta = $validated['eta'] !== null
                ? \Carbon\Carbon::parse($validated['eta'])
                : null;
        }

        if (array_key_exists('adminComment', $validated)) {
            $req->adminComment = isset($validated['adminComment'])
                ? htmlspecialchars(strip_tags(trim($validated['adminComment'])), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8')
                : null;
        }

        if (array_key_exists('mockupUrl', $validated)) {
            $req->mockupUrl = $validated['mockupUrl'] ?? null;
        }

        if (array_key_exists('materials', $validated)) {
            $materials = $validated['materials'] ?? [];
            $req->materials = $materials;
            // COGS for this made-to-order job = sum(qty × unit cost) of the assembled materials.
            $req->materialsCost = array_reduce($materials, function ($sum, $m) {
                return $sum + ((float) ($m['qty'] ?? 0) * (float) ($m['unitCost'] ?? 0));
            }, 0.0);
        }

        $req->save();

        if ($validated['status'] === 'confirmed') {
            // Push the quote into the customer's chat + an in-app notification so they can pay.
            $this->notifyQuoteInChat($req);

            // Inquiries are a chat-first channel — the quote card above is the notice, no email.
            if ($req->priceType !== 'inquiry') {
                try {
                    Mail::to($req->customerEmail)
                        ->send(new OrderConfirmedMail(
                            customerName:   $req->customerName,
                            orderId:        (string) $req->_id,
                            productName:    $req->productName,
                            quantity:       (int) $req->quantity,
                            suggestedPrice: (float) ($req->suggestedPrice ?? 0),
                        ));
                } catch (\Exception $e) {
                    Log::error('OrderConfirmedMail failed', [
                        'orderId' => (string) $req->_id,
                        'error'   => $e->getMessage(),
                    ]);
                }
            }
        }

        if ($validated['status'] === 'processing') {
            try {
                Mail::to($req->customerEmail)->send(new OrderStatusMail(
                    firstName:   explode(' ', $req->customerName)[0] ?? $req->customerName,
                    orderId:     (string) $req->_id,
                    newStatus:   'processing',
                    totalAmount: (float) ($req->finalPrice ?? 0.0),
                ));
            } catch (\Exception $e) {
                Log::error('OrderStatusMail failed', [
                    'orderId' => (string) $req->_id,
                    'error'   => $e->getMessage(),
                ]);
            }
        }

        if ($validated['status'] === 'ready') {
            try {
                Mail::to($req->customerEmail)->send(new OrderStatusMail(
                    firstName:   explode(' ', $req->customerName)[0] ?? $req->customerName,
                    orderId:     (string) $req->_id,
                    newStatus:   'ready',
                    totalAmount: (float) ($req->finalPrice ?? 0.0),
                ));
            } catch (\Exception $e) {
                Log::error('OrderStatusMail failed', [
                    'orderId' => (string) $req->_id,
                    'error'   => $e->getMessage(),
                ]);
            }
        }

        if ($validated['status'] === 'delivered') {
            try {
                Mail::to($req->customerEmail)->send(new OrderStatusMail(
                    firstName:   explode(' ', $req->customerName)[0] ?? $req->customerName,
                    orderId:     (string) $req->_id,
                    newStatus:   'delivered',
                    totalAmount: (float) ($req->finalPrice ?? 0.0),
                ));
            } catch (\Exception $e) {
                Log::error('OrderStatusMail failed', [
                    'orderId' => (string) $req->_id,
                    'error'   => $e->getMessage(),
                ]);
            }

            // Create Sale record for analytics and inventory deduction
            try {
                $product   = $req->productId ? Product::find($req->productId) : null;
                $inventory = ($product && $product->inventoryId)
                    ? Inventory::find($product->inventoryId)
                    : null;

                $qty        = (int) ($req->quantity ?? 1);
                $unitPrice  = (float) ($req->finalPrice ?? 0.0);
                $totalPrice = $unitPrice; // finalPrice is the total for the request
                // COGS resolved from BOM → inventory → product cost (services have no inventory link).
                // Prefer the materials cost the admin attached to the quote, if any.
                $cost       = ($req->materialsCost !== null && (float) $req->materialsCost > 0)
                    ? round((float) $req->materialsCost, 2)
                    : \App\Support\CostResolver::lineCost($product, $qty);
                $profit     = $totalPrice - $cost;

                $newSaleId = 'SALE-' . strtoupper(substr(
                    str_replace('-', '', Str::uuid()->toString()), 0, 8
                ));

                Sale::create([
                    'saleId'          => $newSaleId,
                    'inventoryId'     => $inventory ? (string) $inventory->_id : null,
                    'productName'     => $req->productName ?? 'Custom Order',
                    'category'        => $req->category ?? null,
                    'quantity'        => $qty,
                    'unitPrice'       => $unitPrice,
                    'totalPrice'      => $totalPrice,
                    'cost'            => $cost,
                    'profit'          => $profit,
                    'saleDate'        => now(),
                    'customerName'    => $req->customerName ?? 'Customer',
                    'customerEmail'   => $req->customerEmail ?? null,
                    'source'          => 'order_request',
                    'status'          => 'completed',
                    'orderRequestId'  => (string) $req->_id,
                    'notes'           => 'From Order Request: ' . (string) $req->_id,
                    'createdAt'       => now(),
                ]);

                // Deduct inventory FIFO if product has a linked inventory item
                if ($inventory && !$inventory->isOnDemand) {
                    $batches = $inventory->batches ?? [];
                    usort($batches, fn($a, $b) =>
                        strtotime($a['dateReceived'] ?? '0') <=>
                        strtotime($b['dateReceived'] ?? '0'));

                    $rem = $qty;
                    $batchDeductions = [];
                    foreach ($batches as &$batch) {
                        if ($rem <= 0) break;
                        $bq = $batch['remainingQty'] ?? $batch['goodQty'] ?? 0;
                        if ($bq <= 0) continue;
                        $d = min($bq, $rem);
                        $batch['remainingQty'] = $bq - $d;
                        $rem -= $d;
                        $batchDeductions[] = [
                            'batchId'  => $batch['batchId'] ?? null,
                            'qty'      => $d,
                            'unitCost' => $batch['unitCost'] ?? 0,
                        ];
                    }
                    unset($batch);

                    $newStock = max(0, (int) ($inventory->stockQty ?? 0) - $qty);
                    $inventory->batches  = $batches;
                    $inventory->stockQty = $newStock;
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
                            'reason'       => 'order_request',
                            'type'         => 'deduction',
                            'batchId'      => $bd['batchId'],
                            'sellingPrice' => $unitPrice,
                            'remarks'      => 'Order Request: ' . (string) $req->_id,
                            'performedBy'  => 'system',
                            'createdAt'    => now(),
                        ]);
                    }
                }

            } catch (\Exception $saleErr) {
                Log::error('OrderRequestController: failed to create Sale on delivery', [
                    'orderRequestId' => (string) $req->_id,
                    'error'          => $saleErr->getMessage(),
                ]);
                // Non-fatal — do not block the status update
            }
        }

        return response()->json($req);
    }

    /**
     * GET /my/order-requests
     */
    /**
     * POST /admin/quotations — the admin builds a quote straight from the chat.
     * Creates a CONFIRMED OrderRequest (the RFQ backbone) for the customer, then posts
     * the View & Pay quotation card into their chat. Works whether or not the customer
     * came through the product "Inquire" button (free-text product/service description).
     */
    public function adminQuote(Request $request)
    {
        $user = $request->user();
        if (!$user || !in_array($user->role ?? null, ['admin', 'owner'])) {
            return $this->unauthorizedResponse();
        }

        $validated = $request->validate([
            'recipientId'       => 'required|string',
            'items'             => 'required|array|min:1|max:20',
            'items.*.productId' => 'required|string',
            'items.*.qty'       => 'required|integer|min:1',
            'items.*.unitPrice' => 'required|numeric|min:0',
            'items.*.variantId'   => 'nullable|string|max:64',
            'items.*.variantName' => 'nullable|string|max:200',
            'items.*.materials'                 => 'nullable|array|max:30',
            'items.*.materials.*.inventoryId'   => 'required_with:items.*.materials|string',
            'items.*.materials.*.qty'           => 'required_with:items.*.materials|numeric|min:0',
            'designFee'         => 'nullable|numeric|min:0',
            'deliveryFee'       => 'nullable|numeric|min:0',
            'downPayment'       => 'nullable|numeric|min:0',
            'note'              => 'nullable|string|max:1000',
            'designUrl'         => 'nullable|string|max:1000',
            'designNotes'       => 'nullable|string|max:1000',
            'expiresInDays'     => 'nullable|integer|min:1|max:90',
        ]);

        $customer = User::where('_id', $validated['recipientId'])->first();
        if (!$customer) {
            return $this->errorResponse('Customer not found.', 404);
        }

        // Every line is resolved against the real catalog item so the quote — and the Order it
        // later converts into — carries ids/thumbnails, not typed strings. Name/thumbnail come
        // from the product; only qty and price are the admin's to set.
        $lineItems     = [];
        $goodsTotal    = 0.0;
        $materialTotal = 0.0;
        foreach ($validated['items'] as $row) {
            $product = Product::find($row['productId']);
            if (!$product) {
                return $this->errorResponse("Product '{$row['productId']}' no longer exists.", 422);
            }
            $qty       = (int) $row['qty'];
            $unitPrice = round((float) $row['unitPrice'], 2);
            $lineTotal = round($unitPrice * $qty, 2);
            $goodsTotal += $lineTotal;

            // Materials this line will consume. Costs are re-read from Inventory rather
            // than trusted from the client, so the recorded profit can't be spoofed and
            // always reflects what we actually last paid.
            $materials   = [];
            $lineMatCost = 0.0;
            foreach ($row['materials'] ?? [] as $m) {
                $inv   = Inventory::find($m['inventoryId'] ?? null);
                $mQty  = (float) ($m['qty'] ?? 0);
                if (!$inv || $mQty <= 0) continue;

                $mCost = (float) ($inv->lastUnitCost ?: $inv->averageCost ?: $inv->baseCost ?: 0);
                $lineMatCost += $mCost * $mQty;

                $materials[] = [
                    'inventoryId' => (string) $inv->_id,
                    'name'        => $inv->name,
                    'uom'         => $inv->uom,
                    'qty'         => $mQty,
                    'unitCost'    => $mCost,
                    'isOnDemand'  => (bool) ($inv->isOnDemand ?? false),
                ];
            }
            $materialTotal += $lineMatCost;

            $lineItems[] = [
                'productId'    => (string) $product->_id,
                'productName'  => $product->name,
                // The variant's own picture when it has one. A quote for a Magic Mug that shows the
                // plain white mug is describing a different product from the one being bought, and
                // this is the last screen before the customer pays. Same order of preference the
                // storefront already uses.
                'thumbnail'    => (function () use ($product, $row) {
                    $vid = $row['variantId'] ?? null;
                    if ($vid) {
                        $map = (array) ($product->variantImageUrls ?? []);
                        if (!empty($map[$vid])) return $map[$vid];
                        foreach ((array) ($product->combinations ?? []) as $c) {
                            if ((string) ($c['id'] ?? '') === (string) $vid && !empty($c['imageUrl'])) {
                                return $c['imageUrl'];
                            }
                        }
                    }
                    return $product->thumbnail ?? ($product->images[0] ?? null);
                })(),
                'category'     => $product->category ?? null,
                'variantId'    => $row['variantId'] ?? null,
                'variantName'  => $row['variantName'] ?? null,
                'qty'          => $qty,
                'unitPrice'    => $unitPrice,
                'lineTotal'    => $lineTotal,
                'materials'    => $materials,
                'materialCost' => round($lineMatCost, 2),
            ];
        }

        $designFee   = round((float) ($validated['designFee'] ?? 0), 2);
        $deliveryFee = round((float) ($validated['deliveryFee'] ?? 0), 2);
        $total       = round($goodsTotal + $designFee + $deliveryFee, 2);
        // Absent (blank) means "use the 50% default" — nullable rules drop the key entirely, so it
        // must be coalesced rather than read directly.
        $downPayment = isset($validated['downPayment']) ? round((float) $validated['downPayment'], 2) : null;

        // A design the owner attaches to the quote is already the agreed artwork (settled in
        // chat), so it is marked approved — the converted order skips the proof-approval gate
        // and goes straight to production. (Customer-uploaded custom designs are NOT approved
        // here; those still route through review on the product-page custom-order flow.)
        $designUrl   = !empty($validated['designUrl']) ? $validated['designUrl'] : null;
        $designNotes = $designUrl ? ($validated['designNotes'] ?? null) : null;

        $first = $lineItems[0];

        $orderRequest = OrderRequest::create([
            'customerId'    => (string) $customer->_id,
            'customerName'  => trim(($customer->firstName ?? '') . ' ' . ($customer->lastName ?? '')),
            'customerEmail' => $customer->email ?? null,
            'items'         => $lineItems,
            // Singular mirrors of the first line — kept populated so anything still reading the
            // old fields (list previews, legacy screens) keeps working. lineItems is the truth.
            'productId'        => $first['productId'],
            'productName'      => $first['productName'],
            'productThumbnail' => $first['thumbnail'],
            'category'         => $first['category'],
            'priceType'     => 'inquiry',
            'quantity'      => array_sum(array_column($lineItems, 'qty')),
            'designFee'     => $designFee,
            'shippingFee'   => $deliveryFee,
            'finalPrice'    => $total,
            'suggestedPrice'=> $total,
            'downPayment'   => $downPayment,
            // Costing is a two-stage affair: at quote time the material cost is only an
            // estimate (on-demand stock isn't bought until the customer commits), so it
            // is stored as such and re-stated with the real purchase cost later.
            'estimatedMaterialCost' => round($materialTotal, 2),
            'costBasis'             => 'estimated',
            'adminComment'  => $validated['note'] ?? null,
            'designUrl'     => $designUrl,
            'designNotes'   => $designNotes,
            'designType'    => $designUrl ? 'upload' : null,
            'designApproved'=> $designUrl ? true : false,
            'status'        => 'confirmed',
            'paymentStatus' => 'unpaid',
            // Quote validity — after this the customer can no longer pay the quoted price (default 7 days).
            'expiresAt'     => now()->addDays((int) ($validated['expiresInDays'] ?? 7)),
            'statusHistory' => [['status' => 'confirmed', 'at' => now()->toISOString()]],
            'createdAt'     => now(),
            'updatedAt'     => now(),
        ]);

        $this->notifyQuoteInChat($orderRequest, [
            'designFee'   => $designFee,
            'deliveryFee' => $deliveryFee,
            'designUrl'   => $designUrl,
        ]);

        return $this->successResponse('Quotation sent.', $orderRequest);
    }

    /**
     * Post the confirmed quote into the customer's chat as a quotation card (with a
     * View & Pay CTA deep-links to /shop/checkout/quote/{id}) plus an in-app notification.
     * Chat-first channel for inquiries — replaces the confirmation email. Best-effort/non-fatal.
     */
    private function notifyQuoteInChat(OrderRequest $req, array $extraMeta = []): void
    {
        try {
            $customerId = (string) $req->customerId;
            $admin      = User::whereIn('role', ['admin', 'owner'])->first();
            if (!$admin || $customerId === '') {
                return;
            }
            $adminId = (string) $admin->_id;

            // Find or create the 1-to-1 conversation (string participants — matches ChatController).
            $participants = [$customerId, $adminId];
            sort($participants);
            $conversation = Conversation::where('participants', $customerId)->get()
                ->first(function ($c) use ($customerId, $adminId) {
                    $parts = array_map('strval', is_array($c->participants) ? $c->participants : []);
                    return in_array($customerId, $parts, true) && in_array($adminId, $parts, true);
                });
            if (!$conversation) {
                $conversation = Conversation::create([
                    'participants'    => $participants,
                    'last_message_at' => now(),
                    'is_active'       => true,
                ]);
            }

            $finalPrice = round((float) ($req->finalPrice ?? 0), 2);
            $lineItems  = $req->lineItems;
            $qty        = max(1, (int) ($req->quantity ?? 1));
            $down       = ($req->downPayment !== null && (float) $req->downPayment > 0)
                ? round((float) $req->downPayment, 2)
                : round($finalPrice * 0.5, 2);
            $dpPct      = $finalPrice > 0 ? (int) round($down / $finalPrice * 100) : 50;

            $body = count($lineItems) > 1
                ? 'Here is your quote for ' . count($lineItems) . ' items.'
                : "Here is your quote for {$req->productName}.";

            $message = Message::create([
                'conversation_id' => (string) $conversation->_id,
                'sender_id'       => $adminId,
                'sender_name'     => trim(($admin->firstName ?? '') . ' ' . ($admin->lastName ?? '')) ?: 'Store',
                'body'            => $body,
                'type'            => 'quotation',
                'metadata'        => array_merge([
                    // The card is the CUSTOMER's copy - it carries only what they should
                    // read. Passing the raw line items would ship our material costs into
                    // a chat message, where they are one DevTools tab away.
                    'items'          => array_map(fn ($li) => [
                        'productId'   => $li['productId']   ?? null,
                        'productName' => $li['productName'] ?? null,
                        'thumbnail'   => $li['thumbnail']   ?? null,
                        'variantName' => $li['variantName'] ?? null,
                        'qty'         => $li['qty']         ?? 0,
                        'unitPrice'   => $li['unitPrice']   ?? 0,
                        'lineTotal'   => $li['lineTotal']   ?? 0,
                    ], $lineItems),
                    'productName'    => $req->productName,
                    'thumbnail'      => $req->productThumbnail,
                    'qty'            => $qty,
                    'total'          => $finalPrice,
                    'downPayment'    => $down,
                    'downPaymentPct' => $dpPct,
                    'orderRequestId' => (string) $req->_id,
                    'note'           => $req->adminComment ?? '',
                ], $extraMeta),
                'is_read'         => false,
            ]);

            $conversation->update([
                'last_message'    => 'Sent a quotation',
                'last_message_at' => now(),
            ]);

            try {
                broadcast(new MessageSent($message))->toOthers();
            } catch (\Throwable $e) {
                Log::warning('Quote chat broadcast failed (message still saved): ' . $e->getMessage());
            }

            Notification::create([
                'user_id'    => $customerId,
                'type'       => 'quote_ready',
                'title'      => 'Your quote is ready',
                'message'    => count($lineItems) > 1
                    ? "We've sent a price for " . count($lineItems) . " items, including \"{$req->productName}\". Tap to review and pay."
                    : "We've sent a price for \"{$req->productName}\". Tap to review and pay.",
                'is_read'    => false,
                'data'       => [
                    'orderRequestId' => (string) $req->_id,
                    'link'           => '/shop/checkout/quote/' . (string) $req->_id,
                ],
                'created_at' => now(),
            ]);
        } catch (\Throwable $e) {
            Log::warning('notifyQuoteInChat failed', ['orderId' => (string) $req->_id, 'error' => $e->getMessage()]);
        }
    }

    public function myRequests(Request $request)
    {
        $user = $request->user();

        if (!$user) {
            return $this->unauthorizedResponse();
        }

        $requests = OrderRequest::where(
            'customerId', (string) $user->id
        )
            ->orderBy('createdAt', 'desc')
            ->get();

        return response()->json([
            'data'  => $requests->map(fn ($r) => $r->toCustomerArray()),
            'total' => $requests->count(),
        ]);
    }

    /**
     * POST /order-requests/upload-design
     */
    public function uploadDesign(Request $request)
    {
        $user = $request->user();

        if (!$user) {
            return $this->unauthorizedResponse();
        }

        // A file over PHP's upload_max_filesize never arrives - PHP discards it and leaves only an
        // error code behind, so `required|file` fails as though nothing was attached. Said plainly
        // here, because "the design field is required" describes a file the customer can see.
        // Not hasFile() - that calls isValidFile(), which rejects a dropped upload for having an
        // empty temp path, so the guard would never have run on the one case it exists for.
        $attempted = $request->file('design');
        if (is_object($attempted) && $attempted->getError() === UPLOAD_ERR_INI_SIZE) {
            return response()->json([
                'message' => 'That file is too large for the server to accept. Please send one under 10 MB.',
            ], 422);
        }

        $validated = Validator::make($request->all(), [
            // webp was missing here while the storefront offered it, so a .webp passed the
            // browser check and then failed on upload with no useful explanation.
            'design' => 'required|file|mimes:jpg,jpeg,png,webp,pdf,ai,psd,svg|max:10240',
        ])->validate();

        $cloudName = config('services.cloudinary.cloud_name');
        $uploadPreset = config('services.cloudinary.upload_preset');

        if (!$cloudName || !$uploadPreset) {
            return response()->json([
                'message' => 'Cloudinary configuration missing.',
            ], 500);
        }

        // `auto` classifies a PDF as an IMAGE resource, because Cloudinary can rasterise and
        // transform one. The delivered URL is then /image/upload/....pdf, which returns 401 until PDF
        // delivery is enabled on the account and, once enabled, serves a derived asset rather than the
        // bytes the customer uploaded - so the browser reports "Failed to load PDF document" on a file
        // that is perfectly valid. Artwork must come back byte-identical: it goes to the printer.
        //
        // `raw` stores and serves the original untouched. Only the formats Cloudinary genuinely treats
        // as images stay on the image pipeline, where thumbnails and transforms are worth having.
        $ext          = strtolower($validated['design']->getClientOriginalExtension());
        $resourceType = in_array($ext, ['jpg', 'jpeg', 'png', 'webp', 'gif', 'svg'], true) ? 'image' : 'raw';

        $response = Http::attach(
            'file',
            file_get_contents($validated['design']->getPathname()),
            $validated['design']->getClientOriginalName()
        )->post("https://api.cloudinary.com/v1_1/{$cloudName}/{$resourceType}/upload", [
            'upload_preset' => $uploadPreset,
            'folder'        => 'pmp-designs',
        ]);

        if ($response->successful()) {
            $data = $response->json();
            return response()->json([
                'url'       => $data['secure_url'],
                'public_id' => $data['public_id'],
                // Cloudinary names the stored file itself, so the customer would otherwise
                // only ever see a random string where their artwork's name should be.
                'name'      => $validated['design']->getClientOriginalName(),
            ]);
        }

        // Cloudinary states its reason; repeating it beats replacing it, because "failed" sent the
        // customer back to retry a file that was refused for a fixed reason - size, format, account.
        Log::warning('Cloudinary design upload failed', [
            'status' => $response->status(),
            'body'   => $response->body(),
        ]);

        return response()->json([
            'message' => $response->json('error.message') ?: 'Failed to upload design.',
        ], 502);
    }

    /**
     * GET /api/admin/order-requests/stats
     * Returns order request conversion and status breakdown.
     * Optional: startDate, endDate
     */
    public function stats(Request $request)
    {
        try {
            if (!$this->hasPermission($request, 'orderRequests')) {
                return $this->unauthorizedResponse();
            }

            $query = \App\Models\OrderRequest::query()
                ->when($request->filled('startDate'), fn($q) => $q->where('createdAt', '>=', $request->startDate))
                ->when($request->filled('endDate'),   fn($q) => $q->where('createdAt', '<=', $request->endDate));

            $total     = (clone $query)->count();
            $pending   = (clone $query)->where('status', 'pending_review')->count();
            $confirmed = (clone $query)->where('status', 'confirmed')->count();
            $processing= (clone $query)->where('status', 'processing')->count();
            $ready     = (clone $query)->where('status', 'ready')->count();
            $delivered = (clone $query)->where('status', 'delivered')->count();
            $cancelled = (clone $query)->where('status', 'cancelled')->count();

            $conversionRate = $total > 0
                ? round((($confirmed + $processing + $ready + $delivered) / $total) * 100, 2)
                : 0;

            return $this->successResponse('Order request stats fetched successfully.', [
                'total'          => $total,
                'pending'        => $pending,
                'confirmed'      => $confirmed,
                'processing'     => $processing,
                'ready'          => $ready,
                'delivered'      => $delivered,
                'cancelled'      => $cancelled,
                'conversionRate' => $conversionRate,
            ]);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'Failed to fetch order request stats.');
        }
    }
}
