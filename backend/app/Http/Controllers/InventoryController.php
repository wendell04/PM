<?php

namespace App\Http\Controllers;

use App\Models\Inventory;
use App\Models\StockHistory;
use App\Models\Supplier;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

class InventoryController extends Controller
{
    /**
     * GET /api/inventory
     * Returns all active inventory items
     */
    public function index(Request $request)
    {
        try {
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

            $inventory = $query->orderBy('category', 'asc')
                               ->orderBy('name', 'asc')
                               ->get();

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
            if (!$this->isAdmin($request)) {
                return $this->unauthorizedResponse();
            }

            $movements = StockHistory::orderBy('createdAt', 'desc')
                ->limit(10)
                ->get(['inventoryId', 'quantity', 'reason', 'remarks', 'createdAt']);

            // Batch-load inventory names to avoid N+1
            $inventoryIds = $movements->pluck('inventoryId')->unique()->filter()->values()->toArray();
            $inventoryMap = Inventory::whereIn('_id', $inventoryIds)
                ->get(['_id', 'name'])
                ->keyBy(fn($i) => (string) $i->_id);

            $typeMap = [
                'restock'          => 'in',
                'return'           => 'in',
                'initial'          => 'in',
                'correction-add'   => 'in',
                'sale'             => 'out',
                'damaged'          => 'out',
                'correction-deduct'=> 'out',
                'sales-outside'    => 'out',
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
            ];

            $result = $movements->map(function ($m) use ($inventoryMap, $typeMap, $labelMap) {
                $inv  = isset($inventoryMap[(string) $m->inventoryId])
                    ? $inventoryMap[(string) $m->inventoryId]
                    : null;
                $type = $typeMap[$m->reason] ?? 'in';
                return [
                    'item'  => $inv ? $inv->name : 'Unknown Item',
                    'qty'   => (int) $m->quantity,
                    'type'  => $type,
                    'label' => $labelMap[$m->reason] ?? ucfirst($m->reason ?? ''),
                    'time'  => $m->createdAt ? $m->createdAt->format('M d, g:i A') : '',
                ];
            })->values()->toArray();

            return $this->successResponse('Recent movements fetched successfully.', [
                'movements' => $result,
            ]);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'An unexpected error occurred while fetching recent movements.');
        }
    }

    public function store(Request $request)
    {
        try {
            if (!$this->isAdmin($request)) {
                return $this->unauthorizedResponse();
            }

            $validated = $request->validate([
                'name'          => 'required|string|max:255',
                'category'      => 'required|string|max:100',
                'stockQty'      => 'required|integer|min:0',
                'minStockLevel' => 'required|integer|min:0',
                'isOnDemand'    => 'boolean',
                'supplierId'    => 'nullable|string',
                'supplierName'  => 'nullable|string',
                'unitCost'      => 'required|numeric|min:0',
            ]);

            $duplicate = Inventory::where('name', $validated['name'])
                                  ->where('category', $validated['category'])
                                  ->where('isActive', true)
                                  ->first();

            if ($duplicate) {
                return $this->errorResponse('Duplicate item: An item with this name and category already exists.', 422);
            }

            $inventory = Inventory::create([
                'name'          => $validated['name'],
                'category'      => $validated['category'],
                'stockQty'      => $validated['stockQty'],
                'minStockLevel' => $validated['minStockLevel'],
                'isOnDemand'    => $validated['isOnDemand'] ?? false,
                'isActive'      => true,
                'supplierId'    => $validated['supplierId'] ?? null,
                'supplierName'  => $validated['supplierName'] ?? 'Unspecified',
                'lastUnitCost'  => $validated['unitCost'],
                'averageCost'   => $validated['unitCost'],
                'createdAt'     => now(),
                'updatedAt'     => now(),
            ]);

            StockHistory::create([
                'inventoryId'  => $inventory->_id,
                'supplierId'   => $validated['supplierId'] ?? null,
                'quantity'     => $validated['stockQty'],
                'remainingQty' => $validated['stockQty'],
                'unitCost'     => $validated['unitCost'],
                'totalCost'    => $validated['stockQty'] * $validated['unitCost'],
                'reason'       => 'initial',
                'createdAt'    => now(),
            ]);

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
            if (!$this->isAdmin($request)) {
                return $this->unauthorizedResponse();
            }

            $inventory = Inventory::find($id);

            if (!$inventory) {
                return $this->notFoundResponse('Inventory item');
            }

            $validated = $request->validate([
                'name'          => 'sometimes|required|string|max:255',
                'category'      => 'sometimes|required|string|max:100',
                'stockQty'      => 'sometimes|required|integer|min:0',
                'minStockLevel' => 'sometimes|required|integer|min:0',
                'isOnDemand'    => 'sometimes|boolean',
                'isActive'      => 'sometimes|boolean',
                'supplierId'    => 'nullable|string',
                'supplierName'  => 'nullable|string',
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

            $inventory->update($validated);
            $inventory->updatedAt = now();
            $inventory->save();

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
            if (!$this->isAdmin($request)) {
                return $this->unauthorizedResponse();
            }

            $inventory = Inventory::find($id);

            if (!$inventory) {
                return $this->notFoundResponse('Inventory item');
            }

            $validated = $request->validate([
                'quantity'         => 'required|integer',
                'reason'           => 'required|in:restock,correction-add,correction-deduct,sale,return,sales-outside,damaged',
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
            $newStock = $inventory->stockQty + $quantity;

            if ($newStock < 0) {
                throw new \Exception('Insufficient stock.');
            }

            $inventory->stockQty = $newStock;

            if ($quantity > 0 && isset($validated['unitCost'])) {
                $currentTotalCost = ($inventory->averageCost ?? 0) * ($newStock - $quantity);
                $newAdditionCost = ($validated['unitCost'] * $quantity);
                $inventory->averageCost = ($currentTotalCost + $newAdditionCost) / $newStock;
                $inventory->lastUnitCost = $validated['unitCost'];
            }

            $inventory->updatedAt = now();
            $inventory->save();

            StockHistory::create([
                'inventoryId'   => $inventory->_id,
                'supplierId'    => $validated['supplierId'] ?? null,
                'supplierName'  => $validated['supplierName'] ?? null,
                'quantity'      => abs($quantity),
                'remainingQty'  => $newStock,
                'unitCost'      => $validated['unitCost'] ?? $inventory->averageCost,
                'totalCost'     => abs($quantity) * ($validated['unitCost'] ?? $inventory->averageCost),
                'reason'        => $validated['reason'],
                'batchId'       => $validated['batchId'] ?? null,
                'invoiceNumber' => $validated['invoiceNumber'] ?? null,
                'deliveryDate'  => $validated['deliveryDate'] ?? null,
                'sellingPrice'  => $validated['sellingPrice'] ?? null,
                'saleDate'      => $validated['saleDate'] ?? null,
                'customerName'  => $validated['customerName'] ?? null,
                'remarks'       => $validated['remarks'] ?? null,
                'createdAt'     => now(),
            ]);

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
            if (!$this->isAdmin($request)) {
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

            return $this->successResponse('Inventory item deactivated successfully.');
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'An unexpected error occurred while deleting the inventory item.');
        }
    }
}
