<?php

namespace App\Http\Controllers;

use App\Models\Inventory;
use App\Models\Order;
use App\Models\Product;
use App\Models\Sale;
use App\Models\StockHistory;
use App\Models\AuditLog;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Str;
use App\Services\PriceResolver;
use App\Support\OrderStatus;

class WalkInOrderController extends Controller
{
    /**
     * POST /api/admin/orders/walk-in
     * Creates an instant walk-in / POS order.
     * - No userId required (walk-in customer)
     * - orderSource = 'walk-in'
     * - orderStatus  = 'Delivered'  (instant - customer takes goods immediately)
     * - paymentStatus = 'paid'
     * - paymentMethod = 'cash' | 'gcash'
     * - Immediately creates Sale records + deducts inventory (same as completeOrder)
     */
    public function store(Request $request)
    {
        try {
            $user = $request->user();
            if (!$user) {
                return response()->json(['message' => 'Unauthorized.'], 401);
            }
            if (!$this->hasAnyPermission($request, ['pos.sell', 'orders.create'])) {
                return $this->unauthorizedResponse();
            }

            $v = Validator::make($request->all(), [
                // POS contract (frontend) - keep backward-compatible aliases
                'customerName'    => 'nullable|string|max:120',
                'items'           => 'required|array|min:1',
                'items.*.productId'     => 'required|string|max:128',
                'items.*.name'          => 'nullable|string|max:255',
                'items.*.variantLabel'  => 'nullable|string|max:255',
                'items.*.quantity'      => 'nullable|integer|min:1',
                'items.*.price'         => 'nullable|numeric|min:0',
                // legacy keys (older POS / admin tooling)
                'items.*.variantId'     => 'nullable|string|max:128',
                'items.*.variantName'   => 'nullable|string|max:160',
                'items.*.qty'           => 'nullable|integer|min:1',
                'items.*.unitPrice'     => 'nullable|numeric|min:0',
                // A service priced by quotation has no bill of materials, so the staff member picks
                // what it actually consumes. When present these win over the product's BOM.
                'items.*.materials'               => 'nullable|array|max:30',
                'items.*.materials.*.inventoryId' => 'required_with:items.*.materials|string|max:128',
                'items.*.materials.*.name'        => 'nullable|string|max:200',
                'items.*.materials.*.qty'         => 'required_with:items.*.materials|numeric|min:0',
                'paymentMethod'  => 'required|in:cash,gcash,paymaya,card,bank_transfer',
                'amountTendered' => 'nullable|numeric|min:0',
                'discount'       => 'nullable|numeric|min:0',
                'notes'          => 'nullable|string|max:1000',

                // A counter sale and an order taken over Messenger are not the same transaction.
                // 'collected' is goods handed over now; 'production' is work still to be made, which
                // must enter the normal pipeline instead of being booked as delivered and paid.
                'saleType'       => 'nullable|in:collected,production',
                'paymentMode'    => 'nullable|in:full,downpayment,unpaid',
                'amountPaid'     => 'nullable|numeric|min:0',
                'fulfillment'    => 'nullable|in:collected,pickup,delivery',
                'customerPhone'  => 'nullable|string|max:40',
                'deliveryAddress'=> 'nullable|string|max:500',
                'targetDate'     => 'nullable|date',
            ]);

            if ($v->fails()) {
                return response()->json(['message' => 'Validation failed.', 'errors' => $v->errors()], 422);
            }

            $validated = $request->only([
                'customerName', 'items', 'paymentMethod', 'amountTendered', 'discount', 'notes',
                'saleType', 'paymentMode', 'amountPaid', 'fulfillment', 'customerPhone',
                'deliveryAddress', 'targetDate',
            ]);

            // Build order items - resolve price server-side as a sanity check
            $orderItems  = [];
            $totalAmount = 0.0;
            $anyToMake   = false;   // does any line need the bench?

            foreach ($validated['items'] as $item) {
                $product = Product::find($item['productId']);
                if (!$product) {
                    return response()->json(['message' => "Product not found: {$item['productId']}"], 422);
                }

                $qty       = (int) ($item['quantity'] ?? $item['qty'] ?? 0);
                $unitPrice = (float) ($item['price'] ?? $item['unitPrice'] ?? 0);
                if ($qty < 1) {
                    return response()->json(['message' => 'Invalid quantity.'], 422);
                }

                // Server-side price sanity: resolve expected price and reject
                // if client price deviates by more than 1 peso (rounding tolerance)
                $resolvedPrice = PriceResolver::resolve($product, $qty, $item['variantId'] ?? null);
                if ($resolvedPrice !== null && abs($unitPrice - $resolvedPrice) > 1.00) {
                    return response()->json([
                        'message' => "Price mismatch for \"{$product->name}\". Expected ₱" . number_format($resolvedPrice, 2) . ", received ₱" . number_format($unitPrice, 2) . ".",
                    ], 422);
                }

                $lineTotal    = round($unitPrice * $qty, 2);
                $totalAmount += $lineTotal;

                // The same flags the online path writes. Job Orders, Production and Home all
                // decide "does this need making?" from them; without them a custom line taken in
                // at the counter looked like a shelf item and never reached the bench.
                $lineIsCustom = (bool) ($product->isCustom ?? false) && !($product->allowPlainPurchase ?? false);
                $lineIsMade   = (bool) ($product->isMadeToOrder ?? false);
                if ($lineIsCustom || $lineIsMade) $anyToMake = true;

                $orderItems[] = [
                    'productId'     => (string) $product->_id,
                    'productName'   => $product->name,
                    'variantId'     => $item['variantId']   ?? null,
                    'variantName'   => $item['variantLabel'] ?? ($item['variantName'] ?? null),
                    'qty'           => $qty,
                    'unitPrice'     => $unitPrice,
                    'lineTotal'     => $lineTotal,
                    'isCustom'      => $lineIsCustom,
                    'isMadeToOrder' => $lineIsMade,
                    // Hand-picked materials for a service with no recipe. Kept on the line so the
                    // job order and any later costing can see what this job actually consumed.
                    'materials'   => !empty($item['materials']) ? array_values(array_map(fn ($m) => [
                        'inventoryId' => (string) $m['inventoryId'],
                        'name'        => $m['name'] ?? null,
                        'qty'         => (float) $m['qty'],
                    ], $item['materials'])) : null,
                ];
            }

            $customerName = trim($validated['customerName'] ?? '') ?: 'Walk-in Customer';
            $discount     = (float) ($validated['discount'] ?? 0);
            $discount     = max(0, $discount);
            $netAmount    = max(0, round($totalAmount - $discount, 2));

            // Default to the historical behaviour so anything still posting the old payload keeps
            // working: goods handed over, paid in full.
            $saleType    = $validated['saleType']    ?? 'collected';
            $paymentMode = $validated['paymentMode'] ?? 'full';
            $fulfillment = $validated['fulfillment'] ?? ($saleType === 'collected' ? 'collected' : 'pickup');

            // How much actually changed hands.
            $paid = match ($paymentMode) {
                'full'        => $netAmount,
                'unpaid'      => 0.0,
                'downpayment' => min($netAmount, max(0, round((float) ($validated['amountPaid'] ?? 0), 2))),
            };
            $balance = max(0, round($netAmount - $paid, 2));

            $paymentStatus = $balance <= 0 ? 'paid' : ($paid > 0 ? 'partial' : 'unpaid');

            // A collected sale is finished the moment it is rung up. An order still to be produced
            // joins the same pipeline an online order uses, so it can be job-ordered, made, checked
            // and released rather than being booked as delivered before anyone has touched it.
            $orderStatus = $saleType === 'collected'
                ? OrderStatus::DELIVERED
                : OrderStatus::PROCESSING;

            $history = [];
            if ($paid > 0) {
                $history[] = [
                    'amount'     => $paid,
                    'method'     => $validated['paymentMethod'],
                    'note'       => $paymentMode === 'downpayment' ? 'Counter downpayment' : 'Counter payment',
                    'recordedBy' => (string) $user->_id,
                    'createdAt'  => now()->toISOString(),
                ];
            }

            $order = Order::create([
                'userId'          => null,
                'userSnapshot'    => [
                    'name'  => $customerName,
                    'email' => null,
                    'phone' => trim($validated['customerPhone'] ?? '') ?: null,
                ],
                'items'           => $orderItems,
                'totalAmount'     => $netAmount,
                'discountAmount'  => $discount > 0 ? $discount : null,
                'voucherCode'     => null,
                'orderStatus'     => $orderStatus,
                'paymentStatus'   => $paymentStatus,
                'paymentMethod'   => $validated['paymentMethod'],
                'orderSource'     => 'walk-in',
                // Artwork on a counter order is settled at the counter: the customer brought the
                // file or agreed the design with the staff in front of them. There is no proof
                // cycle to wait for, so the job-order gate is open from the start. Only an order
                // still to be produced carries these; a collected sale never sees a bench.
                'isCustomOrder'   => $saleType !== 'collected' && $anyToMake,
                'designStatus'    => $saleType !== 'collected' && $anyToMake ? 'approved' : null,
                'saleType'        => $saleType,
                'fulfillment'     => $fulfillment,
                'deliveryAddress' => $fulfillment === 'delivery' && !empty($validated['deliveryAddress'])
                    ? ['formatted' => htmlspecialchars(strip_tags(trim($validated['deliveryAddress'])), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8')]
                    : null,
                'estimatedDeliveryMax' => !empty($validated['targetDate'])
                    ? \Carbon\Carbon::parse($validated['targetDate'])->toIso8601String()
                    : null,
                'notes'           => isset($validated['notes'])
                    ? htmlspecialchars(strip_tags(trim($validated['notes'])), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8')
                    : null,
                'isRush'          => false,
                'checkoutRestricted' => false,
                'downPayment'     => $paid,
                'balance'         => $balance,
                'paymentHistory'  => $history,
                'recordedBy'      => (string) $user->_id,
                'createdAt'       => now(),
                'updatedAt'       => now(),
            ]);

            // Stock moves only when the goods actually leave. An order still to be produced reserves
            // its materials instead, exactly as an online made-to-order does, and consumes them when
            // QC passes - booking the sale now would double-count both the stock and the revenue.
            if ($saleType === 'collected') {
                $this->recordSalesAndDeductInventory($order, $customerName, (string) $user->_id);
            } else {
                $this->reserveMaterialsForProduction($order);
            }

            $orderRef = strtoupper(substr((string) $order->_id, -8));

            return response()->json([
                'data'    => [
                    'orderId'    => (string) $order->_id,
                    'orderRef'   => $orderRef,
                    'totalAmount'=> $netAmount,
                    'discount'   => $discount,
                    'paymentMethod' => $validated['paymentMethod'],
                    'amountTendered' => (float) ($validated['amountTendered'] ?? 0),
                    'items'      => $orderItems,
                    // The receipt has to say what actually happened: goods handed over and settled,
                    // or work booked with a balance still to collect.
                    'saleType'      => $saleType,
                    'fulfillment'   => $fulfillment,
                    'amountPaid'    => $paid,
                    'balance'       => $balance,
                    'paymentStatus' => $paymentStatus,
                    'orderStatus'   => $orderStatus,
                    'customerName'  => $customerName,
                ],
            ], 201);

        } catch (\Exception $e) {
            Log::error('WalkInOrderController@store: ' . $e->getMessage(), [
                'trace' => $e->getTraceAsString(),
            ]);
            return response()->json(['message' => 'An unexpected error occurred.'], 500);
        }
    }

    // ── Private helpers ──────────────────────────────────────────────────────

    /**
     * Reserve the raw materials an order still has to be produced from, rather than consuming them.
     * Mirrors the made-to-order path in OrderController@store: reservedQty rises so the stock is
     * committed and cannot be promised twice, while stockQty only falls when QC passes. No Sale
     * record is written here either - nothing has been sold until the goods exist.
     */
    private function reserveMaterialsForProduction(Order $order): void
    {
        foreach ($order->items as $item) {
            try {
                $product = Product::find($item['productId'] ?? null);
                if (!$product) continue;

                // A service line carries its own hand-picked materials, already totalled for the
                // whole job, and those take precedence. Everything else falls back to the product's
                // recipe, which is expressed per unit and has to be multiplied by the quantity.
                $manual = !empty($item['materials']) && is_array($item['materials']);
                if ($manual) {
                    $lines = array_map(fn ($m) => [
                        'inventoryId' => $m['inventoryId'] ?? null,
                        'qty'         => (float) ($m['qty'] ?? 0),
                    ], $item['materials']);
                } else {
                    $bom = $product->resolveBom($item['variantId'] ?? null);
                    if (!$bom || empty($bom->components)) continue;
                    $lines = array_map(fn ($c) => [
                        'inventoryId' => $c['inventoryId'] ?? null,
                        'qty'         => ((float) ($c['qty'] ?? 0)) * (int) ($item['qty'] ?? 1),
                    ], $bom->components);
                }

                foreach ($lines as $component) {
                    $inv = Inventory::find($component['inventoryId'] ?? null);
                    if (!$inv || $inv->isOnDemand) continue;

                    $needed = (int) round((float) ($component['qty'] ?? 0));
                    if ($needed <= 0) continue;

                    $inv->reservedQty = (int) ($inv->reservedQty ?? 0) + $needed;
                    $inv->save();

                    StockHistory::create([
                        'inventoryId'  => (string) $inv->_id,
                        'quantity'     => $needed,
                        'remainingQty' => (int) ($inv->stockQty ?? 0),
                        'unitCost'     => $inv->averageCost ?? 0,
                        'totalCost'    => 0,
                        'reason'       => 'production_reserved',
                        'type'         => 'reservation',
                        'performedBy'  => 'system',
                        'orderId'      => (string) $order->_id,
                        'productId'    => (string) ($product->_id ?? ''),
                        'productName'  => $product->name ?? '',
                        'customerName' => $order->userSnapshot['name'] ?? '',
                        'remarks'      => 'Reserved for production (counter order): ' . (string) $order->_id,
                        'createdAt'    => now(),
                    ]);
                }
            } catch (\Exception $e) {
                Log::warning('reserveMaterialsForProduction failed', [
                    'orderId' => (string) $order->_id,
                    'error'   => $e->getMessage(),
                ]);
            }
        }
    }

    private function recordSalesAndDeductInventory(Order $order, string $customerName, string $performedByUserId): void
    {
        try {
            // The counter discount, shared across the lines by value - see DiscountAllocator.
            $discShares = \App\Support\DiscountAllocator::shares(array_values($order->items ?? []), (float) ($order->discountAmount ?? 0));
            foreach (array_values($order->items) as $lineIdx => $item) {
                $netLine = round((float) $item['lineTotal'] - (float) ($discShares[$lineIdx] ?? 0), 2);
                $product = Product::find($item['productId']);
                if (!$product) continue;

                // `inventoryId` is a resold finished good - something bought in and sold as itself.
                // NOTHING in this catalogue is that: all 24 products are made here, so they carry a
                // recipe and no inventory row. Requiring one meant every counter sale fell through
                // this loop and wrote no Sale record and deducted no material - the money never
                // reached Sales or Reports, and the shelf never moved.
                //
                // Three shapes, in the order they take precedence:
                //   1. hand-picked materials on the line  (a service priced at the counter)
                //   2. the product's recipe               (everything made here)
                //   3. its own inventory row              (a resold finished good)
                $inventory = $product->inventoryId ? Inventory::find($product->inventoryId) : null;

                $consume = [];   // [inventoryId => qty for the whole line]
                if (!empty($item['materials']) && is_array($item['materials'])) {
                    foreach ($item['materials'] as $m) {
                        $id = (string) ($m['inventoryId'] ?? '');
                        if ($id !== '') $consume[$id] = ($consume[$id] ?? 0) + (float) ($m['qty'] ?? 0);
                    }
                } elseif ($inventory) {
                    $consume[(string) $inventory->_id] = (int) $item['qty'];
                } else {
                    $bom = $product->resolveBom($item['variantId'] ?? null);
                    foreach ($bom->components ?? [] as $c) {
                        $id = (string) ($c['inventoryId'] ?? '');
                        if ($id !== '') $consume[$id] = ($consume[$id] ?? 0) + ((float) ($c['qty'] ?? 0)) * (int) ($item['qty'] ?? 1);
                    }
                }

                $newSaleId   = 'SALE-' . strtoupper(substr(str_replace('-', '', Str::uuid()->toString()), 0, 8));
                // Cost is what the line actually consumes. Reading averageCost off a single
                // inventory row only works for a resold good; a made item costs the sum of its
                // materials, and a service costs whatever was picked for it.
                $cost = 0.0;
                foreach ($consume as $invId => $qty) {
                    $ci = Inventory::find($invId);
                    if ($ci) $cost += (float) ($ci->averageCost ?? $ci->lastUnitCost ?? 0) * (float) $qty;
                }
                $profit      = $netLine - $cost;
                $variantName = $item['variantName'] ?? '';

                Sale::create([
                    'saleId'          => $newSaleId,
                    'inventoryId'     => $inventory ? (string) $inventory->_id : null,
                    // Written so the forecast can resolve a counter sale without a name map, the
                    // same way OrderController@completeOrder does for online ones.
                    'productId'       => (string) $product->_id,
                    'variantId'       => $item['variantId'] ?? null,
                    'variantName'     => $variantName !== '' ? $variantName : null,
                    'productName'     => $product->name . ($variantName ? " ({$variantName})" : ''),
                    'category'        => $product->category,
                    'quantity'        => (int) $item['qty'],
                    'unitPrice'       => (float) $item['unitPrice'],
                    'totalPrice'      => $netLine,
                    'discount'        => ((float) ($discShares[$lineIdx] ?? 0)) > 0 ? (float) $discShares[$lineIdx] : null,
                    'cost'            => $cost,
                    'profit'          => $profit,
                    'saleDate'        => $order->createdAt ?? now(),
                    'customerName'    => $customerName,
                    'customerContact' => null,
                    'customerEmail'   => null,
                    'source'          => 'walk-in',
                    'status'          => 'completed',
                    'notes'           => 'From Walk-in Order: ' . (string) $order->_id,
                    'createdAt'       => now(),
                ]);

                // Deduct what the line consumes, FIFO, with a ledger row each so Stock Out History
                // shows a counter sale the same way it shows a production job.
                foreach ($consume as $invId => $qty) {
                    $ci = Inventory::find($invId);
                    $take = (int) round((float) $qty);
                    if (!$ci || $take <= 0) continue;
                    // On-demand material is bought for the job, not held - it never had a shelf
                    // figure to reduce.
                    if ($ci->isOnDemand) continue;
                    $this->deductInventoryFIFO(
                        inventory: $ci,
                        qty: $take,
                        reason: 'sales-outside',
                        sellingPrice: (float) ($item['unitPrice'] ?? 0),
                        customerName: $customerName,
                        performedBy: $performedByUserId,
                        remarks: "Walk-in POS Order: " . (string) $order->_id,
                    );
                }
            }
        } catch (\Exception $e) {
            Log::error('WalkInOrderController@recordSales: ' . $e->getMessage(), [
                'orderId' => (string) $order->_id,
            ]);
        }
    }

    /**
     * Deducts stock from batches FIFO (oldest first) and writes StockHistory records per-batch.
     */
    private function deductInventoryFIFO(
        Inventory $inventory,
        int $qty,
        string $reason,
        float $sellingPrice,
        string $customerName,
        string $performedBy,
        ?string $remarks = null,
    ): void {
        $qty = max(0, $qty);
        if ($qty <= 0) return;

        $batches = $inventory->batches ?? [];
        usort($batches, function ($a, $b) {
            return strtotime($a['dateReceived'] ?? '0') <=> strtotime($b['dateReceived'] ?? '0');
        });

        $available = array_reduce($batches, function ($carry, $b) {
            return $carry + ($b['remainingQty'] ?? $b['goodQty'] ?? 0);
        }, 0);

        if ($available < $qty) {
            throw new \Exception('Insufficient stock.');
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

        // Write per-batch StockHistory records (mirrors InventoryController@adjustStock behavior)
        $runningRemaining = $newStock + $qty; // pre-deduction
        foreach ($batchDeductions as $bd) {
            $runningRemaining -= $bd['qty'];
            StockHistory::create([
                'inventoryId'   => $inventory->_id,
                'quantity'      => $bd['qty'],
                'remainingQty'  => $runningRemaining,
                'unitCost'      => $bd['unitCost'],
                'totalCost'     => $bd['qty'] * $bd['unitCost'],
                'reason'        => $reason,
                'type'          => 'deduction',
                'batchId'       => $bd['batchId'],
                'sellingPrice'  => $sellingPrice,
                'saleDate'      => now(),
                'customerName'  => $customerName,
                'remarks'       => $remarks,
                'performedBy'   => $performedBy,
                'createdAt'     => now(),
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
                'sellingPrice' => $sellingPrice,
                'customerName' => $customerName,
                'saleDate'     => now(),
                'remarks'      => $remarks ?? '',
                'performedBy'  => $performedBy,
                'createdAt'    => now(),
            ]);
        } catch (\Exception $auditEx) {
            Log::warning('AuditLog write failed (WalkInOrderController@deductInventoryFIFO)', ['error' => $auditEx->getMessage()]);
        }
    }

}

