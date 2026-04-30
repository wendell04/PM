<?php

namespace App\Http\Controllers;

use App\Models\OrderRequest;
use App\Models\Product;
use App\Models\Sale;
use App\Models\Inventory;
use App\Models\StockHistory;
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
            Mail::to($orderRequest->customerEmail)
                ->send(new OrderSubmittedMail(
                    customerName:   $orderRequest->customerName,
                    orderId:        (string) $orderRequest->_id,
                    productName:    $orderRequest->productName,
                    quantity:       (int) $orderRequest->quantity,
                    suggestedPrice: (float) ($orderRequest->suggestedPrice ?? 0),
                ));
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

        $req->save();

        if ($validated['status'] === 'confirmed') {
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
                $cost       = $inventory
                    ? (float) ($inventory->averageCost ?? 0) * $qty
                    : 0.0;
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
            'data'  => $requests,
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

        $validated = Validator::make($request->all(), [
            'design' => 'required|file|mimes:jpg,jpeg,png,pdf,ai,psd,svg|max:10240',
        ])->validate();

        $cloudName = config('services.cloudinary.cloud_name');
        $uploadPreset = config('services.cloudinary.upload_preset');

        if (!$cloudName || !$uploadPreset) {
            return response()->json([
                'message' => 'Cloudinary configuration missing.',
            ], 500);
        }

        $response = Http::attach(
            'file',
            file_get_contents($validated['design']->getPathname()),
            $validated['design']->getClientOriginalName()
        )->post("https://api.cloudinary.com/v1_1/{$cloudName}/auto/upload", [
            'upload_preset' => $uploadPreset,
            'folder'        => 'pmp-designs',
        ]);

        if ($response->successful()) {
            $data = $response->json();
            return response()->json([
                'url'       => $data['secure_url'],
                'public_id' => $data['public_id'],
            ]);
        }

        return response()->json([
            'message' => 'Failed to upload design.',
        ], 500);
    }

    /**
     * GET /api/admin/order-requests/stats
     * Returns order request conversion and status breakdown.
     * Optional: startDate, endDate
     */
    public function stats(Request $request)
    {
        try {
            if (!$this->isAdmin($request)) {
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
