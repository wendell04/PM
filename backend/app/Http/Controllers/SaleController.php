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

            return response()->json($sales);
        } catch (\Exception $e) {
            Log::error('SaleController@index: ' . $e->getMessage());
            return response()->json(['error' => 'Failed to fetch sales.'], 500);
        }
    }

    /**
     * GET /api/admin/sales/{id}
     * Returns a single sale record by ID
     */
    public function show($id)
    {
        try {
            $sale = Sale::find($id);

            if (!$sale) {
                return response()->json(['error' => 'Sale record not found.'], 404);
            }

            return response()->json($sale);
        } catch (\Exception $e) {
            Log::error('SaleController@show: ' . $e->getMessage());
            return response()->json(['error' => 'Failed to fetch sale record.'], 500);
        }
    }

    /**
     * POST /api/admin/sales
     * Creates a new sale record
     */
    public function store(Request $request)
    {
        try {
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

            // Generate Sale ID
            $lastSale = Sale::orderBy('saleId', 'desc')->first();
            $lastNumber = $lastSale ? intval(substr($lastSale->saleId, 5)) : 0;
            $newSaleId = 'SALE-' . str_pad($lastNumber + 1, 3, '0', STR_PAD_LEFT);

            // Calculate profit if cost provided
            $cost = $validated['cost'] ?? 0;
            $profit = $validated['totalPrice'] - $cost;

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

            return response()->json($sale, 201);
        } catch (\Illuminate\Validation\ValidationException $e) {
            return response()->json(['errors' => $e->errors()], 422);
        } catch (\Exception $e) {
            Log::error('SaleController@store: ' . $e->getMessage());
            return response()->json(['error' => 'Failed to create sale record.'], 500);
        }
    }

    /**
     * PUT /api/admin/sales/{id}
     * Updates a sale record
     */
    public function update(Request $request, $id)
    {
        try {
            $sale = Sale::find($id);

            if (!$sale) {
                return response()->json(['error' => 'Sale record not found.'], 404);
            }

            $validated = $request->validate([
                'status' => 'sometimes|in:completed,refunded',
                'notes'  => 'nullable|string',
            ]);

            $sale->update($validated);

            return response()->json($sale);
        } catch (\Illuminate\Validation\ValidationException $e) {
            return response()->json(['errors' => $e->errors()], 422);
        } catch (\Exception $e) {
            Log::error('SaleController@update: ' . $e->getMessage());
            return response()->json(['error' => 'Failed to update sale record.'], 500);
        }
    }

    /**
     * GET /api/admin/sales/summary
     * Returns sales summary statistics
     */
    public function summary(Request $request)
    {
        try {
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
            $manualSales = (clone $query)->where('source', 'manual')->sum('totalPrice');
            $onlineSales = (clone $query)->where('source', 'online')->sum('totalPrice');

            return response()->json([
                'totalSales' => $totalSales,
                'totalRevenue' => $totalRevenue,
                'totalCost' => $totalCost,
                'totalProfit' => $totalProfit,
                'manualSales' => $manualSales,
                'onlineSales' => $onlineSales,
            ]);
        } catch (\Exception $e) {
            Log::error('SaleController@summary: ' . $e->getMessage());
            return response()->json(['error' => 'Failed to fetch sales summary.'], 500);
        }
    }
}
