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
    /**
     * POST /api/order-requests/open
     *
     * A quote request for something that is NOT in the catalogue.
     *
     * Every existing path into a quotation starts from a product page, so a customer wanting
     * something the shop does not list - a run of shirts they are supplying, an event giveaway,
     * a service - had nowhere to ask but the chat box. This is the standalone form: it describes
     * the job in the customer's own words and lands in the same Quotations list as everything
     * else, so the shop has one queue rather than a queue plus a conversation to remember.
     *
     * Deliberately NOT a loosening of store(): that method reads the product for pricing tiers,
     * variants and a thumbnail, and every consumer downstream assumes a product is there. An open
     * request carries `isOpenRequest` so both the list and the quotation editor can tell that
     * there is nothing to look up.
     */
    public function storeOpen(Request $request)
    {
        $user = $request->user();
        if (!$user) {
            return $this->unauthorizedResponse();
        }

        $validated = Validator::make($request->all(), [
            'summary'   => 'required|string|max:120',
            'details'   => 'required|string|max:2000',
            'quantity'  => 'nullable|integer|min:1|max:100000',
            'neededBy'  => 'nullable|date',
            'budget'    => 'nullable|numeric|min:0',
            'designUrl' => 'nullable|string|url|max:2048',
        ])->validate();

        $clean = fn ($v) => $v === null ? null
            : htmlspecialchars(strip_tags(trim((string) $v)), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');

        $summary = $clean($validated['summary']);

        $orderRequest = OrderRequest::create([
            'customerId'       => (string) $user->id,
            'customerName'     => trim(($user->firstName ?? '') . ' ' . ($user->lastName ?? '')),
            'customerEmail'    => $user->email ?? '',
            // No product exists. The name is what the customer called the job, so every screen
            // that prints productName keeps working without a special case.
            'productId'        => null,
            'productName'      => $summary,
            'productThumbnail' => null,
            'category'         => 'Custom request',
            'priceType'        => 'inquiry',
            'isOpenRequest'    => true,
            'selectedVariants' => [],
            'quantity'         => (int) ($validated['quantity'] ?? 1),
            'neededBy'         => $validated['neededBy'] ?? null,
            'budget'           => isset($validated['budget']) ? (float) $validated['budget'] : null,
            'designUrl'        => $validated['designUrl'] ?? null,
            'designNotes'      => $clean($validated['details']),
            'designType'       => !empty($validated['designUrl']) ? 'upload' : 'request',
            'designFee'        => 0,
            'isCustom'         => true,
            'suggestedPrice'   => null,
            'finalPrice'       => null,
            'downPayment'      => null,
            'paymentStatus'    => 'unpaid',
            'status'           => 'pending_review',
            'statusHistory'    => [[
                'status'    => 'pending_review',
                'at'        => now()->toISOString(),
                'by'        => 'customer',
                'note'      => 'Quote requested for something not in the catalogue.',
            ]],
        ]);

        // The ask goes into the customer's chat thread as an inquiry card, the same shape a
        // product-page inquiry has. That is where the shop reads asks and answers them with a
        // quotation - a request that only existed in a table nobody opens was an unanswered one.
        $this->postAskInChat($orderRequest, $user, [
            'qty'      => (int) ($validated['quantity'] ?? 1),
            'budget'   => isset($validated['budget']) ? (float) $validated['budget'] : null,
            'neededBy' => $validated['neededBy'] ?? null,
            'details'  => $clean($validated['details']),
        ]);

        return $this->successResponse(
            'Thanks - we have your request. We will come back to you with a price, and you will see it in your chat with us.',
            $orderRequest
        );
    }

    /** The customer's ask, in their own thread, as if they had typed it there. */
    private function postAskInChat(OrderRequest $req, User $customer, array $ask): void
    {
        try {
            [$conversation] = $this->quoteConversation($req);
            if (!$conversation) return;

            $bits = ["Qty {$ask['qty']}"];
            if ($ask['budget'] !== null && $ask['budget'] > 0) $bits[] = 'budget PHP ' . number_format($ask['budget'], 2);
            if (!empty($ask['neededBy'])) {
                try { $bits[] = 'needed by ' . \Carbon\Carbon::parse($ask['neededBy'])->format('M j'); } catch (\Throwable) {}
            }
            $body = implode(' - ', $bits) . ($ask['details'] !== '' ? "\n" . $ask['details'] : '');

            $message = Message::create([
                'conversation_id' => (string) $conversation->_id,
                'sender_id'       => (string) $customer->_id,
                'sender_name'     => trim(($customer->firstName ?? '') . ' ' . ($customer->lastName ?? '')) ?: 'Customer',
                'body'            => $body,
                'type'            => 'inquiry',
                'metadata'        => [
                    'productName'    => $req->productName,
                    'thumbnail'      => $req->designUrl ?: null,
                    'category'       => 'Custom request',
                    'productSlug'    => null,
                    'productId'      => null,
                    'orderRequestId' => (string) $req->_id,
                    'isOpenRequest'  => true,
                ],
                'is_read'         => false,
            ]);
            $conversation->update(['last_message' => 'Requested a quote', 'last_message_at' => now()]);
            try { broadcast(new MessageSent($message))->toOthers(); } catch (\Throwable $e) {
                Log::warning('Ask chat broadcast failed (message still saved): ' . $e->getMessage());
            }
        } catch (\Throwable $e) {
            Log::warning('Could not post ask into chat: ' . $e->getMessage(), ['requestId' => (string) $req->_id]);
        }
    }

    public function store(Request $request)
    {
        $user = $request->user();

        if (!$user) {
            return $this->unauthorizedResponse();
        }

        $validated = Validator::make($request->all(), [
            'productId'        => 'required|string|max:128',
            'quantity'         => 'required|integer|min:1',
            'designNotes'      => 'nullable|string|max:1000',
            'designUrl'        => 'nullable|string|url|max:2048',
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

        // The Inquire button fires this on every click, and the product page fires it again on
        // arrival. Thirteen of the fifteen requests on live are pending_review and most are the
        // same customer asking about the same product four times - Heat Press Subcon appears four
        // times, Silkscreen four, DTF twice. Each one is a row somebody has to read and dismiss.
        //
        // A second ask about the same thing is not a second job. While an earlier request is still
        // waiting to be priced, update it instead of stacking another beside it; once it has been
        // quoted or turned down, a fresh ask is a genuinely new one and gets its own row.
        $open = OrderRequest::where('customerId', (string) $user->id)
            ->where('productId', $validated['productId'])
            ->where('status', 'pending_review')
            ->orderBy('createdAt', 'desc')
            ->first();

        if ($open) {
            $open->quantity         = $validated['quantity'];
            $open->selectedVariants = $selectedVariants;
            if (!empty($validated['designUrl']))   $open->designUrl   = $validated['designUrl'];
            if (!empty($validated['designNotes'])) $open->designNotes = htmlspecialchars(strip_tags(trim($validated['designNotes'])), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
            $open->suggestedPrice = $suggestedPrice;
            $open->updatedAt      = now();
            $history              = $open->statusHistory ?? [];
            $history[]            = [
                'status' => 'pending_review',
                'at'     => now()->toISOString(),
                'by'     => 'customer',
                'note'   => 'Asked again about the same product - this request was updated rather than duplicated.',
            ];
            $open->statusHistory = $history;
            $open->save();

            return $this->successResponse(
                'You already have a request in for this - we have updated it. We will come back to you with a price.',
                $open
            );
        }

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
            // Inquiry requests are handled entirely via chat / Messenger - skip the "request received" email.
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
        if (!$this->hasPermission($request, 'orderRequests.view')) {
            return $this->unauthorizedResponse();
        }
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
    public function show(Request $request, $id)
    {
        if (!$this->hasPermission($request, 'orderRequests.view')) {
            return $this->unauthorizedResponse();
        }
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
        if (!$this->hasPermission($request, 'orderRequests.approve')) {
            return $this->unauthorizedResponse();
        }
        $req = OrderRequest::find($id);
        if (!$req) {
            return response()->json([
                'message' => 'Order request not found.',
            ], 404);
        }

        $validated = Validator::make($request->all(), [
            'status'     => 'required|in:pending_review,confirmed,processing,ready,delivered,cancelled,answered',
            'finalPrice' => 'nullable|numeric|min:0',
            'downPayment' => 'nullable|numeric|min:0',
            // How long the customer has to pay it. Same default the chat path uses.
            'expiresInDays' => 'nullable|integer|min:1|max:60',
            'paymentStatus' => 'nullable|in:unpaid,downpayment_paid,partial,paid',
            'eta' => 'nullable|date',
            'note'          => 'nullable|string|max:500',
            'adminComment'  => 'nullable|string|max:2000',
            'mockupUrl'     => 'nullable|string|url|max:2048',
            'materials'                => 'nullable|array',
            'materials.*.inventoryId'  => 'required_with:materials|string|max:128',
            'materials.*.materialName' => 'nullable|string|max:160',
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
            // confirmed -> confirmed is a re-quote: a new price or a fresh validity, re-sent.
            // An expired quote is still 'confirmed' underneath, so this is also how it is revived.
            'confirmed'      => ['confirmed', 'processing', 'cancelled'],
            'processing'     => ['ready', 'cancelled'],
            'ready'          => ['delivered', 'cancelled'],
            'delivered'      => [],
            'cancelled'      => [],
            // Terminal, like cancelled: the quotation that answered it is the live record now,
            // and moving this one on would put the same job in the pipeline twice.
            'answered'       => [],
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

        // A quotation is an offer with a shelf life. The chat path always stamped one; this path
        // never did, so quotes made here stayed payable at whatever the price was months ago.
        if ($validated['status'] === 'confirmed') {
            $days = (int) ($validated['expiresInDays'] ?? 7);
            $req->expiresAt = now()->addDays($days);
            $req->quotedAt  = now();
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

            // Inquiries are a chat-first channel - the quote card above is the notice, no email.
            if ($req->priceType !== 'inquiry') {
                try {
                    Mail::to($req->customerEmail)
                        ->send(new OrderConfirmedMail(
                            customerName:   $req->customerName,
                            orderId:        (string) $req->_id,
                            productName:    $req->productName,
                            quantity:       (int) $req->quantity,
                            // The price the customer is being asked to pay, not the one the
                            // form suggested before anyone looked at it.
                            suggestedPrice: (float) ($req->finalPrice ?? $req->suggestedPrice ?? 0),
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
                // Non-fatal - do not block the status update
            }
        }

        return response()->json($req);
    }

    /**
     * GET /my/order-requests
     */
    /**
     * POST /admin/quotations - the admin builds a quote straight from the chat.
     * Creates a CONFIRMED OrderRequest (the RFQ backbone) for the customer, then posts
     * the View & Pay quotation card into their chat. Works whether or not the customer
     * came through the product "Inquire" button (free-text product/service description).
     */
    public function adminQuote(Request $request)
    {
        $user = $request->user();
        // Checked against the permission grid, not against role NAMES. The hard-coded list refused
        // every staff role - including Administrator, whose own role template grants Order Requests
        // in full - so a shop that had set someone up to handle quotations could not send one, and
        // the reply was a bare "Forbidden".
        if (!$this->hasPermission($request, 'orderRequests.create')) {
            return $this->unauthorizedResponse();
        }

        $validated = $request->validate([
            'recipientId'       => 'required|string|max:128',
            'items'             => 'required|array|min:1|max:20',
            'items.*.productId' => 'required|string|max:128',
            'items.*.qty'       => 'required|integer|min:1',
            'items.*.unitPrice' => 'required|numeric|min:0',
            'items.*.variantId'   => 'nullable|string|max:64',
            'items.*.variantName' => 'nullable|string|max:200',
            'items.*.materials'                 => 'nullable|array|max:30',
            'items.*.materials.*.inventoryId'   => 'required_with:items.*.materials|string|max:128',
            'items.*.materials.*.qty'           => 'required_with:items.*.materials|numeric|min:0',
            'designFee'         => 'nullable|numeric|min:0',
            'deliveryFee'       => 'nullable|numeric|min:0',
            'downPayment'       => 'nullable|numeric|min:0',
            'note'              => 'nullable|string|max:1000',
            'designUrl'         => 'nullable|string|max:1000',
            // A job has a front and a back, a shirt has a mockup and a print-ready file, and a
            // layout arrives as a PDF as often as a PNG. One url could show one image; this takes
            // the set, and designUrl stays as the first of them for every screen written before.
            'designUrls'        => 'nullable|array|max:10',
            'designUrls.*.url'  => 'required_with:designUrls|string|max:1000',
            'designUrls.*.name' => 'nullable|string|max:200',
            'designNotes'       => 'nullable|string|max:1000',
            'expiresInDays'     => 'nullable|integer|min:1|max:90',
            // Which filled-in order forms this quotation answers. IDS ONLY - the content is read
            // from the ask on this side, so nothing the browser sends can change what the
            // customer is later shown they agreed to.
            'orderFormAskIds'   => 'nullable|array|max:5',
            'orderFormAskIds.*' => 'string|size:24',
            // Which address the delivery fee was priced for. For a saved one only its id counts -
            // the rest is read from the customer's record (App\Support\DeliverTo).
            'deliverTo'           => 'nullable|array',
            'deliverTo.source'    => 'required_with:deliverTo|in:saved,form,typed',
            'deliverTo.addressId' => 'nullable|string|max:64',
            'deliverTo.text'      => 'nullable|string|max:' . \App\Support\DeliverTo::MAX_TEXT,
        ]);

        $customer = User::where('_id', $validated['recipientId'])->first();
        if (!$customer) {
            return $this->errorResponse('Customer not found.', 404);
        }

        // The forms this quotation answers, copied whole from the asks they were filled into.
        // Each one carries the questions as they were sent, the answers as they were given, and
        // when it was agreed - so the quote, the checkout and the order all show the same thing
        // however the template changes afterwards.
        $attachedForms = [];
        $attachedAsks  = [];
        foreach (array_unique((array) ($validated['orderFormAskIds'] ?? [])) as $askId) {
            $ask = OrderRequest::find($askId);
            if (!$ask || (string) $ask->customerId !== (string) $customer->_id) continue;
            $snap = $ask->orderFormAnswers;
            if (!is_array($snap) || $snap === []) continue;
            $attachedForms[] = [
                'askId'       => (string) $ask->_id,
                'formName'    => (string) ($snap['form']['name'] ?? 'Order form'),
                'submittedAt' => (string) ($snap['agreedAt'] ?? ''),
                'answers'     => $snap,
            ];
            $attachedAsks[] = (string) $ask->_id;
        }

        // Every line is resolved against the real catalog item so the quote - and the Order it
        // later converts into - carries ids/thumbnails, not typed strings. Name/thumbnail come
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
                // What KIND of thing this line is, read off the catalogue at quote time. The
                // conversion works this out again on payment; carrying it here is what lets the
                // checkout screen know whether it is selling bespoke work - which needs the custom
                // order terms agreed - or something off a shelf, which does not.
                'isCustom'      => (bool) ($product->isCustom ?? false),
                'isMadeToOrder' => (bool) ($product->isMadeToOrder ?? false) || (bool) ($product->isCustom ?? false),
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
        $deliverTo   = \App\Support\DeliverTo::fromRequest($validated['deliverTo'] ?? null, $customer, $attachedForms);
        // A fee priced for nowhere cannot be checked against anything at payment.
        if ($deliveryFee > 0 && !$deliverTo) {
            return $this->errorResponse('Choose the address this delivery fee is for.', 422);
        }
        // Absent (blank) means "use the 50% default" - nullable rules drop the key entirely, so it
        // must be coalesced rather than read directly.
        $downPayment = isset($validated['downPayment']) ? round((float) $validated['downPayment'], 2) : null;

        // A design the owner attaches to the quote is already the agreed artwork (settled in
        // chat), so it is marked approved - the converted order skips the proof-approval gate
        // and goes straight to production. (Customer-uploaded custom designs are NOT approved
        // here; those still route through review on the product-page custom-order flow.)
        $designFiles = array_values(array_filter(
            array_map(fn ($f) => [
                'url'  => trim((string) ($f['url'] ?? '')),
                'name' => trim((string) ($f['name'] ?? '')) ?: null,
            ], (array) ($validated['designUrls'] ?? [])),
            fn ($f) => $f['url'] !== ''
        ));
        // The single field still decides everything downstream that predates the list, so the
        // first attachment fills it whether it arrived alone or as one of several.
        $designUrl   = !empty($validated['designUrl'])
            ? $validated['designUrl']
            : ($designFiles[0]['url'] ?? null);
        if ($designUrl && empty($designFiles)) {
            $designFiles = [['url' => $designUrl, 'name' => null]];
        }
        $designNotes = $designUrl ? ($validated['designNotes'] ?? null) : null;

        $first = $lineItems[0];

        $orderRequest = OrderRequest::create([
            'customerId'    => (string) $customer->_id,
            'customerName'  => trim(($customer->firstName ?? '') . ' ' . ($customer->lastName ?? '')),
            'customerEmail' => $customer->email ?? null,
            'items'         => $lineItems,
            // Singular mirrors of the first line - kept populated so anything still reading the
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
            'orderForms'    => $attachedForms ?: null,
            'deliverTo'     => $deliverTo,
            'adminComment'  => $validated['note'] ?? null,
            'designUrl'     => $designUrl,
            'designUrls'    => $designFiles ?: null,
            'designNotes'   => $designNotes,
            'designType'    => $designUrl ? 'upload' : null,
            'designApproved'=> $designUrl ? true : false,
            'status'        => 'confirmed',
            'paymentStatus' => 'unpaid',
            // Quote validity - after this the customer can no longer pay the quoted price (default 7 days).
            'expiresAt'     => now()->addDays((int) ($validated['expiresInDays'] ?? 7)),
            'statusHistory' => [['status' => 'confirmed', 'at' => now()->toISOString()]],
            'createdAt'     => now(),
            'updatedAt'     => now(),
        ]);

        // The quotation answers whatever this customer was still asking. Left open, the ask would
        // sit in the "waiting" count after the shop had already replied to it.
        //
        // But only what it ACTUALLY answered. This closed every waiting ask the customer had, so a
        // shop quoting the shirts silently closed the request for the mugs - no notice, and
        // recorded as cancelled. A filled-in form is a specific job with a price of its own, so it
        // is closed only by a quotation that attached it. A plain inquiry carries no form and no
        // such claim, so a quotation still answers those.
        try {
            $answered = OrderRequest::where('customerId', (string) $validated['recipientId'])
                ->where('status', 'pending_review')
                ->where(function ($q) { $q->whereNull('finalPrice')->orWhere('finalPrice', 0); })
                ->get();
            $closing = \App\Support\QuoteAnswering::toClose(
                $answered->map(fn ($a) => [
                    'id'       => (string) $a->_id,
                    'fromForm' => is_array($a->orderFormAnswers) && $a->orderFormAnswers !== [],
                ])->all(),
                $attachedAsks
            );
            $answered = $answered->filter(fn ($a) => in_array((string) $a->_id, $closing, true));
            foreach ($answered as $ask) {
                $h   = $ask->statusHistory ?? [];
                $h[] = ['status' => 'answered', 'at' => now()->toISOString(), 'by' => 'admin',
                        'note' => 'Answered with quotation ' . (string) $orderRequest->_id . '.'];
                // Answered, not cancelled. A quotation is a reply; cancelling is what
                // happens when work is called off, and the two were being recorded as the same
                // thing - so every count of cancelled work included every ask the shop had
                // actually replied to. Rows written before this stay 'cancelled' with
                // answeredByQuoteId beside them, and both are read as answered.
                $ask->status            = 'answered';
                $ask->answeredByQuoteId = (string) $orderRequest->_id;
                $ask->statusHistory     = $h;
                $ask->save();
            }
        } catch (\Throwable $e) {
            Log::warning('Could not mark asks answered: ' . $e->getMessage());
        }

        $this->notifyQuoteInChat($orderRequest, [
            'designFee'   => $designFee,
            'deliveryFee' => $deliveryFee,
            'designUrl'   => $designUrl,
        ]);

        return $this->successResponse('Quotation sent.', $orderRequest);
    }

    /**
     * The forms this customer has filled in and nobody has quoted yet.
     *
     * For the attach row on the quotation: what it was called, when it was sent in, and enough of
     * the answers to tell two apart at a glance ("30 shirts" against "12 mugs"). Ids and summaries
     * only - the quotation copies the content itself, from this side.
     */
    public function customerOrderForms(Request $request, $customerId)
    {
        if (!$this->hasPermission($request, 'orderRequests.create')) {
            return $this->unauthorizedResponse();
        }
        $rows = OrderRequest::where('customerId', (string) $customerId)
            ->where('status', 'pending_review')
            ->orderBy('createdAt', 'desc')
            ->limit(20)
            ->get()
            ->filter(fn ($a) => is_array($a->orderFormAnswers) && $a->orderFormAnswers !== [])
            ->map(function ($a) {
                $snap = $a->orderFormAnswers;
                $form = is_array($snap['form'] ?? null) ? $snap['form'] : null;
                return [
                    'askId'       => (string) $a->_id,
                    'formName'    => (string) ($form['name'] ?? 'Order form'),
                    'submittedAt' => (string) ($snap['agreedAt'] ?? ($a->createdAt ? $a->createdAt->toIso8601String() : '')),
                    'quantity'    => (int) ($a->quantity ?? 0),
                    // What they typed as the address when they asked. The courier is booked from a
                    // pinned address the customer picks at checkout, but the delivery fee is priced
                    // on this screen, and a customer who wrote somewhere else meant it.
                    'address'     => (string) ($snap['address'] ?? ''),
                    'headline'    => (string) ($a->productName ?? ''),
                    'summary'     => $form
                        ? \App\Support\OrderFormSpec::summarise($form, (array) ($snap['answers'] ?? []))
                        : (string) ($a->designNotes ?? ''),
                ];
            })
            ->values();

        return $this->successResponse('Order forms.', $rows);
    }

    /**
     * Post the confirmed quote into the customer's chat as a quotation card (with a
     * View & Pay CTA deep-links to /shop/checkout/quote/{id}) plus an in-app notification.
     * Chat-first channel for inquiries - replaces the confirmation email. Best-effort/non-fatal.
     */
    /**
     * The customer's 1-to-1 thread with the shop, found or created (string participants - matches
     * ChatController). Shared by the quote card and the stock messages that follow it.
     *
     * @return array{0:?Conversation,1:?User}
     */
    private function quoteConversation(OrderRequest $req): array
    {
        $customerId = (string) $req->customerId;
        $admin      = User::whereIn('role', ['admin', 'owner'])->first();
        if (!$admin || $customerId === '') {
            return [null, null];
        }
        $adminId = (string) $admin->_id;

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
        return [$conversation, $admin];
    }

    /** A plain message from the shop in the customer's thread, plus the bell. */
    private function postQuoteText(OrderRequest $req, string $body): void
    {
        try {
            [$conversation, $admin] = $this->quoteConversation($req);
            if (!$conversation) return;

            $message = Message::create([
                'conversation_id' => (string) $conversation->_id,
                'sender_id'       => (string) $admin->_id,
                'sender_name'     => trim(($admin->firstName ?? '') . ' ' . ($admin->lastName ?? '')) ?: 'Store',
                'body'            => $body,
                'type'            => 'text',
                'is_read'         => false,
            ]);
            $conversation->update(['last_message' => $body, 'last_message_at' => now()]);
            try {
                broadcast(new MessageSent($message))->toOthers();
            } catch (\Throwable $e) {
                Log::warning('Quote stock message broadcast failed (message still saved): ' . $e->getMessage());
            }
            Notification::create([
                'user_id'    => (string) $req->customerId,
                'type'       => 'quote_ready',
                'title'      => 'Your quote can be paid',
                'message'    => $body,
                'is_read'    => false,
                'data'       => ['orderRequestId' => (string) $req->_id, 'link' => '/shop/checkout/quote/' . (string) $req->_id],
                'created_at' => now(),
            ]);
        } catch (\Throwable $e) {
            Log::warning('postQuoteText failed', ['orderRequestId' => (string) $req->_id, 'error' => $e->getMessage()]);
        }
    }

    /** Guard shared by the two stock actions: an unpaid, unexpired quote the admin can act on. */
    private function actionableQuote(Request $request, string $id)
    {
        $user = $request->user();
        if (!$this->hasPermission($request, 'orderRequests.edit')) {
            return [null, $this->unauthorizedResponse()];
        }
        $req = OrderRequest::find($id);
        if (!$req) {
            return [null, $this->errorResponse('Quote not found.', 404)];
        }
        if (!empty($req->convertedOrderId) || ($req->paymentStatus ?? 'unpaid') !== 'unpaid') {
            return [null, $this->errorResponse('This quote has already been paid.', 422)];
        }
        if ($req->expiresAt && now()->greaterThan($req->expiresAt)) {
            return [null, $this->errorResponse('This quote has expired - send a new one instead.', 422)];
        }
        return [$req, null];
    }

    /**
     * POST /api/admin/quotations/{id}/allow-preorder
     *
     * Let THIS quote be paid past the shelf. Turning pre-order on for the product would open it on
     * the storefront for everyone; a quote is a negotiated deal, so the owner decides it alone.
     */
    public function allowPreorder(Request $request, string $id)
    {
        [$req, $error] = $this->actionableQuote($request, $id);
        if ($error) return $error;

        $days = 0;
        foreach (\App\Support\QuoteStock::shortages($req) as $short) {
            $days = max($days, (int) ($short['leadTimeDays'] ?? 0));
        }

        $req->allowPreorder = true;
        $req->stockBlock    = null;
        $req->save();

        $this->postQuoteText($req, 'Good news - you can pay for your quote now. Part of it will be made after we restock'
            . ($days > 0 ? ", which adds about {$days} day" . ($days === 1 ? '' : 's') : '')
            . '. Tap View & Pay on your quote.');

        return $this->successResponse('Pre-order allowed for this quote. The customer has been told they can pay.');
    }

    /**
     * POST /api/admin/quotations/{id}/restocked
     *
     * The owner says the stock is in. Checked, not trusted - a quote marked restocked while still
     * short would send the customer straight back into the same refusal.
     */
    public function markRestocked(Request $request, string $id)
    {
        [$req, $error] = $this->actionableQuote($request, $id);
        if ($error) return $error;

        $shortages = \App\Support\QuoteStock::shortages($req);
        if (!\App\Support\QuoteStock::mayPayPastShelf($req, $shortages)) {
            $list = implode(', ', array_map(fn ($x) => ($x['name'] ?? 'a material') . ' needs ' . $x['short'] . ' more', $shortages));
            return $this->errorResponse("Still short: {$list}. Stock it in first, or allow pre-order for this quote.", 422);
        }

        $req->stockBlock = null;
        $req->save();

        $this->postQuoteText($req, 'The items for your quote are back in stock - you can pay for it now. Tap View & Pay on your quote.');

        return $this->successResponse('Marked restocked. The customer has been told they can pay.');
    }

    private function notifyQuoteInChat(OrderRequest $req, array $extraMeta = []): void
    {
        try {
            $customerId = (string) $req->customerId;
            [$conversation, $admin] = $this->quoteConversation($req);
            if (!$conversation) {
                return;
            }
            $adminId = (string) $admin->_id;

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
            if (!$this->hasPermission($request, 'orderRequests.view')) {
                return $this->unauthorizedResponse();
            }

            $query = \App\Models\OrderRequest::query()
                ->when($request->filled('startDate'), fn($q) => $q->where('createdAt', '>=', \App\Support\RequestDates::start($request->startDate)))
                ->when($request->filled('endDate'),   fn($q) => $q->where('createdAt', '<=', \App\Support\RequestDates::end($request->endDate)));

            $total     = (clone $query)->count();
            $pending   = (clone $query)->where('status', 'pending_review')->count();
            $confirmed = (clone $query)->where('status', 'confirmed')->count();
            $processing= (clone $query)->where('status', 'processing')->count();
            $ready     = (clone $query)->where('status', 'ready')->count();
            $delivered = (clone $query)->where('status', 'delivered')->count();
            $cancelled = (clone $query)->where('status', 'cancelled')->count();
            // Asks the shop replied to with a quotation. They used to be counted as cancelled,
            // which made cancelled work look worse than it was, and they sit in the denominator
            // below as if they were a separate deal that never closed - they are not, the
            // quotation they became is already counted in its own right.
            $answered  = (clone $query)->where('status', 'answered')->count();
            $deals     = max(0, $total - $answered);

            $conversionRate = $deals > 0
                ? round((($confirmed + $processing + $ready + $delivered) / $deals) * 100, 2)
                : 0;

            return $this->successResponse('Order request stats fetched successfully.', [
                'total'          => $total,
                'pending'        => $pending,
                'confirmed'      => $confirmed,
                'processing'     => $processing,
                'ready'          => $ready,
                'delivered'      => $delivered,
                'cancelled'      => $cancelled,
                'answered'       => $answered,
                'conversionRate' => $conversionRate,
            ]);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'Failed to fetch order request stats.');
        }
    }
}
