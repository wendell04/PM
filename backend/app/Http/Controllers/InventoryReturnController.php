<?php

namespace App\Http\Controllers;

use App\Models\Inventory;
use App\Models\InventoryReturn;
use App\Models\StockHistory;
use Illuminate\Http\Request;

class InventoryReturnController extends Controller
{
    /**
     * GET /api/admin/returns
     * Returns all return records ordered by createdAt DESC
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

            if ($request->filled('inventoryId')) {
                $query->where('inventoryId', $request->inventoryId);
            }

            $returns = $query->get();

            return $this->successResponse('Returns fetched successfully.', $returns);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'An unexpected error occurred while fetching returns.');
        }
    }

    /**
     * GET /api/admin/returns/stats
     * Returns pending count for dashboard
     */
    public function stats(Request $request)
    {
        try {
            if (!$this->isAdmin($request)) {
                return $this->unauthorizedResponse();
            }

            $pendingCount = InventoryReturn::where('status', 'pending')->count();

            return $this->successResponse('Return stats fetched successfully.', [
                'pendingCount' => $pendingCount,
            ]);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'An unexpected error occurred while fetching return stats.');
        }
    }

    /**
     * POST /api/admin/returns
     * Creates a new return record
     */
    public function store(Request $request)
    {
        try {
            if (!$this->isAdmin($request)) {
                return $this->unauthorizedResponse();
            }

            $validated = $request->validate([
                'inventoryId'   => 'required|string',
                'qty'           => 'required|integer|min:1',
                'reason'        => 'required|in:damaged,defective,wrong_item,shortage,expired,other',
                'notes'         => 'nullable|string|max:500',
            ]);

            $inventory = Inventory::find($validated['inventoryId']);
            if (!$inventory) {
                return $this->notFoundResponse('Inventory item');
            }

            $returnId = 'RTV-' . strtoupper(substr(str_replace('-', '',
                \Illuminate\Support\Str::uuid()->toString()), 0, 8));

            $inventoryReturn = InventoryReturn::create([
                'returnId'      => $returnId,
                'inventoryId'   => $inventory->_id,
                'inventoryName' => $inventory->name,
                'supplierId'    => $inventory->supplierId ?? null,
                'supplierName'  => $inventory->supplierName ?? null,
                'qty'           => $validated['qty'],
                'unitCost'      => $inventory->averageCost ?? 0,
                'reason'        => $validated['reason'],
                'status'        => 'pending',
                'notes'         => $validated['notes'] ?? '',
                'resolvedAt'    => null,
                'createdAt'     => now(),
                'updatedAt'     => now(),
            ]);

            return $this->successResponse('Return created successfully.', $inventoryReturn);
        } catch (\Illuminate\Validation\ValidationException $e) {
            return $this->validationErrorResponse($e);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'An unexpected error occurred while creating return.');
        }
    }

    /**
     * PUT /api/admin/returns/{id}
     * Updates return status. If replacement_received, restores inventory stock.
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

            if ($inventoryReturn->status !== 'pending') {
                return $this->errorResponse('Only pending returns can be updated.', 422);
            }

            $validated = $request->validate([
                'status' => 'required|in:replacement_received,credited,cancelled',
                'notes'  => 'nullable|string|max:500',
            ]);

            $oldStatus = $inventoryReturn->status;
            $inventoryReturn->status     = $validated['status'];
            $inventoryReturn->resolvedAt = now();
            $inventoryReturn->updatedAt  = now();

            if (isset($validated['notes'])) {
                $inventoryReturn->notes = $validated['notes'];
            }

            $inventoryReturn->save();

            // Restore stock if replacement received
            if ($validated['status'] === 'replacement_received') {
                $inventory = Inventory::find($inventoryReturn->inventoryId);
                if ($inventory) {
                    $qty         = $inventoryReturn->qty;
                    $unitCost    = $inventoryReturn->unitCost;
                    $oldStock    = $inventory->stockQty;
                    $newStock    = $oldStock + $qty;

                    // Recalculate weighted average cost
                    $currentTotalCost = ($inventory->averageCost ?? 0) * $oldStock;
                    $newAdditionCost  = $unitCost * $qty;
                    $inventory->averageCost  = $newStock > 0
                        ? ($currentTotalCost + $newAdditionCost) / $newStock
                        : $unitCost;
                    $inventory->stockQty     = $newStock;
                    $inventory->updatedAt    = now();
                    $inventory->save();

                    StockHistory::create([
                        'inventoryId'   => $inventory->_id,
                        'type'          => 'add',
                        'reason'        => 'return',
                        'quantity'      => $qty,
                        'unitCost'      => $unitCost,
                        'balanceAfter'  => $newStock,
                        'notes'         => 'RTV replacement: ' . $inventoryReturn->returnId,
                        'createdAt'     => now(),
                    ]);
                }
            }

            return $this->successResponse('Return updated successfully.', $inventoryReturn);
        } catch (\Illuminate\Validation\ValidationException $e) {
            return $this->validationErrorResponse($e);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'An unexpected error occurred while updating return.');
        }
    }
}
