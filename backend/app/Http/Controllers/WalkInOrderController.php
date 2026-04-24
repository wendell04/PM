<?php

namespace App\Http\Controllers;

use App\Models\Inventory;
use App\Models\Order;
use App\Models\Product;
use App\Models\Sale;
use App\Models\StockHistory;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Str;
use App\Services\PriceResolver;

class WalkInOrderController extends Controller
{
    /**
     * POST /api/admin/orders/walk-in
     * Creates an instant walk-in / POS order.
     * - No userId required (walk-in customer)
     * - orderSource = 'walk-in'
     * - orderStatus  = 'Delivered'  (instant — customer takes goods immediately)
     * - paymentStatus = 'paid'
     * - paymentMethod = 'cash' | 'gcash'
     * - Immediately creates Sale records + deducts inventory (same as completeOrder)
     */
    public function store(Request $request)
    {
        try {
            $user = $request->user();
            if (!$user || !in_array($user->role, ['admin', 'owner', 'cashier'])) {
                return response()->json(['message' => 'Unauthorized.'], 403);
            }

            $v = Validator::make($request->all(), [
                // POS contract (frontend) — keep backward-compatible aliases
                'customerName'    => 'nullable|string|max:120',
                'items'           => 'required|array|min:1',
                'items.*.productId'     => 'required|string',
                'items.*.name'          => 'nullable|string|max:255',
                'items.*.variantLabel'  => 'nullable|string|max:255',
                'items.*.quantity'      => 'nullable|integer|min:1',
                'items.*.price'         => 'nullable|numeric|min:0',
                // legacy keys (older POS / admin tooling)
                'items.*.variantId'     => 'nullable|string',
                'items.*.variantName'   => 'nullable|string',
                'items.*.qty'           => 'nullable|integer|min:1',
                'items.*.unitPrice'     => 'nullable|numeric|min:0',
                'paymentMethod'  => 'required|in:cash,gcash',
                'amountTendered' => 'nullable|numeric|min:0',
                'discount'       => 'nullable|numeric|min:0',
                'notes'          => 'nullable|string|max:1000',
            ]);

            if ($v->fails()) {
                return response()->json(['message' => 'Validation failed.', 'errors' => $v->errors()], 422);
            }

            $validated = $request->only([
                'customerName', 'items', 'paymentMethod', 'amountTendered', 'discount', 'notes',
            ]);

            // Build order items — resolve price server-side as a sanity check
            $orderItems  = [];
            $totalAmount = 0.0;

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

                $orderItems[] = [
                    'productId'   => (string) $product->_id,
                    'productName' => $product->name,
                    'variantId'   => $item['variantId']   ?? null,
                    'variantName' => $item['variantLabel'] ?? ($item['variantName'] ?? null),
                    'qty'         => $qty,
                    'unitPrice'   => $unitPrice,
                    'lineTotal'   => $lineTotal,
                ];
            }

            $customerName = trim($validated['customerName'] ?? '') ?: 'Walk-in Customer';
            $discount     = (float) ($validated['discount'] ?? 0);
            $discount     = max(0, $discount);
            $netAmount    = max(0, round($totalAmount - $discount, 2));

            $order = Order::create([
                'userId'          => null,
                'userSnapshot'    => [
                    'name'  => $customerName,
                    'email' => null,
                    'phone' => null,
                ],
                'items'           => $orderItems,
                'totalAmount'     => $netAmount,
                'discountAmount'  => $discount > 0 ? $discount : null,
                'voucherCode'     => null,
                'orderStatus'     => 'Delivered',
                'paymentStatus'   => 'paid',
                'paymentMethod'   => $validated['paymentMethod'],
                'orderSource'     => 'walk-in',
                'deliveryAddress' => null,
                'notes'           => isset($validated['notes'])
                    ? htmlspecialchars(strip_tags(trim($validated['notes'])), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8')
                    : null,
                'isRush'          => false,
                'checkoutRestricted' => false,
                'downPayment'     => $netAmount,
                'balance'         => 0,
                'paymentHistory'  => [[
                    'amount'    => $netAmount,
                    'method'    => $validated['paymentMethod'],
                    'note'      => 'Walk-in / POS payment',
                    'recordedBy'=> (string) $user->_id,
                    'createdAt' => now()->toISOString(),
                ]],
                'createdAt'       => now(),
                'updatedAt'       => now(),
            ]);

            // Immediately create Sale records + deduct inventory
            $this->recordSalesAndDeductInventory($order, $customerName, (string) $user->_id);

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

    private function recordSalesAndDeductInventory(Order $order, string $customerName, string $performedByUserId): void
    {
        try {
            foreach ($order->items as $item) {
                $product = Product::find($item['productId']);
                if (!$product || !$product->inventoryId) continue;

                $inventory = Inventory::find($product->inventoryId);
                if (!$inventory) {
                    Log::warning('WalkInOrderController@recordSales: inventory not found', [
                        'orderId'   => (string) $order->_id,
                        'productId' => $item['productId'],
                    ]);
                    continue;
                }

                $newSaleId   = 'SALE-' . strtoupper(substr(str_replace('-', '', Str::uuid()->toString()), 0, 8));
                $cost        = (float) ($inventory->averageCost ?? 0) * (int) $item['qty'];
                $profit      = (float) $item['lineTotal'] - $cost;
                $variantName = $item['variantName'] ?? '';

                Sale::create([
                    'saleId'          => $newSaleId,
                    'inventoryId'     => (string) $inventory->_id,
                    'productName'     => $product->name . ($variantName ? " ({$variantName})" : ''),
                    'category'        => $product->category,
                    'quantity'        => (int) $item['qty'],
                    'unitPrice'       => (float) $item['unitPrice'],
                    'totalPrice'      => (float) $item['lineTotal'],
                    'cost'            => $cost,
                    'profit'          => $profit,
                    'saleDate'        => now(),
                    'customerName'    => $customerName,
                    'customerContact' => null,
                    'customerEmail'   => null,
                    'source'          => 'walk-in',
                    'status'          => 'completed',
                    'notes'           => 'From Walk-in Order: ' . (string) $order->_id,
                    'createdAt'       => now(),
                ]);

                // Deduct inventory batches FIFO + write StockHistory for traceability (only if not on-demand)
                if (!$inventory->isOnDemand) {
                    $this->deductInventoryFIFO(
                        inventory: $inventory,
                        qty: (int) $item['qty'],
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
    }

}

