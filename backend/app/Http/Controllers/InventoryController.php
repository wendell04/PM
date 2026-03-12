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

            return response()->json($inventory);
        } catch (\Exception $e) {
            Log::error('InventoryController@index: ' . $e->getMessage());
            return response()->json(['error' => 'Failed to fetch inventory.'], 500);
        }
    }

    /**
     * GET /api/inventory/{id}
     * Returns a single inventory item by ID
     */
    public function show($id)
    {
        try {
            $inventory = Inventory::find($id);

            if (!$inventory) {
                return response()->json(['error' => 'Inventory item not found.'], 404);
            }

            return response()->json($inventory);
        } catch (\Exception $e) {
            Log::error('InventoryController@show: ' . $e->getMessage());
            return response()->json(['error' => 'Failed to fetch inventory item.'], 500);
        }
    }

    /**
     * GET /api/inventory/{id}/history
     * Returns stock history for an inventory item
     */
    public function history($id)
    {
        try {
            $inventory = Inventory::find($id);

            if (!$inventory) {
                return response()->json(['error' => 'Inventory item not found.'], 404);
            }

            $history = StockHistory::where('inventoryId', $id)
                                   ->orderBy('createdAt', 'desc')
                                   ->get();

            return response()->json($history);
        } catch (\Exception $e) {
            Log::error('InventoryController@history: ' . $e->getMessage());
            return response()->json(['error' => 'Failed to fetch stock history.'], 500);
        }
    }

    /**
     * POST /api/inventory
     * Creates a new inventory item
     */
    public function store(Request $request)
    {
        try {
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
                return response()->json(['error' => 'Duplicate item: An item with this name and category already exists.'], 422);
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

            return response()->json($inventory, 201);
        } catch (\Illuminate\Validation\ValidationException $e) {
            return response()->json(['errors' => $e->errors()], 422);
        } catch (\Exception $e) {
            Log::error('InventoryController@store: ' . $e->getMessage());
            return response()->json(['error' => 'Failed to create inventory item.'], 500);
        }
    }

    /**
     * PUT /api/inventory/{id}
     * Updates an existing inventory item
     */
    public function update(Request $request, $id)
    {
        try {
            $inventory = Inventory::find($id);

            if (!$inventory) {
                return response()->json(['error' => 'Inventory item not found.'], 404);
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
                    return response()->json(['error' => 'Duplicate item.'], 422);
                }
            }

            $inventory->update($validated);
            $inventory->updatedAt = now();
            $inventory->save();

            return response()->json($inventory);
        } catch (\Illuminate\Validation\ValidationException $e) {
            return response()->json(['errors' => $e->errors()], 422);
        } catch (\Exception $e) {
            Log::error('InventoryController@update: ' . $e->getMessage());
            return response()->json(['error' => 'Failed to update inventory item.'], 500);
        }
    }

    /**
     * POST /api/inventory/{id}/adjust-stock
     * Adjusts stock level (add or deduct)
     */
    public function adjustStock(Request $request, $id)
    {
        try {
            $inventory = Inventory::find($id);

            if (!$inventory) {
                return response()->json(['error' => 'Inventory item not found.'], 404);
            }

            $validated = $request->validate([
                'quantity'     => 'required|integer',
                'reason'       => 'required|in:restock,correction-add,correction-deduct,sale,return',
                'supplierId'   => 'nullable|string',
                'supplierName' => 'nullable|string',
                'unitCost'     => 'nullable|numeric|min:0',
            ]);

            $quantity = $validated['quantity'];
            $newStock = $inventory->stockQty + $quantity;

            if ($newStock < 0) {
                return response()->json(['error' => 'Insufficient stock.'], 422);
            }

            $inventory->stockQty = $newStock;

            if ($quantity > 0 && isset($validated['unitCost'])) {
                $totalCost = ($inventory->averageCost * ($inventory->stockQty - $quantity)) + ($validated['unitCost'] * $quantity);
                $inventory->averageCost = $totalCost / $inventory->stockQty;
                $inventory->lastUnitCost = $validated['unitCost'];
            }

            $inventory->updatedAt = now();
            $inventory->save();

            StockHistory::create([
                'inventoryId'  => $inventory->_id,
                'supplierId'   => $validated['supplierId'] ?? null,
                'quantity'     => abs($quantity),
                'remainingQty' => $newStock,
                'unitCost'     => $validated['unitCost'] ?? $inventory->averageCost,
                'totalCost'    => abs($quantity) * ($validated['unitCost'] ?? $inventory->averageCost),
                'reason'       => $validated['reason'],
                'createdAt'    => now(),
            ]);

            return response()->json($inventory);
        } catch (\Illuminate\Validation\ValidationException $e) {
            return response()->json(['errors' => $e->errors()], 422);
        } catch (\Exception $e) {
            Log::error('InventoryController@adjustStock: ' . $e->getMessage());
            return response()->json(['error' => 'Failed to adjust stock.'], 500);
        }
    }

    /**
     * DELETE /api/inventory/{id}
     * Soft-deletes an inventory item
     */
    public function destroy($id)
    {
        try {
            $inventory = Inventory::find($id);

            if (!$inventory) {
                return response()->json(['error' => 'Inventory item not found.'], 404);
            }

            $linkedProducts = \App\Models\Product::where('inventoryId', $id)->count();
            if ($linkedProducts > 0) {
                return response()->json(['error' => 'Cannot delete: Item is linked to ' . $linkedProducts . ' product(s).'], 422);
            }

            $inventory->isActive = false;
            $inventory->deletedAt = now();
            $inventory->save();

            return response()->json(['message' => 'Inventory item deactivated successfully.']);
        } catch (\Exception $e) {
            Log::error('InventoryController@destroy: ' . $e->getMessage());
            return response()->json(['error' => 'Failed to delete inventory item.'], 500);
        }
    }
}
