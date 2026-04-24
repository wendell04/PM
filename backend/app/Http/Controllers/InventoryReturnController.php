<?php

namespace App\Http\Controllers;

use App\Models\Inventory;
use App\Models\InventoryReturn;
use App\Models\StockHistory;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;

class InventoryReturnController extends Controller
{
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
            if (!$this->isAdmin($request)) {
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
            if (!$this->isAdmin($request)) {
                return $this->unauthorizedResponse();
            }

            $data = Cache::remember('admin_return_stats', 30, function () {
                return [
                    'pendingCount'    => InventoryReturn::where('status', 'pending')->count(),
                    'replacedCount'   => InventoryReturn::where('status', 'replaced')->count(),
                    'writtenOffCount' => InventoryReturn::where('status', 'written_off')->count(),
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
            if (!$this->isAdmin($request)) {
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
                'status'        => 'nullable|in:pending,replaced,written_off',
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
                'unitCost'      => (float) ($inventory->averageCost ?? 0),
                'totalLoss'     => (float) ($inventory->averageCost ?? 0) * $qty,
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
            if (!$this->isAdmin($request)) {
                return $this->unauthorizedResponse();
            }

            $inventoryReturn = InventoryReturn::find($id);
            if (!$inventoryReturn) {
                return $this->notFoundResponse('Return');
            }

            $validated = $request->validate([
                'status' => 'required|in:pending,replaced,written_off',
                'notes'  => 'nullable|string|max:500',
            ]);

            $previousStatus = $inventoryReturn->status;

            $inventoryReturn->status     = $validated['status'];
            $inventoryReturn->resolvedAt = now();
            $inventoryReturn->updatedAt  = now();

            if (isset($validated['notes'])) {
                $inventoryReturn->notes = htmlspecialchars(strip_tags(trim($validated['notes'])), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
            }

            // Replacement received: restore stock to inventory batches + audit trail
            if (
                $validated['status'] === 'replaced'
                && $previousStatus !== 'replaced'
            ) {
                $materialId = $inventoryReturn->materialId ?? $inventoryReturn->inventoryId;
                $qty = (int) ($inventoryReturn->quantity ?? $inventoryReturn->qty ?? 0);
                $unitCost = (float) ($inventoryReturn->unitCost ?? 0);

                if ($materialId && $qty > 0) {
                    $inventory = Inventory::find($materialId);
                    if ($inventory) {
                        $batches = $inventory->batches ?? [];
                        if (!is_array($batches)) {
                            $batches = [];
                        }

                        if (count($batches) === 0) {
                            $batches[] = [
                                'batchId'       => (string) \Illuminate\Support\Str::uuid(),
                                'invoiceNumber' => null,
                                'supplierId'    => $inventoryReturn->vendorId ?? $inventory->supplierId ?? null,
                                'vendorName'    => $inventoryReturn->vendorName ?? $inventory->supplierName ?? null,
                                'goodQty'       => $qty,
                                'remainingQty'  => $qty,
                                'qtyDamaged'    => 0,
                                'unitCost'      => $unitCost > 0 ? $unitCost : ($inventory->averageCost ?? 0),
                                'dateReceived'  => now()->toISOString(),
                                'createdAt'     => now()->toISOString(),
                            ];
                        } else {
                            usort($batches, function ($a, $b) {
                                return strtotime($b['dateReceived'] ?? '0') <=> strtotime($a['dateReceived'] ?? '0');
                            });
                            $idx = 0;
                            $curRem = (int) ($batches[$idx]['remainingQty'] ?? $batches[$idx]['goodQty'] ?? 0);
                            $curGood = (int) ($batches[$idx]['goodQty'] ?? $curRem);
                            $batches[$idx]['remainingQty'] = $curRem + $qty;
                            $batches[$idx]['goodQty'] = $curGood + $qty;
                        }

                        $oldStock = (int) ($inventory->stockQty ?? 0);
                        $newStock = $oldStock + $qty;
                        $inventory->batches = $batches;
                        $inventory->stockQty = $newStock;

                        if ($unitCost > 0 && $newStock > 0) {
                            $currentTotalCost = ($inventory->averageCost ?? 0) * $oldStock;
                            $inventory->averageCost = ($currentTotalCost + $unitCost * $qty) / $newStock;
                        }

                        $inventory->updatedAt = now();
                        $inventory->save();

                        $performedBy = 'system';
                        $u = $request->user();
                        if ($u) {
                            $performedBy = $u->name
                                ?? trim(($u->firstName ?? '') . ' ' . ($u->lastName ?? ''));
                            if ($performedBy === '') {
                                $performedBy = $u->email ?? 'system';
                            }
                        }

                        StockHistory::create([
                            'inventoryId'  => (string) $inventory->_id,
                            'quantity'     => $qty,
                            'remainingQty' => $newStock,
                            'unitCost'     => $unitCost,
                            'totalCost'    => $unitCost * $qty,
                            'reason'       => 'return',
                            'remarks'      => 'Bad order replacement received from vendor',
                            'performedBy'  => $performedBy,
                            'type'         => 'in',
                            'createdAt'    => now(),
                        ]);
                    }
                }
            }

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
