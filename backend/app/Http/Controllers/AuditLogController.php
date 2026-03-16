<?php

namespace App\Http\Controllers;

use App\Models\AuditLog;
use App\Models\Inventory;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

class AuditLogController extends Controller
{
    /**
     * GET /api/admin/audit-logs
     * Returns all audit logs with optional filters
     */
    public function index(Request $request)
    {
        try {
            if (!$this->isAdmin($request)) return response()->json(['message' => 'unauthorized'], 403);

            $query = AuditLog::orderBy('createdAt', 'desc');

            if ($request->filled('inventoryId')) {
                $query->where('inventoryId', $request->inventoryId);
            }

            if ($request->filled('reason')) {
                $query->where('reason', $request->reason);
            }

            if ($request->filled('startDate')) {
                $query->where('createdAt', '>=', $request->startDate);
            }

            if ($request->filled('endDate')) {
                $query->where('createdAt', '<=', $request->endDate);
            }

            $auditLogs = $query->limit(100)->get();

            return response()->json($auditLogs);
        } catch (\Exception $e) {
            Log::error('AuditLogController@index: ' . $e->getMessage());
            return response()->json(['error' => 'Failed to fetch audit logs.'], 500);
        }
    }

    /**
     * GET /api/admin/audit-logs/inventory/{inventoryId}
     * Returns audit logs for a specific inventory item
     */
    public function byInventory(Request $request, $inventoryId)
    {
        try {
            if (!$this->isAdmin($request)) return response()->json(['message' => 'unauthorized'], 403);

            $auditLogs = AuditLog::where('inventoryId', $inventoryId)
                                 ->orderBy('createdAt', 'desc')
                                 ->get();

            return response()->json($auditLogs);
        } catch (\Exception $e) {
            Log::error('AuditLogController@byInventory: ' . $e->getMessage());
            return response()->json(['error' => 'Failed to fetch audit logs.'], 500);
        }
    }

    /**
     * POST /api/admin/audit-logs
     * Creates a new audit log entry
     */
    public function store(Request $request)
    {
        try {
            if (!$this->isAdmin($request)) return response()->json(['message' => 'unauthorized'], 403);

            $validated = $request->validate([
                'inventoryId'   => 'required|string',
                'productName'   => 'required|string',
                'category'      => 'required|string',
                'reason'        => 'required|in:restock,correction-add,correction-deduct,sale,return,sales-outside',
                'quantity'      => 'required|integer',
                'stockBefore'   => 'required|integer',
                'stockAfter'    => 'required|integer',
                'unitCost'      => 'nullable|numeric|min:0',
                'totalCost'     => 'nullable|numeric|min:0',
                'supplierId'    => 'nullable|string',
                'sellingPrice'  => 'nullable|numeric|min:0',
                'customerName'  => 'nullable|string',
                'saleDate'      => 'nullable|date',
                'remarks'       => 'nullable|string',
                'performedBy'   => 'nullable|string',
            ]);

            $auditLog = AuditLog::create([
                'inventoryId'  => $validated['inventoryId'],
                'productName'  => $validated['productName'],
                'category'     => $validated['category'],
                'reason'       => $validated['reason'],
                'quantity'     => $validated['quantity'],
                'stockBefore'  => $validated['stockBefore'],
                'stockAfter'   => $validated['stockAfter'],
                'unitCost'     => $validated['unitCost'] ?? 0,
                'totalCost'    => $validated['totalCost'] ?? 0,
                'supplierId'   => $validated['supplierId'] ?? null,
                'sellingPrice' => $validated['sellingPrice'] ?? null,
                'customerName' => $validated['customerName'] ?? null,
                'saleDate'     => $validated['saleDate'] ?? null,
                'remarks'      => $validated['remarks'] ?? '',
                'performedBy'  => $validated['performedBy'] ?? null,
                'createdAt'    => now(),
            ]);

            return response()->json($auditLog, 201);
        } catch (\Illuminate\Validation\ValidationException $e) {
            return response()->json(['errors' => $e->errors()], 422);
        } catch (\Exception $e) {
            Log::error('AuditLogController@store: ' . $e->getMessage());
            return response()->json(['error' => 'Failed to create audit log.'], 500);
        }
    }

    /**
     * GET /api/admin/audit-logs/summary
     * Returns summary statistics for audit logs
     */
    public function summary(Request $request)
    {
        try {
            if (!$this->isAdmin($request)) return response()->json(['message' => 'unauthorized'], 403);

            $query = AuditLog::query();

            if ($request->filled('startDate')) {
                $query->where('createdAt', '>=', $request->startDate);
            }

            if ($request->filled('endDate')) {
                $query->where('createdAt', '<=', $request->endDate);
            }

            $totalStockIn = (clone $query)->where('quantity', '>', 0)->sum('quantity');
            $totalStockOut = (clone $query)->where('quantity', '<', 0)->sum('quantity');
            $totalSales = (clone $query)->where('reason', 'sale')->count();
            $totalRestocks = (clone $query)->where('reason', 'restock')->count();

            return response()->json([
                'totalStockIn' => abs($totalStockIn),
                'totalStockOut' => abs($totalStockOut),
                'totalSales' => $totalSales,
                'totalRestocks' => $totalRestocks,
            ]);
        } catch (\Exception $e) {
            Log::error('AuditLogController@summary: ' . $e->getMessage());
            return response()->json(['error' => 'Failed to fetch audit log summary.'], 500);
        }
    }
}
