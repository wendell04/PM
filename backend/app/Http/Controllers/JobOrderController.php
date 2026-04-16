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
            if (!$this->isAdmin($request)) {
                return $this->unauthorizedResponse();
            }

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

            return $this->successResponse('Job orders fetched successfully.', $jobOrders);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'Failed to fetch job orders.');
        }
    }

    public function show(Request $request, $id)
    {
        try {
            if (!$this->isAdmin($request)) {
                return $this->unauthorizedResponse();
            }

            $jobOrder = JobOrder::find($id);

            if (!$jobOrder) {
                return $this->notFoundResponse('Job order');
            }

            return $this->successResponse('Job order fetched successfully.', $jobOrder);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'Failed to fetch job order.');
        }
    }

    public function store(Request $request)
    {
        try {
            if (!$this->isAdmin($request)) {
                return $this->unauthorizedResponse();
            }

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

            return $this->successResponse('Job order created successfully.', $jobOrder, 201);
        } catch (\Illuminate\Validation\ValidationException $e) {
            return $this->validationErrorResponse($e);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'Failed to create job order.');
        }
    }

    public function update(Request $request, $id)
    {
        try {
            if (!$this->isAdmin($request)) {
                return $this->unauthorizedResponse();
            }

            $jobOrder = JobOrder::find($id);

            if (!$jobOrder) {
                return $this->notFoundResponse('Job order');
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

            // If JO is completed, update linked Order — only if not already For Delivery
            if (isset($validated['joStatus']) && $validated['joStatus'] === 'Completed') {
                $linkedOrder = Order::where('_id', $jobOrder->orderId)->first();
                if ($linkedOrder && $linkedOrder->orderStatus !== 'For Delivery') {
                    $linkedOrder->joStatus     = 'Completed';
                    $linkedOrder->orderStatus  = 'For Delivery';
                    $linkedOrder->updatedAt    = now();
                    $linkedOrder->save();
                } elseif ($linkedOrder) {
                    // Order already at For Delivery — only sync joStatus field, no orderStatus overwrite
                    $linkedOrder->joStatus  = 'Completed';
                    $linkedOrder->updatedAt = now();
                    $linkedOrder->save();
                }
            }

            return $this->successResponse('Job order updated successfully.', $jobOrder);
        } catch (\Illuminate\Validation\ValidationException $e) {
            return $this->validationErrorResponse($e);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'Failed to update job order.');
        }
    }

    public function schedule(Request $request)
    {
        try {
            if (!$this->isAdmin($request)) {
                return $this->unauthorizedResponse();
            }

            $query = JobOrder::where('joStatus', '!=', 'Completed');

            if ($request->filled('startDate')) {
                $query->where('targetCompletion', '>=', $request->startDate);
            }

            if ($request->filled('endDate')) {
                $query->where('targetCompletion', '<=', $request->endDate);
            }

            $jobOrders = $query->orderBy('targetCompletion', 'asc')->get();

            return $this->successResponse('Job order schedule fetched successfully.', $jobOrders);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'Failed to fetch job order schedule.');
        }
    }
}
