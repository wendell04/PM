<?php

namespace App\Http\Controllers;

use App\Models\Inventory;
use App\Models\InventoryReturn;
use App\Models\StockHistory;
use App\Models\AuditLog;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;

class InventoryReturnController extends Controller
{

    /**
     * What one unit of this material actually costs.
     *
     * `averageCost` is NULL on this data - the real figure lives in lastUnitCost / baseCost / the
     * FIFO batch. Reading it alone logged every movement at P0.00, which makes cost of goods, profit
     * and margin fiction. Same fallback order the BOM screens use.
     */
    private function unitCostOf($inv): float
    {
        $c = (float) ($inv->lastUnitCost ?: $inv->averageCost ?: $inv->baseCost ?: 0);
        if ($c > 0) return $c;

        foreach (($inv->batches ?? []) as $b) {
            $bc = (float) ($b['unitCost'] ?? 0);
            if ($bc > 0) return $bc;
        }
        return 0.0;
    }

    /**
     * GET /api/admin/returns
     * Returns all bad-order (supplier receiving issue) records ordered by createdAt DESC.
     *
     * Record shape (frontend contract):
     * { materialId, materialName, vendorId, vendorName, batchId, damageType,
     *   quantity, unitCost, totalLoss, notes, status, createdAt }
     */
    public function index(Request $request)
    {
        try {
            if (!$this->hasPermission($request, 'badOrders')) {
                return $this->unauthorizedResponse();
            }

            $query = InventoryReturn::orderBy('createdAt', 'desc');

            if ($request->filled('status')) {
                $query->where('status', $request->status);
            }

            if ($request->filled('materialId')) {
                $query->where('materialId', $request->materialId);
            }

            $returns = $query->get();

            return response()->json(['data' => $returns]);
        } catch (\Exception $e) {
            return response()->json(['message' => 'An unexpected error occurred while fetching returns.'], 500);
        }
    }

    /**
     * GET /api/admin/returns/stats
     * Returns bad orders stats for dashboard.
     */
    public function stats(Request $request)
    {
        try {
            if (!$this->hasPermission($request, 'badOrders')) {
                return $this->unauthorizedResponse();
            }

            $data = Cache::remember('admin_return_stats', 30, function () {
                return [
                    'pendingCount'    => InventoryReturn::where('status', 'pending')->count(),
                    'replacedCount'   => InventoryReturn::where('status', 'replaced')->count(),
                    'writtenOffCount' => InventoryReturn::whereIn('status', ['written_off', 'refunded'])->count(),
                    'totalLoss'       => (float) InventoryReturn::sum('totalLoss'),
                ];
            });

            return response()->json(['data' => $data]);
        } catch (\Exception $e) {
            return response()->json(['message' => 'An unexpected error occurred while fetching return stats.'], 500);
        }
    }

