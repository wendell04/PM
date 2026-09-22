<?php

namespace App\Http\Controllers;

use App\Models\AuditLog;
use App\Models\Inventory;
use App\Models\StockHistory;
use App\Models\Supplier;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;

class InventoryController extends Controller
{
    private function bustInventoryListCache(): void
    {
        // Kept for explicit call sites; the Inventory model also bumps this on every save, so a
        // reservation made by a customer now invalidates the admin's list too. The key is global
        // because the data is: one warehouse, not one per signed-in user.
        Cache::increment('inventory_list_ver');
    }

    /**
     * GET /api/inventory
     * Returns all active inventory items
     */
    /**
     * GET /api/admin/inventory/to-buy
     *
     * What has to be purchased for work already committed to.
     *
     * Demand is summed from orders that are paid (or part-paid) and not yet finished, then
     * compared against what is physically on hand. Reserved quantities are deliberately NOT
     * subtracted: those reservations belong to these very orders, so counting both would
     * double the shortfall.
     *
     * Materials bought per order are never stocked, so their whole demand shows up here -
     * that is the point of flagging them on-demand in the first place.
     */
    public function toBuy(Request $request)
    {
        try {
            if (!$this->hasAnyPermission($request, ['masterData.view', 'stock.view', 'toBuy.view', 'badOrders.view', 'jobOrders.view', 'production.view'])) {
                return $this->unauthorizedResponse();
            }

            $done = ['delivered', 'Delivered', 'cancelled', 'Cancelled', 'returned', 'Returned'];

            // A COD order is unpaid by definition until the rider collects, so a filter on
            // paymentStatus hid every one of them and the shop never saw the materials it had
            // to buy to fulfil them - it would find out at production time, with nothing on the
            // shelf. What commits the shop here is the order existing, not the money arriving.
            $orders = \App\Models\Order::whereNotIn('orderStatus', $done)
                ->where(function ($q) {
                    $q->whereIn('paymentStatus', ['paid', 'partial'])
                      ->orWhereIn('paymentMethod', \App\Support\PaymentMethod::codAliases());
                })
                ->get();

            $demand   = [];   // inventoryId => qty needed
            $sources  = [];   // inventoryId => [order refs]
            $uses     = [];   // inventoryId => productName => pieces ordered (what the material is FOR)
            $bomCache = [];
            // A finished good bought in and resold has no BOM, so the loop below resolved no
            // materials for it and it contributed nothing - the one list that says what to buy
            // was silent about the things bought as themselves. Counted separately, by product.
            $goods    = [];   // productId => ['qty' => n, 'variant' => label, 'orders' => []]

            $productCache = [];
            foreach ($orders as $order) {
                foreach ($order->items ?? [] as $item) {
                    $productId = (string) ($item['productId'] ?? '');
                    if (!array_key_exists($productId, $productCache)) {
                        $productCache[$productId] = $productId ? \App\Models\Product::find($productId) : null;
                    }
                    $lineProduct = $productCache[$productId];

                    // A ready-made line took its materials off the shelf the moment the order was
                    // placed - deductInventoryFIFO cut stockQty there and then. Counting the same
                    // quantity again here, against the stock it already reduced, asked the shop to
                    // buy what it had just used: 21 needed against 18 on hand, when the 21 were
                    // the reason it was 18. Only a produced line still has its materials sitting
                    // on the shelf waiting to be consumed at QC.
                    if ($lineProduct && !\App\Support\OrderLine::isProduced($lineProduct, (array) $item)) {
                        continue;
                    }

                    // A quote records the materials it will actually consume - including for
                    // services whose product has no BOM at all - so trust that when present.
                    $materials = $item['materials'] ?? null;

                    if (!$materials) {
                        $variantId = $item['variantId'] ?? null;
                        $key       = $productId . '|' . ($variantId ?? '');
                        if (!array_key_exists($key, $bomCache)) {
                            $bom = $lineProduct ? $lineProduct->resolveBom($variantId) : null;
                            $bomCache[$key] = $bom->components ?? [];
                        }
                        $qty = max(1, (int) ($item['qty'] ?? 1));
                        $materials = array_map(fn ($c) => [
                            'inventoryId' => $c['inventoryId'] ?? null,
                            'qty'         => (float) ($c['qty'] ?? 0) * $qty,
                        ], $bomCache[$key]);
                    }

                    if (!$materials) {
                        $pid = $productId;
                        if ($pid !== '') {
                            $ref = '#' . strtoupper(substr((string) $order->_id, -8));
                            $key = $pid . '|' . ($item['variantId'] ?? '');
                            $goods[$key]['productId'] = $pid;
                            $goods[$key]['variant']   = $item['variantName'] ?? ($item['variantId'] ?? null);
                            $goods[$key]['qty']       = ($goods[$key]['qty'] ?? 0) + max(1, (int) ($item['qty'] ?? 1));
                            if (!in_array($ref, $goods[$key]['orders'] ?? [], true)) $goods[$key]['orders'][] = $ref;
                        }
                    }

                    $lineName = trim(($item['productName'] ?? $lineProduct?->name ?? 'Item') . (!empty($item['variantName']) ? " ({$item['variantName']})" : ''));
                    $linePcs  = max(1, (int) ($item['qty'] ?? 1));
                    foreach ($materials as $m) {
                        $invId = (string) ($m['inventoryId'] ?? '');
                        $need  = (float) ($m['qty'] ?? 0);
                        if ($invId === '' || $need <= 0) continue;
                        $demand[$invId] = ($demand[$invId] ?? 0) + $need;
                        $ref = '#' . strtoupper(substr((string) $order->_id, -8));
                        if (!in_array($ref, $sources[$invId] ?? [], true)) $sources[$invId][] = $ref;
                        // Order refs say WHO; this says WHAT - the products (and how many pieces)
                        // waiting on the material, so a shared box or pack reads as "10 Ceramic
                        // mugs + 10 Inner Color mugs" and not as two anonymous order numbers.
                        $uses[$invId][$lineName] = ($uses[$invId][$lineName] ?? 0) + $linePcs;
                    }
                }

                // Ready-made lines are skipped above because they took their material at checkout -
                // except the part the shelf could not cover. That part is owed, still to be bought,
                // and it is exactly what this list exists to show. See App\Support\Backorder.
                foreach ($order->backorders ?? [] as $owed) {
                    $invId = (string) ($owed['inventoryId'] ?? '');
                    $need  = (float) ($owed['qty'] ?? 0);
                    if ($invId === '' || $need <= 0) continue;
                    $demand[$invId] = ($demand[$invId] ?? 0) + $need;
                    $ref = '#' . strtoupper(substr((string) $order->_id, -8));
                    if (!in_array($ref, $sources[$invId] ?? [], true)) $sources[$invId][] = $ref;
                }
            }

            // One replenishment list, two reasons, one formula - the way Odoo's Replenishment and
            // Zoho's Reorder work. A material is listed when the orders already taken need more
            // than the shelf holds (short for orders), or when the shelf after those orders would
            // sit below the owner's minimum (below minimum), or both. What to buy is the amount
            // that covers the orders AND puts the shelf back at its minimum:
            //
            //     buy = needed by orders + minimum - on hand
            //
            // "Buy 10" for 20 needed on 10 in hand covered the orders and left the shelf empty;
            // with a minimum of 30 the same row now says buy 40. A minimum of 0 keeps the old
            // behaviour, so a material the owner has not set a line for still only shows up when
            // an order actually needs it.
            // Every product whose recipe uses a material, with what that material lets it ship.
            // Built once here rather than per row, and only over published, active recipes.
            $blocking = [];   // inventoryId => [ ['product' => name, 'canShip' => n, 'canBuild' => n] ]
            try {
                $bomById = \App\Models\BillOfMaterial::where('isActive', true)->get()->keyBy(fn ($b) => (string) $b->_id);
                $invById = Inventory::where('isActive', '!=', false)->get()->keyBy(fn ($i) => (string) $i->_id);
                foreach (\App\Models\Product::all() as $prod) {
                    $combos = !empty($prod->combinations) ? $prod->combinations : [['name' => null, 'bomId' => $prod->bomId]];
                    // Pooled across variants: three mug variants drawing on one box are limited
                    // together, not each to themselves.
                    $build = null; $shipOf = [];
                    foreach ($combos as $combo) {
                        $bom = $bomById[(string) ($combo['bomId'] ?? '')] ?? null;
                        if (!$bom) continue;
                        $variantBuild = null;
                        foreach ($bom->components ?? [] as $cm) {
                            $m = $invById[(string) ($cm['inventoryId'] ?? '')] ?? null;
                            $per = (float) ($cm['qty'] ?? 0);
                            if (!$m || $per <= 0) continue;
                            $free = max(0, (int) ($m->stockQty ?? 0) - (int) ($m->reservedQty ?? 0));
                            $can  = (int) floor($free / $per);
                            if (!($m->isOnDemand ?? false)) {
                                $variantBuild = $variantBuild === null ? $can : min($variantBuild, $can);
                            }
                            $shipOf[(string) $m->_id] = isset($shipOf[(string) $m->_id]) ? min($shipOf[(string) $m->_id], $can) : $can;
                        }
                        if ($variantBuild !== null) $build = $build === null ? $variantBuild : min($build, $variantBuild);
                    }
                    if ($build === null) continue;
                    foreach ($shipOf as $invId => $can) {
                        if ($can >= $build) continue;   // this material is not what holds the product back
                        $blocking[$invId][] = ['product' => $prod->name, 'canShip' => $can, 'canBuild' => $build];
                    }
                }
            } catch (\Throwable $e) {
                Log::warning('toBuy: blocking-products scan failed', ['error' => $e->getMessage()]);
            }

            $rows = [];
            $usage = \App\Support\MaterialUsage::perDay();
            $candidates = Inventory::where('isActive', '!=', false)->get()->keyBy(fn ($i) => (string) $i->_id);
            $ids = array_unique(array_merge(array_keys($demand), $candidates->keys()->all()));
            foreach ($ids as $invId) {
                $inv = $candidates[$invId] ?? null;
                if (!$inv) continue;

                $need      = (float) ($demand[$invId] ?? 0);
                $onHand    = (int) ($inv->stockQty ?? 0);
                $minimum   = (float) ($inv->minStockLevel ?? 0);
                $reasons   = [];
                if ($need > $onHand)                       $reasons[] = 'orders';
                if ($minimum > 0 && ($onHand - $need) < $minimum) $reasons[] = 'minimum';
                if (!$reasons) continue;                   // enough on hand - nothing to buy
                $shortfall = $need + $minimum - $onHand;
                if ($shortfall <= 0) continue;

                $unitCost = (float) ($inv->lastUnitCost ?: $inv->averageCost ?: $inv->baseCost ?: 0);

                $cover = \App\Support\MaterialUsage::coverFor(
                    max(0, $onHand - (int) ($inv->reservedQty ?? 0)),
                    $usage[$invId] ?? null,
                    (int) ($inv->leadTimeDays ?? 0) ?: null,
                );

                $rows[] = $cover + [
                    'reasons'       => $reasons,
                    'minimum'       => $minimum,
                    'inventoryId'   => (string) $inv->_id,
                    'name'          => $inv->name,
                    'sku'           => $inv->sku,
                    'uom'           => $inv->uom,
                    'category'      => $inv->category,
                    'supplierId'    => $inv->supplierId ?? null,
                    'supplierName'  => $inv->supplierName ?: 'No supplier set',
                    'leadTimeDays'  => (int) ($inv->leadTimeDays ?? 0),
                    'isOnDemand'    => (bool) ($inv->isOnDemand ?? false),
                    'needed'        => round($need, 4),
                    'onHand'        => $onHand,
                    'shortfall'     => round($shortfall, 4),
                    'unitCost'      => $unitCost,
                    'estimatedCost' => round($shortfall * $unitCost, 2),
                    'orders'        => array_slice($sources[$invId] ?? [], 0, 6),
                    'for'           => array_slice(array_map(fn ($n, $q) => ['product' => $n, 'pieces' => $q], array_keys($uses[$invId] ?? []), array_values($uses[$invId] ?? [])), 0, 6),
                    // Products this material holds back right now, orders or no orders.
                    'blocks'        => array_slice($blocking[$invId] ?? [], 0, 6),
                ];
            }

            // Soonest to run out first. The old order was biggest-money-first, which buried a
            // P200 material with three days left under a P9,000 one with two months of cover -
            // and it is the three-day one that stops production. A row with no usage history has
            // no cover figure; those sit at the end, ordered by money as before.
            usort($rows, function ($a, $b) {
                $ac = $a['daysOfCover'] ?? PHP_INT_MAX;
                $bc = $b['daysOfCover'] ?? PHP_INT_MAX;
                return $ac <=> $bc ?: $b['estimatedCost'] <=> $a['estimatedCost'];
            });

            // Finished goods with no BOM: what was ordered against what is on the shelf.
            $productRows = [];
            foreach ($goods as $g) {
                $product = \App\Models\Product::find($g['productId']);
                if (!$product) continue;

                $inv     = $product->inventoryId ? Inventory::find($product->inventoryId) : null;
                $onHand  = (int) ($inv->stockQty ?? 0);
                $need    = (int) $g['qty'];
                $short   = $need - $onHand;
                if ($short <= 0) continue;

                $unitCost = (float) ($inv->lastUnitCost ?? 0 ?: $inv->averageCost ?? 0 ?: $inv->baseCost ?? 0 ?: 0);

                $productRows[] = [
                    'productId'     => (string) $product->_id,
                    'name'          => $product->name,
                    'variant'       => $g['variant'] ?: null,
                    'sku'           => $product->sku ?? ($inv->sku ?? null),
                    'supplierName'  => $inv->supplierName ?? 'No supplier set',
                    'needed'        => $need,
                    'onHand'        => $onHand,
                    'shortfall'     => $short,
                    'unitCost'      => $unitCost,
                    'estimatedCost' => round($short * $unitCost, 2),
                    'orders'        => array_slice($g['orders'] ?? [], 0, 6),
                    'hasInventory'  => (bool) $inv,
                ];
            }
            usort($productRows, fn ($a, $b) => $b['estimatedCost'] <=> $a['estimatedCost']);

            // Quotes a customer tried to pay while the shelf could not cover them. Not committed
            // work - nothing was paid - so they are kept out of the totals above. But a customer who
            // tried to pay is the warmest sale there is, so they are listed with what is short now.
            $waitingQuotes = [];
            $blocked = \App\Models\OrderRequest::whereNotNull('stockBlock')
                ->where(function ($q) { $q->whereNull('convertedOrderId')->orWhere('convertedOrderId', ''); })
                ->get();
            foreach ($blocked as $quote) {
                if (empty($quote->stockBlock)) continue;
                if (($quote->paymentStatus ?? 'unpaid') !== 'unpaid') continue;
                if ($quote->expiresAt && now()->greaterThan($quote->expiresAt)) continue;

                $shortNow = \App\Support\QuoteStock::shortages($quote);
                $waitingQuotes[] = [
                    'id'            => (string) $quote->_id,
                    'ref'           => strtoupper(substr((string) $quote->_id, -8)),
                    'customerId'    => (string) ($quote->customerId ?? ''),
                    'customerName'  => $quote->customerName ?? '',
                    'total'         => (float) ($quote->finalPrice ?? 0),
                    'blockedAt'     => $quote->stockBlock['at'] ?? null,
                    'expiresAt'     => $quote->expiresAt ? $quote->expiresAt->toISOString() : null,
                    'allowPreorder' => (bool) ($quote->allowPreorder ?? false),
                    'stillShort'    => count($shortNow) > 0,
                    'shortages'     => $shortNow ?: ($quote->stockBlock['shortages'] ?? []),
                ];
            }

            return $this->successResponse('Purchase requirements fetched successfully.', [
                'waitingQuotes' => $waitingQuotes,
                'items'         => $rows,
                'totalItems'    => count($rows),
                'estimatedCost' => round(array_sum(array_column($rows, 'estimatedCost')), 2),
                'products'      => $productRows,
                'totalProducts' => count($productRows),
                'productsCost'  => round(array_sum(array_column($productRows, 'estimatedCost')), 2),
            ]);
        } catch (\Throwable $e) {
            Log::error('toBuy failed', ['error' => $e->getMessage()]);
            return $this->errorResponse('Failed to compute purchase requirements.', 500);
        }
    }

