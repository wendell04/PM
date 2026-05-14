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
        $uid = auth()->id();
        if ($uid === null) {
            return;
        }
        $k = 'inventory_list_ver_'.$uid;
        Cache::put($k, (int) Cache::get($k, 0) + 1, 86400);
    }

    /**
     * GET /api/inventory
     * Returns all active inventory items
     */
    public function index(Request $request)
    {
        try {
            $ver = (int) Cache::get('inventory_list_ver_'.auth()->id(), 0);
            $filterSig = md5(json_encode([
                'category' => $request->query('category'),
                'search' => $request->query('search'),
                'status' => $request->query('status'),
            ]));
            $cacheKey = 'inventory_list_'.auth()->id().'_'.$ver.'_'.$filterSig;

            $inventory = Cache::remember($cacheKey, 60, function () use ($request) {
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
                                   '_id',
                                   'name',
                                   'sku',
                                   'uom',
                                   'category',
                                   'stockQty',
                                   'minStockLevel',
                                   'baseCost',
                                   'averageCost',
                                   'lastUnitCost',
                                   'procurementType',
                                   'hasVariants',
                                   'parentId',
                                   'isActive',
                                   'batches',
                                   'isOnDemand',
                                   'supplierId',
                                   'supplierName',
                                   'reservedQty',
                                   'consumedQty',
                                   'badOrderQty',
                                   'variantTypes',
                                   'variantCombo',
                                   'allowBackorder',
                                   'createdAt',
                                   'updatedAt',
                               ]);
            });

            return $this->successResponse('Inventory fetched successfully.', $inventory);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'An unexpected error occurred while fetching inventory.');
        }
    }

    public function show($id)
    {
        try {
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
                    : '—';
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
            if (!$this->hasPermission($request, 'inventory')) {
                return $this->unauthorizedResponse();
            }

            $validated = $request->validate([
                'name'             => 'required|string|max:255',
                'category'         => 'required|string|max:100',
                'stockQty'         => 'required|integer|min:0',
                'minStockLevel'    => 'required|integer|min:0',
                'isOnDemand'       => 'boolean',
                'supplierId'       => 'nullable|string',
                'supplierName'     => 'nullable|string',
                'unitCost'         => 'required|numeric|min:0',
                'sku'              => 'nullable|string|max:100',
                'uom'              => 'nullable|string|max:50',
                'batches'          => 'nullable|array',
                'baseCost'         => 'nullable|numeric|min:0',
                'parentId'         => 'nullable|string',
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
            if (!$this->hasPermission($request, 'inventory')) {
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
                'isOnDemand'       => 'sometimes|boolean',
                'isActive'         => 'sometimes|boolean',
                'supplierId'       => 'nullable|string',
                'supplierName'     => 'nullable|string',
                'sku'              => 'nullable|string|max:100',
                'uom'              => 'nullable|string|max:50',
                'batches'          => 'nullable|array',
                'baseCost'         => 'nullable|numeric|min:0',
                'lastUnitCost'     => 'nullable|numeric|min:0',
                'averageCost'      => 'nullable|numeric|min:0',
                'parentId'         => 'nullable|string',
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
            if (!$this->hasPermission($request, 'inventory')) {
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
                'supplierId'       => 'nullable|string',
                'supplierName'     => 'nullable|string',
                'unitCost'         => 'nullable|numeric|min:0',
                'batchId'          => 'nullable|string',
                'invoiceNumber'    => 'nullable|string|max:100',
                'deliveryDate'     => 'nullable|string',
                'sellingPrice'     => 'nullable|numeric|min:0',
                'saleDate'         => 'nullable|string',
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
                // ── SUBTRACT: FIFO deduction from batches ──────────────────────────
                // Sort batches by dateReceived ascending (true FIFO)
                usort($batches, function ($a, $b) {
                    return strtotime($a['dateReceived'] ?? '0') <=> strtotime($b['dateReceived'] ?? '0');
                });

                // Compute available stock from batches
                $available = array_reduce($batches, function ($carry, $b) {
                    return $carry + ($b['remainingQty'] ?? $b['goodQty'] ?? 0);
                }, 0);

                if ($available < $absQty) {
                    throw new \Exception('Insufficient stock.');
                }

                $remaining       = $absQty;
                $batchDeductions = []; // per-batch log for history

                foreach ($batches as &$batch) {
                    if ($remaining <= 0) break;
                    $batchQty = $batch['remainingQty'] ?? $batch['goodQty'] ?? 0;
                    if ($batchQty <= 0) continue;
                    $deduct = min($batchQty, $remaining);
                    $batch['remainingQty'] = $batchQty - $deduct;
                    $remaining -= $deduct;

                    // Record which batch was consumed, how much, and at what cost
                    $batchDeductions[] = [
                        'batchId'   => $batch['batchId']  ?? null,
                        'qty'       => $deduct,
                        'unitCost'  => $batch['unitCost'] ?? 0,
                    ];
                }
                unset($batch);

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
                        'performedBy'   => $validated['performedBy'] ?? null,
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
                    'performedBy'   => $validated['performedBy'] ?? null,
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
                    'performedBy'  => $validated['performedBy'] ?? null,
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

    public function destroy(Request $request, $id)
    {
        try {
            if (!$this->hasPermission($request, 'inventory')) {
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

            $inventory->isActive = false;
            $inventory->deletedAt = now();
            $inventory->save();

            $this->bustInventoryListCache();

            return $this->successResponse('Inventory item deactivated successfully.');
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'An unexpected error occurred while deleting the inventory item.');
        }
    }
}
