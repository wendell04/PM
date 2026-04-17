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

            $sales = $query->limit(2000)->get();

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

            $totalSales   = $query->count();
            $totalRevenue = $query->sum('totalPrice');
            $totalCost    = $query->sum('cost');
            $totalProfit  = $totalRevenue - $totalCost;

            // Group by source (re-query — $query is already consumed above)
            $manualSales = Sale::where('status', 'completed')
                ->where('source', 'manual')
                ->sum('totalPrice');

            $onlineSales = Sale::where('status', 'completed')
                ->where('source', 'online')
                ->sum('totalPrice');

            // Optional period grouping for charts
            $groupBy  = $request->input('groupBy'); // daily | weekly | monthly
            $grouped  = [];

            if (in_array($groupBy, ['daily', 'weekly', 'monthly'])) {
                $allSales = Sale::where('status', 'completed')
                    ->when($request->filled('startDate'), fn($q) => $q->where('saleDate', '>=', $request->startDate))
                    ->when($request->filled('endDate'),   fn($q) => $q->where('saleDate', '<=', $request->endDate))
                    ->get(['saleDate', 'totalPrice', 'cost']);

                $buckets = [];
                foreach ($allSales as $sale) {
                    $date = \Carbon\Carbon::parse($sale->saleDate);
                    $key  = match ($groupBy) {
                        'daily'   => $date->format('Y-m-d'),
                        'weekly'  => $date->format('Y-W'),
                        'monthly' => $date->format('Y-m'),
                    };
                    if (!isset($buckets[$key])) {
                        $buckets[$key] = ['period' => $key, 'revenue' => 0, 'cost' => 0, 'profit' => 0];
                    }
                    $buckets[$key]['revenue'] += (float) ($sale->totalPrice ?? 0);
                    $buckets[$key]['cost']    += (float) ($sale->cost       ?? 0);
                    $buckets[$key]['profit']  += (float) ($sale->totalPrice ?? 0) - (float) ($sale->cost ?? 0);
                }
                ksort($buckets);
                $grouped = array_values($buckets);
            }

            return $this->successResponse('Sales summary fetched successfully.', [
                'totalSales'   => $totalSales,
                'totalRevenue' => $totalRevenue,
                'totalCost'    => $totalCost,
                'totalProfit'  => $totalProfit,
                'manualSales'  => $manualSales,
                'onlineSales'  => $onlineSales,
                'grouped'      => $grouped,
            ]);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'An unexpected error occurred while fetching the sales summary.');
        }
    }

    /**
     * GET /api/admin/sales/top-products
     * Returns top 5 products by total quantity sold (completed sales only).
     * Optional query params: startDate, endDate
     */
    public function topProducts(Request $request)
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

            $sales = $query->get(['productName', 'category', 'quantity', 'totalPrice']);

            // Group by productName in PHP — MongoDB driver does not support groupBy+sum in one chain
            $grouped = [];
            foreach ($sales as $sale) {
                $key = $sale->productName ?? 'Unknown';
                if (!isset($grouped[$key])) {
                    $grouped[$key] = [
                        'productName' => $key,
                        'category'    => $sale->category ?? '',
                        'totalQty'    => 0,
                        'totalRevenue'=> 0,
                    ];
                }
                $grouped[$key]['totalQty']     += (int)   ($sale->quantity   ?? 0);
                $grouped[$key]['totalRevenue'] += (float) ($sale->totalPrice ?? 0);
            }

            usort($grouped, fn($a, $b) => $b['totalQty'] <=> $a['totalQty']);

            $limit  = max(1, min(20, (int) $request->input('limit', 5)));
            $topN   = array_slice(array_values($grouped), 0, $limit);

            return $this->successResponse('Top products fetched successfully.', [
                'products' => $topN,
            ]);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'An unexpected error occurred while fetching top products.');
        }
    }
}
