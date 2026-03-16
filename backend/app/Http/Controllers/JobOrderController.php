<?php

namespace App\Http\Controllers;

use App\Models\JobOrder;
use App\Models\Order;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

class JobOrderController extends Controller
{
    /**
     * GET /api/admin/job-orders
     * Returns all job orders with optional filters
     */
    public function index(Request $request)
    {
        try {
            if (!$this->isAdmin($request)) return response()->json(['message' => 'unauthorized'], 403);

            $query = JobOrder::orderBy('targetCompletion', 'asc');

            if ($request->filled('status')) {
                $query->where('joStatus', $request->status);
            }

            if ($request->filled('isRush')) {
                $query->where('isRush', $request->boolean('isRush'));
            }

            if ($request->filled('orderId')) {
                $query->where('orderId', $request->orderId);
            }

            $jobOrders = $query->get();

            return response()->json($jobOrders);
        } catch (\Exception $e) {
            Log::error('JobOrderController@index: ' . $e->getMessage());
            return response()->json(['error' => 'Failed to fetch job orders.'], 500);
        }
    }

    /**
     * GET /api/admin/job-orders/{id}
     * Returns a single job order by ID
     */
    public function show(Request $request, $id)
    {
        try {
            if (!$this->isAdmin($request)) return response()->json(['message' => 'unauthorized'], 403);

            $jobOrder = JobOrder::find($id);

            if (!$jobOrder) {
                return response()->json(['error' => 'Job order not found.'], 404);
            }

            return response()->json($jobOrder);
        } catch (\Exception $e) {
            Log::error('JobOrderController@show: ' . $e->getMessage());
            return response()->json(['error' => 'Failed to fetch job order.'], 500);
        }
    }

    /**
     * POST /api/admin/job-orders
     * Creates a new job order
     */
    public function store(Request $request)
    {
        try {
            if (!$this->isAdmin($request)) return response()->json(['message' => 'unauthorized'], 403);

            $validated = $request->validate([
                'orderId'          => 'required|string|exists:orders,_id',
                'product'          => 'required|array',
                'product.name'     => 'required|string',
                'product.variant'  => 'nullable|string',
                'product.quantity' => 'required|integer|min:1',
                'targetCompletion' => 'required|date',
                'isRush'           => 'boolean',
                'assignedTo'       => 'nullable|string',
                'notes'            => 'nullable|string',
            ]);

            // Generate JO ID
            $lastJO = JobOrder::orderBy('joId', 'desc')->first();
            $lastNumber = $lastJO ? intval(substr($lastJO->joId, 4)) : 0;
            $newJoId = 'JOB-' . str_pad($lastNumber + 1, 3, '0', STR_PAD_LEFT);

            $jobOrder = JobOrder::create([
                'joId'             => $newJoId,
                'orderId'          => $validated['orderId'],
                'product'          => $validated['product'],
                'targetCompletion' => $validated['targetCompletion'],
                'isRush'           => $validated['isRush'] ?? false,
                'joStatus'         => 'Queued',
                'assignedTo'       => $validated['assignedTo'] ?? null,
                'notes'            => $validated['notes'] ?? '',
                'createdAt'        => now(),
                'updatedAt'        => now(),
            ]);

            // Update order with JO ID and status
            Order::where('_id', $validated['orderId'])->update([
                'joId' => $newJoId,
                'joStatus' => 'Queued',
                'orderStatus' => 'In Production',
                'updatedAt' => now(),
            ]);

            return response()->json($jobOrder, 201);
        } catch (\Illuminate\Validation\ValidationException $e) {
            return response()->json(['errors' => $e->errors()], 422);
        } catch (\Exception $e) {
            Log::error('JobOrderController@store: ' . $e->getMessage());
            return response()->json(['error' => 'Failed to create job order.'], 500);
        }
    }

    /**
     * PUT /api/admin/job-orders/{id}
     * Updates a job order status
     */
    public function update(Request $request, $id)
    {
        try {
            if (!$this->isAdmin($request)) return response()->json(['message' => 'unauthorized'], 403);

            $jobOrder = JobOrder::find($id);

            if (!$jobOrder) {
                return response()->json(['error' => 'Job order not found.'], 404);
            }

            $validated = $request->validate([
                'joStatus'       => 'sometimes|in:Queued,In Progress,Completed',
                'targetCompletion' => 'sometimes|date',
                'isRush'         => 'sometimes|boolean',
                'assignedTo'     => 'nullable|string',
                'notes'          => 'nullable|string',
            ]);

            $jobOrder->update($validated);
            $jobOrder->updatedAt = now();
            $jobOrder->save();

            // If JO is completed, update order status
            if (isset($validated['joStatus']) && $validated['joStatus'] === 'Completed') {
                Order::where('_id', $jobOrder->orderId)->update([
                    'joStatus' => 'Completed',
                    'orderStatus' => 'For Delivery',
                    'updatedAt' => now(),
                ]);
            }

            return response()->json($jobOrder);
        } catch (\Illuminate\Validation\ValidationException $e) {
            return response()->json(['errors' => $e->errors()], 422);
        } catch (\Exception $e) {
            Log::error('JobOrderController@update: ' . $e->getMessage());
            return response()->json(['error' => 'Failed to update job order.'], 500);
        }
    }

    /**
     * GET /api/admin/job-orders/schedule
     * Returns job orders scheduled for a specific date range
     */
    public function schedule(Request $request)
    {
        try {
            if (!$this->isAdmin($request)) return response()->json(['message' => 'unauthorized'], 403);

            $query = JobOrder::where('joStatus', '!=', 'Completed');

            if ($request->filled('startDate')) {
                $query->where('targetCompletion', '>=', $request->startDate);
            }

            if ($request->filled('endDate')) {
                $query->where('targetCompletion', '<=', $request->endDate);
            }

            $jobOrders = $query->orderBy('targetCompletion', 'asc')->get();

            return response()->json($jobOrders);
        } catch (\Exception $e) {
            Log::error('JobOrderController@schedule: ' . $e->getMessage());
            return response()->json(['error' => 'Failed to fetch job order schedule.'], 500);
        }
    }
}