    public function index(Request $request)
    {
        try {
            if (!$this->hasAnyPermission($request, ['masterData.view', 'stock.view', 'toBuy.view', 'badOrders.view', 'jobOrders.view', 'production.view', 'products.view'])) {
                return $this->unauthorizedResponse();
            }
            $ver = (int) Cache::get('inventory_list_ver', 0);
            $filterSig = md5(json_encode([
                'category' => $request->query('category'),
                'search' => $request->query('search'),
                'status' => $request->query('status'),
            ]));
            $cacheKey = 'inventory_list_'.auth()->id().'_'.$ver.'_'.$filterSig;

            $inventory = Cache::remember($cacheKey, 60, function () use ($request) {
                // One ledger pass for the whole list, so every row's "days of cover" is the same
                // number the To Buy screen shows rather than a second opinion computed elsewhere.
                $usage = \App\Support\MaterialUsage::perDay();
                $query = Inventory::where('isActive', true);

                if ($request->filled('category')) {
                    $query->where('category', $request->category);
                }

                if ($request->filled('search')) {
                    $search = $request->search;
                    $query->where(function($q) use ($search) {
                        $q->where('name', 'like', "%{$search}%")
                          ->orWhere('category', 'like', "%{$search}%");
                    });
                }

                if ($request->filled('status')) {
                    if ($request->status === 'low-stock') {
                        $query->whereColumn('stockQty', '<=', 'minStockLevel');
                    } elseif ($request->status === 'out-of-stock') {
                        $query->where('stockQty', 0);
                    } elseif ($request->status === 'upon-order') {
                        $query->where('isOnDemand', true);
                    }
                }

                return $query->orderBy('category', 'asc')
                               ->orderBy('name', 'asc')
                               ->get([
                                   '_id', 'name', 'sku', 'uom', 'category',
                                   'stockQty', 'minStockLevel', 'leadTimeDays', 'baseCost',
                                   'averageCost', 'lastUnitCost', 'procurementType',
                                   'hasVariants', 'parentId', 'isActive', 'batches',
                                   'isOnDemand', 'supplierId', 'supplierName',
                                   'reservedQty', 'consumedQty', 'badOrderQty',
                                   'variantTypes', 'variantCombo', 'allowBackorder',
                                   'createdAt', 'updatedAt',
                               ])
                               ->map(function ($item) use ($usage) {
                                   $raw = $item->toArray();
                                   $raw['batches'] = array_values(
                                       array_map(
                                           fn($b) => is_array($b) ? $b : (array) $b,
                                           is_iterable($item->batches ?? null) ? (array) $item->batches : []
                                       )
                                   );
                                   // Cover is measured on FREE stock: material already promised to
                                   // an open order is not available to the next one, and counting
                                   // it says the shelf lasts longer than it does.
                                   $free = max(0, (int) ($item->stockQty ?? 0) - (int) ($item->reservedQty ?? 0));
                                   $raw += \App\Support\MaterialUsage::coverFor(
                                       $free,
                                       $usage[(string) $item->_id] ?? null,
                                       (int) ($item->leadTimeDays ?? 0) ?: null,
                                   );
                                   return $raw;
                               });
            });

            return $this->successResponse('Inventory fetched successfully.', $inventory);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'An unexpected error occurred while fetching inventory.');
        }
    }

    public function show($id)
    {
        try {
            if (!$this->hasAnyPermission($request, ['masterData.view', 'stock.view', 'toBuy.view', 'badOrders.view', 'jobOrders.view', 'production.view', 'products.view'])) {
                return $this->unauthorizedResponse();
            }
            $inventory = Inventory::find($id);

            if (!$inventory) {
                return $this->notFoundResponse('Inventory item');
            }

            return $this->successResponse('Inventory item fetched successfully.', $inventory);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'An unexpected error occurred while fetching the inventory item.');
        }
    }

    public function history($id)
    {
        try {
            if (!$this->hasAnyPermission($request, ['masterData.view', 'stock.view'])) {
                return $this->unauthorizedResponse();
            }
            $inventory = Inventory::find($id);

            if (!$inventory) {
                return $this->notFoundResponse('Inventory item');
            }

            $history = StockHistory::where('inventoryId', $id)
                                   ->orderBy('createdAt', 'desc')
                                   ->get();

            return $this->successResponse('Stock history fetched successfully.', $history);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'An unexpected error occurred while fetching the stock history.');
        }
    }

    /**
     * GET /api/admin/inventory/recent-movements
     * Returns last 10 stock movements across all inventory items for dashboard.
     */
    public function recentMovements(Request $request)
    {
        try {
            if (!$this->hasAnyPermission($request, ['masterData.view', 'stock.view'])) {
                return $this->unauthorizedResponse();
            }
            $movements = StockHistory::orderBy('createdAt', 'desc')
                ->limit(10)
                ->get(['inventoryId', 'quantity', 'reason', 'remarks', 'createdAt', 'performedBy', 'type']);

            // Batch-load inventory names to avoid N+1
            $inventoryIds = $movements->pluck('inventoryId')->unique()->filter()->values()->toArray();
            $inventoryMap = Inventory::whereIn('_id', $inventoryIds)
                ->get(['_id', 'name'])
                ->keyBy(fn($i) => (string) $i->_id);

            $userIds = $movements->pluck('performedBy')->unique()->filter()->values()->toArray();
            $userMap = User::whereIn('_id', $userIds)
                ->get(['_id', 'name'])
                ->keyBy(fn($u) => (string) $u->_id);

            $typeMap = [
                'restock'          => 'in',
                'return'           => 'in',
                'initial'          => 'in',
                'correction-add'   => 'in',
                'sale'             => 'out',
                'damaged'          => 'out',
                'correction-deduct'=> 'out',
                'sales-outside'    => 'out',
                'production'       => 'out',
                'lost'             => 'out',
                'missing'          => 'out',
                'adjustment'       => 'in',
                'writeoff'         => 'out',
            ];

            $labelMap = [
                'restock'          => 'Restocked',
                'return'           => 'Return received',
                'initial'          => 'Initial stock',
                'correction-add'   => 'Correction (add)',
                'sale'             => 'Sale deducted',
                'damaged'          => 'Damaged',
                'correction-deduct'=> 'Correction (deduct)',
                'sales-outside'    => 'Outside sale',
                'production'       => 'Production use',
                'lost'             => 'Lost',
                'missing'          => 'Missing',
                'adjustment'       => 'Adjustment',
                'writeoff'         => 'Write-off',
            ];

            $result = $movements->map(function ($m) use ($inventoryMap, $typeMap, $labelMap, $userMap) {
                $inv  = isset($inventoryMap[(string) $m->inventoryId])
                    ? $inventoryMap[(string) $m->inventoryId]
                    : null;
                $dir = null;
                if (($m->type ?? '') === 'deduction') {
                    $dir = 'out';
                } elseif (($m->type ?? '') === 'addition') {
                    $dir = 'in';
                }
                $type = $dir ?? ($typeMap[$m->reason] ?? 'in');
                $performerId = (string) ($m->performedBy ?? '');
                $performedBy = ($performerId !== '' && isset($userMap[$performerId]))
                    ? $userMap[$performerId]->name
                    : '-';
                return [
                    'item'        => $inv ? $inv->name : 'Unknown Item',
                    'qty'         => (int) $m->quantity,
                    'type'        => $type,
                    'label'       => $labelMap[$m->reason] ?? ucfirst($m->reason ?? ''),
                    'performedBy' => $performedBy,
                    'time'        => $m->createdAt ? $m->createdAt->format('M d, g:i A') : '',
                ];
            })->values()->toArray();

            return $this->successResponse('Recent movements fetched successfully.', [
                'movements' => $result,
            ]);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'An unexpected error occurred while fetching recent movements.');
        }
    }

    /**
     * Server-side SKU when the client does not send one (master data / POS flows).
     */
    private function generateNextInventorySku(): string
    {
        $prefix = 'INV-';
        $n      = Inventory::count() + 1;
        do {
            $candidate = $prefix . str_pad((string) $n, 4, '0', STR_PAD_LEFT);
            if (! Inventory::where('sku', $candidate)->exists()) {
                return $candidate;
            }
            $n++;
        } while ($n < 999_999);

        return $prefix . strtoupper(substr(str_replace('-', '', (string) \Illuminate\Support\Str::uuid()), 0, 8));
    }

    /**
     * When a client-provided SKU is already taken (e.g. by a soft-deleted item),
     * increment the trailing numeric sequence until a free slot is found.
     */
    private function resolveSkuConflict(string $taken): string
    {
        if (preg_match('/^(.+-)(\d+)$/', $taken, $m)) {
            $prefix = $m[1];
            $len    = strlen($m[2]);
            $n      = (int) $m[2] + 1;
            while ($n < 999_999) {
                $candidate = $prefix . str_pad((string) $n, $len, '0', STR_PAD_LEFT);
                if (! Inventory::where('sku', $candidate)->exists()) {
                    return $candidate;
                }
                $n++;
            }
        }
        return $this->generateNextInventorySku();
    }

    public function store(Request $request)
    {
        try {
            if (!$this->hasPermission($request, 'masterData.work')) {
                return $this->unauthorizedResponse();
            }

            $validated = $request->validate([
                'name'             => 'required|string|max:255',
                'category'         => 'required|string|max:100',
                'stockQty'         => 'required|integer|min:0',
                'minStockLevel'    => 'required|integer|min:0',
                'leadTimeDays'     => 'nullable|integer|min:0|max:365',
                'isOnDemand'       => 'boolean',
                'supplierId'       => 'nullable|string|max:128',
                'supplierName'     => 'nullable|string|max:160',
                'unitCost'         => 'required|numeric|min:0',
                'sku'              => 'nullable|string|max:100',
                'uom'              => 'nullable|string|max:50',
                'batches'          => 'nullable|array',
                'baseCost'         => 'nullable|numeric|min:0',
                'parentId'         => 'nullable|string|max:128',
                'hasVariants'      => 'nullable|boolean',
                'variantTypes'     => 'nullable|array',
                'variantCombo'     => 'nullable|array',
                'procurementType'  => 'nullable|string|max:50',
                'allowBackorder'   => 'nullable|boolean',
            ]);

            $duplicate = Inventory::where('name', $validated['name'])
                                  ->where('category', $validated['category'])
                                  ->where('isActive', true)
                                  ->first();

            if ($duplicate) {
                return $this->errorResponse('Duplicate item: An item with this name and category already exists.', 422);
            }

            $clientSku = (isset($validated['sku']) && $validated['sku'] !== '') ? $validated['sku'] : null;
            if ($clientSku) {
                $sku = Inventory::where('sku', $clientSku)->exists()
                    ? $this->resolveSkuConflict($clientSku)
                    : $clientSku;
            } else {
                $sku = $this->generateNextInventorySku();
            }

            $unitCost = (float) $validated['unitCost'];
            $baseCost = isset($validated['baseCost']) ? (float) $validated['baseCost'] : $unitCost;

            $inventory = Inventory::create([
                'name'             => $validated['name'],
                'sku'              => $sku,
                'uom'              => $validated['uom'] ?? 'pcs',
                'category'         => $validated['category'],
                'stockQty'         => $validated['stockQty'],
                'minStockLevel'    => $validated['minStockLevel'],
                'leadTimeDays'     => isset($validated['leadTimeDays']) ? (int) $validated['leadTimeDays'] : 7,
                'isOnDemand'       => $validated['isOnDemand'] ?? false,
                'isActive'         => true,
                'supplierId'       => $validated['supplierId'] ?? null,
                'supplierName'     => $validated['supplierName'] ?? 'Unspecified',
                'lastUnitCost'     => $unitCost,
                'averageCost'      => $unitCost,
                'baseCost'         => $baseCost,
                'batches'          => $validated['batches'] ?? [],
                'parentId'         => $validated['parentId'] ?? null,
                'hasVariants'      => $validated['hasVariants'] ?? false,
                'variantTypes'     => $validated['variantTypes'] ?? [],
                'variantCombo'     => $validated['variantCombo'] ?? null,
                'procurementType'  => $validated['procurementType'] ?? null,
                'allowBackorder'   => $validated['allowBackorder'] ?? false,
                'createdAt'        => now(),
                'updatedAt'        => now(),
            ]);

            StockHistory::create([
                'inventoryId'  => $inventory->_id,
                'supplierId'   => $validated['supplierId'] ?? null,
                'quantity'     => $validated['stockQty'],
                'remainingQty' => $validated['stockQty'],
                'unitCost'     => $unitCost,
                'totalCost'    => $validated['stockQty'] * $unitCost,
                'reason'       => 'initial',
                'createdAt'    => now(),
            ]);

            $this->bustInventoryListCache();

            return $this->successResponse('Inventory item created successfully.', $inventory, 201);
        } catch (\Illuminate\Validation\ValidationException $e) {
            return $this->validationErrorResponse($e);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'An unexpected error occurred while creating the inventory item.');
        }
    }

    public function update(Request $request, $id)
    {
        try {
            if (!$this->hasPermission($request, 'masterData.work')) {
                return $this->unauthorizedResponse();
            }

            $inventory = Inventory::find($id);

            if (!$inventory) {
                return $this->notFoundResponse('Inventory item');
            }

            $validated = $request->validate([
                'name'             => 'sometimes|required|string|max:255',
                'category'         => 'sometimes|required|string|max:100',
                'stockQty'         => 'sometimes|required|integer|min:0',
                'minStockLevel'    => 'sometimes|required|integer|min:0',
                'leadTimeDays'     => 'sometimes|nullable|integer|min:0|max:365',
                'isOnDemand'       => 'sometimes|boolean',
                'isActive'         => 'sometimes|boolean',
                'supplierId'       => 'nullable|string|max:128',
                'supplierName'     => 'nullable|string|max:160',
                'sku'              => 'nullable|string|max:100',
                'uom'              => 'nullable|string|max:50',
                'batches'          => 'nullable|array',
                'baseCost'         => 'nullable|numeric|min:0',
                'lastUnitCost'     => 'nullable|numeric|min:0',
                'averageCost'      => 'nullable|numeric|min:0',
                'parentId'         => 'nullable|string|max:128',
                'hasVariants'      => 'nullable|boolean',
                'variantTypes'     => 'nullable|array',
                'variantCombo'     => 'nullable|array',
                'procurementType'  => 'nullable|string|max:50',
                'allowBackorder'   => 'nullable|boolean',
            ]);

            if (isset($validated['name']) || isset($validated['category'])) {
                $duplicate = Inventory::where('name', $validated['name'] ?? $inventory->name)
                                      ->where('category', $validated['category'] ?? $inventory->category)
                                      ->where('_id', '!=', $id)
                                      ->where('isActive', true)
                                      ->first();

                if ($duplicate) {
                    return $this->errorResponse('Duplicate item.', 422);
                }
            }

            if (isset($validated['sku']) && $validated['sku'] !== '') {
                $dupSku = Inventory::where('sku', $validated['sku'])
                    ->where('_id', '!=', $id)
                    ->first();
                if ($dupSku) {
                    return $this->errorResponse('Duplicate SKU: An item with this SKU already exists.', 422);
                }
            }

            $inventory->update($validated);
            $inventory->updatedAt = now();
            $inventory->save();

            $this->bustInventoryListCache();

            return $this->successResponse('Inventory item updated successfully.', $inventory);
        } catch (\Illuminate\Validation\ValidationException $e) {
            return $this->validationErrorResponse($e);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'An unexpected error occurred while updating the inventory item.');
        }
    }

    /**
     * POST /api/inventory/{id}/adjust-stock
     * Adjusts stock level (add or deduct)
     */
    public function adjustStock(Request $request, $id)
    {
        try {
            if (!$this->hasPermission($request, 'stock.work')) {
                return $this->unauthorizedResponse();
            }

            $inventory = Inventory::find($id);

            if (!$inventory) {
                return $this->notFoundResponse('Inventory item');
            }

            $validated = $request->validate([
                'quantity'         => 'required|numeric',
                'reason'           => 'required|in:restock,correction-add,correction-deduct,sale,return,sales-outside,damaged,writeoff,production,lost,missing,adjustment',
                'adjustmentType'   => 'nullable|in:add,subtract',
                'supplierId'       => 'nullable|string|max:128',
                'supplierName'     => 'nullable|string|max:160',
                'unitCost'         => 'nullable|numeric|min:0',
                'batchId'          => 'nullable|string|max:128',
                'invoiceNumber'    => 'nullable|string|max:100',
                'deliveryDate'     => 'nullable|string|max:255',
                'sellingPrice'     => 'nullable|numeric|min:0',
                'saleDate'         => 'nullable|string|max:255',
                'customerName'     => 'nullable|string|max:100',
                'remarks'          => 'nullable|string|max:500',
                'performedBy'      => 'nullable|string|max:100',
            ]);

            // Determine actual direction from adjustmentType if provided
            // Frontend sends positive quantity + adjustmentType signal
            $adjustmentType = $validated['adjustmentType'] ?? null;
            $quantity = $validated['quantity'];
            if ($adjustmentType === 'subtract') {
                $quantity = -abs($quantity);
            } elseif ($adjustmentType === 'add') {
                $quantity = abs($quantity);
            }
            // If no adjustmentType, use raw sign of quantity (legacy support)

            // Adjust stock without transaction wrapper for MongoDB compatibility
            $batches = $inventory->batches ?? [];
            $absQty  = abs($quantity);

            if ($quantity < 0) {
                $specificBatchId = $validated['batchId'] ?? null;
                $batchDeductions = [];

                if ($specificBatchId) {
                    // ── SPECIFIC BATCH deduction ───────────────────────────────────
                    $found = false;
                    foreach ($batches as &$batch) {
                        if (($batch['batchId'] ?? null) === $specificBatchId) {
                            $batchQty = (int) ($batch['remainingQty'] ?? $batch['goodQty'] ?? 0);
                            if ($batchQty < $absQty) {
                                throw new \Exception("Insufficient stock in selected batch (available: {$batchQty}).");
                            }
                            $batch['remainingQty'] = $batchQty - $absQty;
                            $batchDeductions[] = ['batchId' => $batch['batchId'] ?? null, 'qty' => $absQty, 'unitCost' => $batch['unitCost'] ?? 0];
                            $found = true;
                            break;
                        }
                    }
                    unset($batch);
                    if (!$found) {
                        throw new \Exception('Selected batch not found.');
                    }
                } else {
                    // ── FIFO deduction from batches ────────────────────────────────
                    // Sort batches by dateReceived ascending (true FIFO)
                    usort($batches, function ($a, $b) {
                        return strtotime($a['dateReceived'] ?? '0') <=> strtotime($b['dateReceived'] ?? '0');
                    });

                    $available = array_reduce($batches, function ($carry, $b) {
                        return $carry + ($b['remainingQty'] ?? $b['goodQty'] ?? 0);
                    }, 0);

                    if ($available < $absQty) {
                        throw new \Exception('Insufficient stock.');
                    }

                    $remaining = $absQty;
                    foreach ($batches as &$batch) {
                        if ($remaining <= 0) break;
                        $batchQty = $batch['remainingQty'] ?? $batch['goodQty'] ?? 0;
                        if ($batchQty <= 0) continue;
                        $deduct = min($batchQty, $remaining);
                        $batch['remainingQty'] = $batchQty - $deduct;
                        $remaining -= $deduct;
                        $batchDeductions[] = ['batchId' => $batch['batchId'] ?? null, 'qty' => $deduct, 'unitCost' => $batch['unitCost'] ?? 0];
                    }
                    unset($batch);
                }

                $newStock = max(0, ($inventory->stockQty ?? 0) - $absQty);

            } else {
                // ── ADD: append new batch entry ────────────────────────────
                $unitCost = $validated['unitCost'] ?? $inventory->averageCost ?? 0;
                $batches[] = [
                    'batchId'       => $validated['batchId'] ?? (string) \Illuminate\Support\Str::uuid(),
                    'invoiceNumber' => $validated['invoiceNumber'] ?? null,
                    'supplierId'    => $validated['supplierId'] ?? null,
                    'vendorName'    => $validated['supplierName'] ?? null,
                    'goodQty'       => $absQty,
                    'remainingQty'  => $absQty,
                    'qtyDamaged'    => 0,
                    'unitCost'      => $unitCost,
                    'dateReceived'  => $validated['deliveryDate'] ?? now()->toISOString(),
                    'damageType'    => null,
                    'createdAt'     => now()->toISOString(),
                ];

                $newStock = ($inventory->stockQty ?? 0) + $absQty;

                // Recalculate weighted average cost
                $currentTotalCost = ($inventory->averageCost ?? 0) * ($newStock - $absQty);
                $newAdditionCost  = $unitCost * $absQty;
                $inventory->averageCost  = $newStock > 0 ? ($currentTotalCost + $newAdditionCost) / $newStock : $unitCost;
                $inventory->lastUnitCost = $unitCost;
                $inventory->baseCost     = $unitCost;
            }

            $inventory->batches  = $batches;
            $inventory->stockQty = $newStock;
            $inventory->updatedAt = now();
            $inventory->save();

            $historyType = $quantity < 0 ? 'deduction' : 'addition';

            // Resolve performedBy: prefer request value, fall back to auth user
            $performedBy = $validated['performedBy'] ?? null;
            if (!$performedBy) {
                $u = $request->user();
                if ($u) {
                    $performedBy = $u->name ?? trim(($u->firstName ?? '') . ' ' . ($u->lastName ?? ''));
                    if ($performedBy === '') $performedBy = $u->email ?? null;
                }
            }

            if ($quantity < 0 && !empty($batchDeductions)) {
                // Per-batch history records for full FIFO traceability
                // runningRemaining starts at pre-deduction stock and decrements per batch
                $runningRemaining = $newStock + $absQty; // restore to pre-deduction total
                foreach ($batchDeductions as $bd) {
                    $runningRemaining -= $bd['qty']; // decrement before recording
                    StockHistory::create([
                        'inventoryId'   => $inventory->_id,
                        'supplierId'    => $validated['supplierId'] ?? null,
                        'supplierName'  => $validated['supplierName'] ?? null,
                        'quantity'      => $bd['qty'],
                        'remainingQty'  => $runningRemaining,
                        'unitCost'      => $bd['unitCost'],
                        'totalCost'     => $bd['qty'] * $bd['unitCost'],
                        'reason'        => $validated['reason'],
                        'type'          => 'deduction',
                        'batchId'       => $bd['batchId'],
                        'invoiceNumber' => $validated['invoiceNumber'] ?? null,
                        'deliveryDate'  => $validated['deliveryDate'] ?? null,
                        'sellingPrice'  => $validated['sellingPrice'] ?? null,
                        'saleDate'      => $validated['saleDate'] ?? null,
                        'customerName'  => $validated['customerName'] ?? null,
                        'remarks'       => isset($validated['remarks'])
                            ? htmlspecialchars(strip_tags(trim($validated['remarks'])), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8')
                            : null,
                        'performedBy'   => $performedBy,
                        'createdAt'     => now(),
                    ]);
                }
            } else {
                // Single history record for additions
                StockHistory::create([
                    'inventoryId'   => $inventory->_id,
                    'supplierId'    => $validated['supplierId'] ?? null,
                    'supplierName'  => $validated['supplierName'] ?? null,
                    'quantity'      => $absQty,
                    'remainingQty'  => $newStock,
                    'unitCost'      => $validated['unitCost'] ?? $inventory->averageCost,
                    'totalCost'     => $absQty * ($validated['unitCost'] ?? $inventory->averageCost ?? 0),
                    'reason'        => $validated['reason'],
                    'type'          => 'addition',
                    'batchId'       => $validated['batchId'] ?? null,
                    'invoiceNumber' => $validated['invoiceNumber'] ?? null,
                    'deliveryDate'  => $validated['deliveryDate'] ?? null,
                    'sellingPrice'  => $validated['sellingPrice'] ?? null,
                    'saleDate'      => $validated['saleDate'] ?? null,
                    'customerName'  => $validated['customerName'] ?? null,
                    'remarks'       => isset($validated['remarks'])
                        ? htmlspecialchars(strip_tags(trim($validated['remarks'])), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8')
                        : null,
                    'performedBy'   => $performedBy,
                    'createdAt'     => now(),
                ]);
            }

            try {
                AuditLog::create([
                    'inventoryId'  => (string) $inventory->_id,
                    'productName'  => $inventory->name ?? 'Unknown',
                    'category'     => $inventory->category ?? 'Uncategorized',
                    'reason'       => $validated['reason'],
                    'quantity'     => (int) $quantity,
                    'stockBefore'  => (int) ($newStock - $quantity),
                    'stockAfter'   => (int) $newStock,
                    'unitCost'     => (float) ($validated['unitCost'] ?? $inventory->averageCost ?? 0),
                    'totalCost'    => (float) (abs($quantity) * ($validated['unitCost'] ?? $inventory->averageCost ?? 0)),
                    'supplierId'   => $validated['supplierId'] ?? null,
                    'sellingPrice' => isset($validated['sellingPrice']) ? (float) $validated['sellingPrice'] : null,
                    'customerName' => $validated['customerName'] ?? null,
                    'saleDate'     => $validated['saleDate'] ?? null,
                    'remarks'      => isset($validated['remarks'])
                        ? htmlspecialchars(strip_tags(trim($validated['remarks'])), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8')
                        : '',
                    'performedBy'  => $performedBy,
                    'createdAt'    => now(),
                ]);
            } catch (\Exception $auditEx) {
                Log::warning('AuditLog write failed', ['error' => $auditEx->getMessage()]);
            }

            $this->bustInventoryListCache();

            return $this->successResponse('Stock adjusted successfully.', $inventory);
        } catch (\Illuminate\Validation\ValidationException $e) {
            return $this->validationErrorResponse($e);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'An unexpected error occurred while adjusting stock.');
        }
    }

    /**
     * GET /api/admin/inventory/min-stock-suggestions
     *
     * What each material's minimum SHOULD be, from how fast it actually leaves the shelf.
     *
     * Every material is born with a minimum of 10 (the model default), and most were never
     * changed - so a mug that sells three a day and a sticker sheet that sells one a month both
     * warn at the same number. The standard answer is lead time x average daily usage, plus a
     * buffer: enough on the shelf to cover the wait for the next delivery, and a little more for
     * a busy week. Usage is read from the stock ledger (every 'deduction' row: production, sales,
     * quotes, scrap) over the last 90 days, or since the material's first movement if younger.
     *
     * This SUGGESTS. It writes nothing - the owner accepts each one, or all, from Master Data.
     * A wrong minimum applied silently would flood To Buy and teach people to ignore it.
     */
    public function minStockSuggestions(Request $request)
    {
        try {
            if (!$this->hasAnyPermission($request, ['masterData.view', 'stock.view'])) {
                return $this->unauthorizedResponse();
            }

            $since  = now()->subDays(90);
            $window = 90;

            // Usage and first-seen per material, one pass over the ledger.
            $used  = [];   // inventoryId => qty out in the window
            $first = [];   // inventoryId => earliest movement of any kind
            $rows  = StockHistory::where('createdAt', '>=', now()->subDays(400))
                ->get(['inventoryId', 'type', 'quantity', 'createdAt']);
            $maxOut = [];  // inventoryId => the largest single deduction ever seen
            foreach ($rows as $r) {
                $id = (string) $r->inventoryId;
                if ($id === '') continue;
                $at = $r->createdAt;
                if ($at && (!isset($first[$id]) || $at < $first[$id])) $first[$id] = $at;
                if ($r->type === 'deduction' && $at && $at >= $since) {
                    $q = abs((float) $r->quantity);
                    $used[$id]   = ($used[$id] ?? 0) + $q;
                    $maxOut[$id] = max($maxOut[$id] ?? 0, $q);
                }
            }

            $out = [];
            foreach (Inventory::where('isActive', '!=', false)->get() as $inv) {
                $id = (string) $inv->_id;
                if ($inv->isOnDemand) continue;   // bought per order; a minimum is not how it is managed

                $seen = $first[$id] ?? null;
                $days = $seen ? max(14, min($window, (int) ceil($seen->diffInDays(now())) ?: 1)) : $window;
                $qty  = (float) ($used[$id] ?? 0);
                $avg  = $qty > 0 ? $qty / $days : 0.0;

                $lead        = (int) ($inv->leadTimeDays ?? 0);
                $leadAssumed = $lead <= 0;
                if ($leadAssumed) $lead = 7;

                // A shop sells in BATCHES, not in a daily trickle. Rate x lead time is the
                // textbook reorder point and it is honest about the average, but 0.105 sheets a
                // day over seven days says "keep 2 on the shelf" about a material a single
                // customer orders fifty of. The first order after that wipes the shelf before
                // To Buy has said anything.
                //
                // So the suggestion is held against the largest single draw the ledger has
                // actually seen for this material: whatever a real order took once, it can take
                // again while the next delivery is still in transit.
                $biggestDraw = (float) ($maxOut[$id] ?? 0);

                $suggested = null;
                if ($avg > 0) {
                    $cover  = $avg * $lead;                     // what leaves while the next order is in transit
                    $buffer = max($avg * 2, $cover * 0.5);      // two days' worth, or half the lead-time demand
                    $suggested = (int) max(1, ceil(max($cover + $buffer, $biggestDraw)));
                }

                // NEVER LOWER. A minimum the owner typed is a decision made while looking at the
                // shelf, and three weeks of thin trading is not evidence against it. Lowering it
                // silences To Buy on exactly the material that was being watched - and "Accept
                // all" makes that one click. Suggestions may only ever raise.
                $current = (int) ($inv->minStockLevel ?? 0);
                if ($suggested !== null && $suggested <= $current) {
                    $suggested = null;
                }

                $out[] = [
                    'inventoryId'  => $id,
                    'name'         => $inv->name,
                    'sku'          => $inv->sku,
                    'uom'          => $inv->uom,
                    'stockQty'     => (int) ($inv->stockQty ?? 0),
                    'current'      => (int) ($inv->minStockLevel ?? 0),
                    'usedInWindow' => round($qty, 2),
                    'windowDays'   => $days,
                    'avgDaily'     => round($avg, 3),
                    'leadTimeDays' => $lead,
                    'leadAssumed'  => $leadAssumed,
                    'suggested'    => $suggested,
                ];
            }

            // Biggest gaps first: where the current minimum is furthest from what usage says.
            usort($out, function ($a, $b) {
                $ga = $a['suggested'] === null ? -1 : abs($a['suggested'] - $a['current']);
                $gb = $b['suggested'] === null ? -1 : abs($b['suggested'] - $b['current']);
                return $gb <=> $ga;
            });

            return $this->successResponse('Minimum stock suggestions computed.', [
                'windowDays' => $window,
                'rows'       => $out,
            ]);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'Could not compute suggestions.');
        }
    }

    public function stockOuts(Request $request)
    {
        try {
            if (!$this->hasAnyPermission($request, ['masterData.view', 'stock.view', 'toBuy.view', 'badOrders.view'])) {
                return $this->unauthorizedResponse();
            }
            $history = StockHistory::where('type', 'deduction')
                ->orderBy('createdAt', 'desc')
                ->get();

            $inventoryIds = $history->pluck('inventoryId')->unique()->filter()->values()->toArray();
            $inventoryMap = Inventory::whereIn('_id', $inventoryIds)
                ->get(['_id', 'name'])
                ->keyBy(fn($i) => (string) $i->_id);

            $result = $history->map(function ($h) use ($inventoryMap) {
                $inv = $inventoryMap[(string) ($h->inventoryId ?? '')] ?? null;
                return [
                    '_id'          => (string) $h->_id,
                    'inventoryId'  => (string) ($h->inventoryId ?? ''),
                    'materialName' => $inv ? $inv->name : '',
                    'quantity'     => (int) ($h->quantity ?? 0),
                    'remainingQty' => (int) ($h->remainingQty ?? 0),
                    'unitCost'     => (float) ($h->unitCost ?? 0),
                    'totalCost'    => (float) ($h->totalCost ?? 0),
                    'reason'       => $h->reason ?? '',
                    'type'         => $h->type ?? 'deduction',
                    'invoiceNumber'=> $h->invoiceNumber ?? null,
                    'remarks'      => $h->remarks ?? null,
                    'performedBy'  => $h->performedBy ?? null,
                    'orderId'      => $h->orderId ?? null,
                    'productId'    => $h->productId ?? null,
                    'productName'  => $h->productName ?? null,
                    'customerName' => $h->customerName ?? null,
                    'createdAt'    => $h->createdAt ? $h->createdAt->toIso8601String() : null,
                ];
            })->values()->toArray();

            return $this->successResponse('Stock outs fetched.', $result);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'An unexpected error occurred while fetching stock outs.');
        }
    }

    public function destroy(Request $request, $id)
    {
        try {
            if (!$this->hasPermission($request, 'masterData.archive')) {
                return $this->unauthorizedResponse();
            }

            $inventory = Inventory::find($id);

            if (!$inventory) {
                return $this->notFoundResponse('Inventory item');
            }

            $linkedProducts = \App\Models\Product::where('inventoryId', $id)->count();
            if ($linkedProducts > 0) {
                return $this->errorResponse('Cannot delete: Item is linked to ' . $linkedProducts . ' product(s).', 422);
            }

            // A recipe that still names this material is a harder block than a linked product,
            // because nothing downstream notices. The BOM keeps a pointer to a row that is no
            // longer active, every "can build" silently SKIPS that line, and the product starts
            // claiming it can make MORE than it can - a number that reaches the storefront.
            // So: fix the recipes first, then archive.
            $usedBy = \App\Models\BillOfMaterial::where('isActive', true)->get()
                ->filter(fn ($b) => collect($b->components ?? [])
                    ->contains(fn ($c) => (string) ($c['inventoryId'] ?? '') === (string) $id))
                ->pluck('productName')
                ->values();
            if ($usedBy->isNotEmpty()) {
                return $this->errorResponse(
                    'Cannot archive: ' . $usedBy->count() . ' recipe(s) still use this material - '
                    . $usedBy->take(4)->implode(', ') . ($usedBy->count() > 4 ? ', ...' : '')
                    . '. Remove it from those recipes first, or the products they build will report '
                    . 'a stock figure they cannot deliver.',
                    422,
                    ['usedBy' => $usedBy->all()]
                );
            }

            $inventory->isActive = false;
            $inventory->deletedAt = now();
            $inventory->save();

            $this->bustInventoryListCache();

            return $this->successResponse('Inventory item deactivated successfully.');
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'An unexpected error occurred while deleting the inventory item.');
        }
    }

    /**
     * GET /api/admin/inventory/archived
     *
     * Archiving has always been reversible in the database - the row and its batches are kept and
     * only a flag changes - but nothing in the UI could see an archived material, let alone put
     * one back. That is what made a reversible action feel permanent, and it is why the dialog
     * used to say "cannot be undone" about something that could.
     */
    public function archived(Request $request)
    {
        try {
            if (!$this->hasPermission($request, 'masterData.view')) {
                return $this->unauthorizedResponse();
            }

            $rows = Inventory::where('isActive', false)
                ->orderBy('deletedAt', 'desc')
                ->get(['_id', 'name', 'sku', 'uom', 'category', 'stockQty', 'minStockLevel',
                       'supplierName', 'baseCost', 'lastUnitCost', 'deletedAt'])
                ->map(function ($i) {
                    $raw = $i->toArray();
                    // Its stock is still recorded; it simply stopped counting. Say so, because
                    // that is the figure that comes back if it is restored.
                    $raw['heldStock'] = (int) ($i->stockQty ?? 0);
                    return $raw;
                });

            return $this->successResponse('Archived materials fetched.', $rows);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'An unexpected error occurred while fetching archived materials.');
        }
    }

    /**
     * POST /api/admin/inventory/{id}/restore
     *
     * Back on the shelf with the stock it was archived holding. Nothing is recomputed: the units
     * were never removed, they were only hidden.
     */
    public function restore(Request $request, $id)
    {
        try {
            if (!$this->hasPermission($request, 'masterData.archive')) {
                return $this->unauthorizedResponse();
            }

            $inventory = Inventory::find($id);
            if (!$inventory) {
                return $this->notFoundResponse('Inventory item');
            }
            if ($inventory->isActive !== false) {
                return $this->errorResponse('That material is not archived.', 422);
            }

            $inventory->isActive  = true;
            $inventory->deletedAt = null;
            $inventory->save();

            $this->bustInventoryListCache();

            return $this->successResponse(
                '"' . $inventory->name . '" is back in Master Data with ' . (int) ($inventory->stockQty ?? 0) . ' ' . ($inventory->uom ?? 'units') . ' on hand.',
                $inventory
            );
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'An unexpected error occurred while restoring the material.');
        }
    }
}
