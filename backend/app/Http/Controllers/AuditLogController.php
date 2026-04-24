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
            if (!$this->isAdmin($request)) {
                return $this->unauthorizedResponse();
            }

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

            $limit = (int) $request->input('limit', 50);
            $limit = max(1, min($limit, 100));

            $auditLogs = $query->limit($limit)->get();

            return $this->successResponse('Audit logs fetched successfully.', $auditLogs);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'Failed to fetch audit logs.');
        }
    }

    public function byInventory(Request $request, $inventoryId)
    {
        try {
            if (!$this->isAdmin($request)) {
                return $this->unauthorizedResponse();
            }

            $auditLogs = AuditLog::where('inventoryId', $inventoryId)
                                 ->orderBy('createdAt', 'desc')
                                 ->get();

            return $this->successResponse('Audit logs fetched successfully.', $auditLogs);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'Failed to fetch audit logs.');
        }
    }

    public function store(Request $request)
    {
        try {
            if (!$this->isAdmin($request)) {
                return $this->unauthorizedResponse();
            }

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
                'remarks'      => isset($validated['remarks'])
                    ? htmlspecialchars(strip_tags(trim($validated['remarks'])), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8')
                    : '',
                'performedBy'  => $validated['performedBy'] ?? null,
                'createdAt'    => now(),
            ]);

            return $this->successResponse('Audit log created successfully.', $auditLog, 201);
        } catch (\Illuminate\Validation\ValidationException $e) {
            return $this->validationErrorResponse($e);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'Failed to create audit log.');
        }
    }

    public function summary(Request $request)
    {
        try {
            if (!$this->isAdmin($request)) {
                return $this->unauthorizedResponse();
            }

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

            return $this->successResponse('Audit log summary fetched successfully.', [
                'totalStockIn' => abs($totalStockIn),
                'totalStockOut' => abs($totalStockOut),
                'totalSales' => $totalSales,
                'totalRestocks' => $totalRestocks,
            ]);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'Failed to fetch audit log summary.');
        }
    }
}