    /**
     * POST /api/admin/returns
     * Creates a new bad-order record (damage/shortage/defect/wrong item received from supplier).
     *
     * Body:
     * { materialId, vendorId, batchId, damageType, quantity, notes?, status? }
     */
    public function store(Request $request)
    {
        try {
            if (!$this->hasPermission($request, 'badOrders')) {
                return $this->unauthorizedResponse();
            }

            $validated = $request->validate([
                // Accept both new and legacy keys
                'materialId'    => 'required_without:inventoryId|string',
                'inventoryId'   => 'nullable|string',
                'vendorId'      => 'nullable|string',
                'batchId'       => 'nullable|string',
                'damageType'    => 'required|string|in:damaged,defective,wrong_item,shortage,expired,other',
                'quantity'      => 'required_without:qty|integer|min:1',
                'qty'           => 'nullable|integer|min:1',
                'notes'         => 'nullable|string|max:500',
                'status'        => 'nullable|in:pending,replaced,written_off,refunded',
            ]);

            $materialId = $validated['materialId'] ?? $validated['inventoryId'] ?? null;
            $qty        = (int) ($validated['quantity'] ?? $validated['qty'] ?? 0);

            $inventory = Inventory::find($materialId);
            if (!$inventory) {
                return $this->notFoundResponse('Inventory item');
            }

            $returnId = 'BO-' . strtoupper(substr(str_replace('-', '',
                \Illuminate\Support\Str::uuid()->toString()), 0, 8));

            $inventoryReturn = InventoryReturn::create([
                'returnId'      => $returnId,
                'materialId'    => (string) $inventory->_id,
                'materialName'  => $inventory->name,
                'vendorId'      => $validated['vendorId'] ?? ($inventory->supplierId ?? null),
                'vendorName'    => $inventory->supplierName ?? null,
                'batchId'       => $validated['batchId'] ?? null,
                'damageType'    => $validated['damageType'],
                'quantity'      => $qty,
                'unitCost'      => $this->unitCostOf($inventory),
                'totalLoss'     => $this->unitCostOf($inventory) * $qty,
                'status'        => $validated['status'] ?? 'pending',
                'notes'         => htmlspecialchars(strip_tags(trim($validated['notes'] ?? '')), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'),
                'resolvedAt'    => null,
                'createdAt'     => now(),
                'updatedAt'     => now(),
            ]);

            Cache::forget('admin_return_stats');
            return response()->json(['data' => $inventoryReturn], 201);
        } catch (\Illuminate\Validation\ValidationException $e) {
            return $this->validationErrorResponse($e);
        } catch (\Exception $e) {
            return response()->json(['message' => 'An unexpected error occurred while creating bad order.'], 500);
        }
    }

    /**
     * PUT /api/admin/returns/{id}
     * Updates bad order status.
     * Flow: pending → replaced | written_off
     */
    public function update(Request $request, $id)
    {
        try {
            if (!$this->hasPermission($request, 'badOrders')) {
                return $this->unauthorizedResponse();
            }

            $inventoryReturn = InventoryReturn::find($id);
            if (!$inventoryReturn) {
                return $this->notFoundResponse('Return');
            }

            $validated = $request->validate([
                'status' => 'required|in:pending,replaced,written_off,refunded',
                'notes'  => 'nullable|string|max:500',
            ]);

            $previousStatus = $inventoryReturn->status;

            $inventoryReturn->status     = $validated['status'];
            $inventoryReturn->resolvedAt = now();
            $inventoryReturn->updatedAt  = now();

            if (isset($validated['notes'])) {
                $inventoryReturn->notes = htmlspecialchars(strip_tags(trim($validated['notes'])), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
            }

            // Written off / refunded: permanently remove from stock (items are gone either way)
            if (
                in_array($validated['status'], ['written_off', 'refunded'])
                && !in_array($previousStatus, ['written_off', 'refunded'])
            ) {
                $materialId = $inventoryReturn->materialId ?? $inventoryReturn->inventoryId;
                $qty = (int) ($inventoryReturn->quantity ?? $inventoryReturn->qty ?? 0);

                if ($materialId && $qty > 0) {
                    $inventory = Inventory::find($materialId);
                    if ($inventory) {
                        $oldStock = (int) ($inventory->stockQty ?? 0);
                        $newStock = max(0, $oldStock - $qty);
                        $inventory->stockQty = $newStock;
                        $inventory->updatedAt = now();
                        $inventory->save();

                        $performedBy = 'system';
                        $u = $request->user();
                        if ($u) {
                            $performedBy = $u->name ?? trim(($u->firstName ?? '') . ' ' . ($u->lastName ?? ''));
                            if ($performedBy === '') $performedBy = $u->email ?? 'system';
                        }

                        StockHistory::create([
                            'inventoryId'  => (string) $inventory->_id,
                            'quantity'     => $qty,
                            'remainingQty' => $newStock,
                            'unitCost'     => (float) ($inventoryReturn->unitCost ?? 0),
                            'totalCost'    => (float) ($inventoryReturn->unitCost ?? 0) * $qty,
                            'reason'       => $validated['status'] === 'refunded' ? 'adjustment' : 'writeoff',
                            'remarks'      => $validated['status'] === 'refunded' ? 'Bad order refunded — items removed from stock' : 'Bad order written off',
                            'performedBy'  => $performedBy,
                            'type'         => 'out',
                            'createdAt'    => now(),
                        ]);

                        try {
                            AuditLog::create([
                                'inventoryId'  => (string) $inventory->_id,
                                'productName'  => $inventory->name ?? 'Unknown',
                                'category'     => $inventory->category ?? 'Uncategorized',
                                'reason'       => 'writeoff',
                                'quantity'     => $qty,
                                'stockBefore'  => $oldStock,
                                'stockAfter'   => $newStock,
                                'unitCost'     => (float) ($inventoryReturn->unitCost ?? 0),
                                'totalCost'    => (float) ($inventoryReturn->unitCost ?? 0) * $qty,
                                'remarks'      => 'Bad order written off',
                                'performedBy'  => $performedBy,
                                'createdAt'    => now(),
                            ]);
                        } catch (\Exception $auditEx) {
                            \Illuminate\Support\Facades\Log::warning('AuditLog write failed (InventoryReturnController@update written_off)', ['error' => $auditEx->getMessage()]);
                        }
                    }
                }
            }

            // Replaced: net-zero stock change.
            // The defective units are already counted in stockQty (they were never deducted when BO was created).
            // Vendor returns equivalent replacement units — defective out, replacement in = same count.
            // stockQty stays unchanged; only the pending BO is cleared by the status update.

            $inventoryReturn->save();

            Cache::forget('admin_return_stats');
            return response()->json(['data' => $inventoryReturn]);
        } catch (\Illuminate\Validation\ValidationException $e) {
            return $this->validationErrorResponse($e);
        } catch (\Exception $e) {
            return response()->json(['message' => 'An unexpected error occurred while updating bad order.'], 500);
        }
    }
}
