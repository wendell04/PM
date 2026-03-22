<?php

namespace App\Http\Controllers;

use App\Models\Sale;
use App\Models\Inventory;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

class SaleController extends Controller
{
    /**
     * GET /api/admin/sales
     * Returns all sales records with optional filters
     */
    public function index(Request $request)
    {
        try {
            if (!$this->isAdmin($request)) {
                return $this->unauthorizedResponse();
            }

            $query = Sale::orderBy('saleDate', 'desc');

            if ($request->filled('source')) {
                $query->where('source', $request->source);
            }

            if ($request->filled('status')) {
                $query->where('status', $request->status);
            }

            if ($request->filled('startDate')) {
                $query->where('saleDate', '>=', $request->startDate);
            }

            if ($request->filled('endDate')) {
                $query->where('saleDate', '<=', $request->endDate);
            }

            if ($request->filled('inventoryId')) {
                $query->where('inventoryId', $request->inventoryId);
            }

            $sales = $query->limit(100)->get();

            return $this->successResponse('Sales fetched successfully.', $sales);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'An unexpected error occurred while fetching sales.');
        }
    }

    public function show(Request $request, $id)
    {
        try {
            if (!$this->isAdmin($request)) {
                return $this->unauthorizedResponse();
            }

            $sale = Sale::find($id);

            if (!$sale) {
                return $this->notFoundResponse('Sale record');
            }

            return $this->successResponse('Sale fetched successfully.', $sale);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'An unexpected error occurred while fetching the sale record.');
        }
    }

    public function store(Request $request)
    {
        try {
            if (!$this->isAdmin($request)) {
                return $this->unauthorizedResponse();
            }

            $validated = $request->validate([
                'inventoryId'    => 'required|string',
                'productName'    => 'required|string',
                'category'       => 'required|string',
                'quantity'       => 'required|integer|min:1',
                'unitPrice'      => 'required|numeric|min:0',
                'totalPrice'     => 'required|numeric|min:0',
                'cost'           => 'nullable|numeric|min:0',
                'saleDate'       => 'required|date',
                'customerName'   => 'nullable|string',
                'customerContact' => 'nullable|string',
                'customerEmail'  => 'nullable|string',
                'source'         => 'sometimes|in:manual,online',
                'status'         => 'sometimes|in:completed,refunded',
                'notes'          => 'nullable|string',
            ]);

            // Generate Sale ID (no transaction wrapper for MongoDB compatibility)
            $lastSale = Sale::orderBy('saleId', 'desc')->first();
            $lastNumber = $lastSale ? intval(substr($lastSale->saleId, 5)) : 0;
            $newSaleId = 'SALE-' . str_pad($lastNumber + 1, 3, '0', STR_PAD_LEFT);

            // Calculate profit if cost provided
            $cost = $validated['cost'] ?? 0;
            $profit = $validated['totalPrice'] - $cost;

            // Deduct from Inventory if not Upon Order
            $inventory = Inventory::find($validated['inventoryId']);
            if (!$inventory) {
                throw new \Exception('Inventory item not found.');
            }

            if (!$inventory->isOnDemand) {
                if ($inventory->stockQty < $validated['quantity']) {
                    throw new \Exception("Insufficient stock for '{$inventory->name}'. Available: {$inventory->stockQty}");
                }
                $inventory->stockQty -= $validated['quantity'];
                $inventory->save();
            }

            $sale = Sale::create([
                'saleId'          => $newSaleId,
                'inventoryId'     => $validated['inventoryId'],
                'productName'     => $validated['productName'],
                'category'        => $validated['category'],
                'quantity'        => $validated['quantity'],
                'unitPrice'       => $validated['unitPrice'],
                'totalPrice'      => $validated['totalPrice'],
                'cost'            => $cost,
                'profit'          => $profit,
                'saleDate'        => $validated['saleDate'],
                'customerName'    => $validated['customerName'] ?? 'N/A',
                'customerContact' => $validated['customerContact'] ?? 'N/A',
                'customerEmail'   => $validated['customerEmail'] ?? 'N/A',
                'source'          => $validated['source'] ?? 'manual',
                'status'          => $validated['status'] ?? 'completed',
                'notes'           => $validated['notes'] ?? '',
                'createdAt'       => now(),
            ]);

            return $this->successResponse('Sale created successfully.', $sale, 201);
        } catch (\Illuminate\Validation\ValidationException $e) {
            return $this->validationErrorResponse($e);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'An unexpected error occurred while creating the sale record.');
        }
    }

    public function update(Request $request, $id)
    {
        try {
            if (!$this->isAdmin($request)) {
                return $this->unauthorizedResponse();
            }

            $sale = Sale::find($id);

            if (!$sale) {
                return $this->notFoundResponse('Sale record');
            }

            $validated = $request->validate([
                'status' => 'sometimes|in:completed,refunded',
                'notes'  => 'nullable|string',
            ]);

            $sale->update($validated);

            return $this->successResponse('Sale updated successfully.', $sale);
        } catch (\Illuminate\Validation\ValidationException $e) {
            return $this->validationErrorResponse($e);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'An unexpected error occurred while updating the sale record.');
        }
    }

    public function summary(Request $request)
    {
        try {
            if (!$this->isAdmin($request)) {
                return $this->unauthorizedResponse();
            }

            $query = Sale::where('status', 'completed');

            if ($request->filled('startDate')) {
                $query->where('saleDate', '>=', $request->startDate);
            }

            if ($request->filled('endDate')) {
                $query->where('saleDate', '<=', $request->endDate);
            }

            $totalSales = $query->count();
            $totalRevenue = $query->sum('totalPrice');
            $totalCost = $query->sum('cost');
            $totalProfit = $totalRevenue - $totalCost;

            // Group by source
            $manualSales = Sale::where('status', 'completed')
                ->where('source', 'manual')
                ->sum('totalPrice');

            $onlineSales = Sale::where('status', 'completed')
                ->where('source', 'online')
                ->sum('totalPrice');

            return $this->successResponse('Sales summary fetched successfully.', [
                'totalSales' => $totalSales,
                'totalRevenue' => $totalRevenue,
                'totalCost' => $totalCost,
                'totalProfit' => $totalProfit,
                'manualSales' => $manualSales,
                'onlineSales' => $onlineSales,
            ]);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'An unexpected error occurred while fetching the sales summary.');
        }
    }
}
