<?php

namespace App\Http\Controllers;

use App\Models\JobOrder;
use App\Models\Order;
use App\Models\Product;
use App\Models\BillOfMaterial;
use App\Models\Inventory;
use App\Support\OrderStatus;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

class JobOrderController extends Controller
{
    /**
     * Resolve a product+variant's BOM into a flat material list for the given quantity.
     * Display-only snapshot stored on the JO (no inventory change). Returns [] if no BOM.
     */
    private function computeBomSnapshot($productId, $variantId, int $qty): array
    {
        if (!$productId) return [];
        $prod = Product::find($productId);
        if (!$prod) return [];

        $bom = null;
        if (!empty($prod->bomGroupName) && $variantId) {
            $bom = BillOfMaterial::find($variantId);
        } elseif (!empty($prod->bomId)) {
            $bom = BillOfMaterial::find($prod->bomId);
        }
        if (!$bom && $variantId && !empty($prod->combinations)) {
            foreach ($prod->combinations as $combo) {
                if ((string) ($combo['id'] ?? $combo['_id'] ?? '') === (string) $variantId && !empty($combo['bomId'])) {
                    $bom = BillOfMaterial::find($combo['bomId']);
                    break;
                }
            }
        }
        if (!$bom || empty($bom->components)) return [];

        $snapshot = [];
        foreach ($bom->components as $c) {
            $invId = $c['inventoryId'] ?? null;
            $inv   = $invId ? Inventory::find($invId) : null;
            $per   = (float) ($c['qty'] ?? 0);
            $snapshot[] = [
                'inventoryId' => $invId ? (string) $invId : null,
                'name'        => $inv->name ?? ($c['name'] ?? 'Material'),
                'unit'        => $inv->uom ?? ($c['unit'] ?? ''),
                'qtyPerUnit'  => $per,
                'totalQty'    => $per * max(1, $qty),
            ];
        }
        return $snapshot;
    }

    /**
     * GET /api/admin/job-orders
     * Returns all job orders with optional filters
     */
    public function index(Request $request)
    {
        try {
            if (!$this->hasAnyPermission($request, ['jobOrders', 'production'])) {
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
            if (!$this->hasAnyPermission($request, ['jobOrders', 'production'])) {
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
            if (!$this->hasAnyPermission($request, ['jobOrders', 'production'])) {
                return $this->unauthorizedResponse();
            }

            $validated = $request->validate([
                'orderId'          => 'required|string|exists:orders,_id',
                'product'          => 'required|array',
                'product.name'     => 'required|string',
                'product.variant'  => 'nullable|string',
                'product.quantity' => 'required|integer|min:1',
                'product.productId'=> 'nullable|string',
                'product.variantId'=> 'nullable|string',
                'targetCompletion' => 'required|date',
                'isRush'           => 'boolean',
                'assignedTo'       => 'nullable|string',
                'notes'            => 'nullable|string',
            ]);

            // Generate JO ID
            $lastJO = JobOrder::orderBy('joId', 'desc')->first();
            $lastNumber = $lastJO ? intval(substr($lastJO->joId, 4)) : 0;
            $newJoId = 'JOB-' . str_pad($lastNumber + 1, 3, '0', STR_PAD_LEFT);

            // Pull design context from the linked order so the printer operator can see it
            $linkedOrder = Order::find($validated['orderId']);

            if (!$linkedOrder) {
                return $this->errorResponse('Linked order not found.', 404);
            }

            // Gate 1 — payment: a downpayment (or COD) is required before production. Mirrors the
            // gate in OrderController@updateStatus so creating a JO can't bypass it.
            $payMethod  = strtolower((string) ($linkedOrder->paymentMethod ?? ''));
            $hasPayment = ($linkedOrder->downPayment ?? 0) > 0
                || count($linkedOrder->paymentHistory ?? []) > 0
                || in_array($linkedOrder->paymentStatus ?? '', ['partial', 'paid'], true);
            if ($payMethod !== 'cod' && !$hasPayment) {
                return $this->errorResponse('A downpayment is required before this order can go into production.', 422);
            }

            // Gate 2 — design: a custom order must have an approved design before production.
            if (($linkedOrder->isCustomOrder ?? false) && ($linkedOrder->designStatus ?? null) !== 'approved') {
                return $this->errorResponse('The customer must approve the design before this order can go into production.', 422);
            }

            $jobOrder = JobOrder::create([
                'joId'             => $newJoId,
                'orderId'          => $validated['orderId'],
                'product'          => $validated['product'],
                'targetCompletion' => $validated['targetCompletion'],
                'isRush'           => $validated['isRush'] ?? false,
                'joStatus'         => 'Queued',
                'assignedTo'       => $validated['assignedTo'] ?? null,
                'notes'            => htmlspecialchars(strip_tags(trim($validated['notes'] ?? '')), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'),
                'designNotes'      => $linkedOrder?->designNotes ?? null,
                'designFilePath'   => $linkedOrder?->designFilePath ?? null,
                'adminComment'     => $linkedOrder?->adminComment ?? null,
                'createdAt'        => now(),
                'updatedAt'        => now(),
            ]);

            // Snapshot the product's BOM raw materials onto the JO so Production/QC can see what it
            // needs to make (e.g. DTF film, white mug, mug box). Display only — no stock change here.
            $snap = $this->computeBomSnapshot(
                $validated['product']['productId'] ?? null,
                $validated['product']['variantId'] ?? null,
                (int) ($validated['product']['quantity'] ?? 1)
            );
            $jobOrder->bomSnapshot = $snap;
            // Per-unit components that QC will consume on pass (submitQC multiplies by the JO quantity,
            // releasing the reservation made at order time).
            $jobOrder->materialsConsumed = array_values(array_filter(array_map(
                fn ($m) => $m['inventoryId'] ? ['inventoryId' => $m['inventoryId'], 'qty' => $m['qtyPerUnit'], 'name' => $m['name']] : null,
                $snap
            )));
            $jobOrder->save();

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
            if (!$this->hasAnyPermission($request, ['jobOrders', 'production'])) {
                return $this->unauthorizedResponse();
            }

            $jobOrder = JobOrder::find($id);

            if (!$jobOrder) {
                return $this->notFoundResponse('Job order');
            }

            $validated = $request->validate([
                'joStatus'         => 'sometimes|in:Queued,In Progress,QC_Pending,QC_Passed,QC_Failed,Completed,Cancelled',
                'targetCompletion' => 'sometimes|date',
                'isRush'           => 'sometimes|boolean',
                'assignedTo'       => 'nullable|string',
                'notes'            => 'nullable|string',
            ]);

            if (isset($validated['notes'])) {
                $validated['notes'] = htmlspecialchars(strip_tags(trim($validated['notes'])), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
            }

            $jobOrder->update($validated);
            $jobOrder->updatedAt = now();
            $jobOrder->save();

            // JO completed → order is Ready for Delivery (balance + courier gates apply before it can
            // move on to For Delivery). Don't overwrite if it's already past that point.
            if (isset($validated['joStatus']) && $validated['joStatus'] === 'Completed') {
                $linkedOrder = Order::where('_id', $jobOrder->orderId)->first();
                $alreadyPast = $linkedOrder && in_array(OrderStatus::normalize($linkedOrder->orderStatus), [OrderStatus::READY_FOR_DELIVERY, OrderStatus::FOR_DELIVERY, OrderStatus::DELIVERED], true);
                if ($linkedOrder && !$alreadyPast) {
                    $linkedOrder->joStatus     = 'Completed';
                    $linkedOrder->orderStatus  = OrderStatus::READY_FOR_DELIVERY;
                    $linkedOrder->updatedAt    = now();
                    $linkedOrder->save();
                } elseif ($linkedOrder) {
                    // Already at/past Ready for Delivery — only sync joStatus, no orderStatus overwrite.
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

    /**
     * POST /api/admin/job-orders/{id}/qc
     * Submits QC result for a Job Order.
     *
     * On pass: consumes reserved materials, logs to StockHistory, moves order to For Delivery.
     * On fail: keeps reservedQty intact, flags JO for reprint, does NOT deduct inventory.
     */
    public function submitQC(Request $request, string $id)
    {
        try {
            if (!$this->hasAnyPermission($request, ['jobOrders', 'qc'])) {
                return $this->unauthorizedResponse();
            }

            $jobOrder = JobOrder::find($id);

            if (!$jobOrder) {
                return $this->notFoundResponse('Job order');
            }

            if (!in_array($jobOrder->joStatus, ['In Progress', 'QC_Pending', 'QC_Failed'])) {
                return response()->json([
                    'error' => "QC can only be submitted for job orders with status: In Progress, QC_Pending, or QC_Failed. Current status: {$jobOrder->joStatus}",
                ], 422);
            }

            $validated = $request->validate([
                'passed'     => 'required|boolean',
                'defects'    => 'nullable|string|max:1000',
                'checkedBy'  => 'required|string|max:255',
            ]);

            $adminUser   = $request->user();
            $checkedBy   = $validated['checkedBy'];
            $passed      = (bool) $validated['passed'];

            $qcResult = [
                'passed'    => $passed,
                'defects'   => $validated['defects'] ?? null,
                'checkedBy' => $checkedBy,
                'checkedAt' => now()->toISOString(),
            ];

            if ($passed) {
                // ── QC PASSED ──────────────────────────────────────────────────
                // 1. Update JO status
                $jobOrder->joStatus  = 'QC_Passed';
                $jobOrder->qcResult  = $qcResult;
                $jobOrder->updatedAt = now();
                $jobOrder->save();

                // 2. Consume reserved materials from BOM snapshot on this JO
                $materialsConsumed = $jobOrder->materialsConsumed ?? [];
                $joQty = $jobOrder->product['quantity'] ?? 1;

                foreach ($materialsConsumed as $component) {
                    $inventoryId = $component['inventoryId'] ?? null;
                    if (!$inventoryId) continue;

                    $inventory = \App\Models\Inventory::find($inventoryId);
                    if (!$inventory || $inventory->isOnDemand) continue;

                    $consumeQty = (float) ($component['qty'] ?? 0) * (int) $joQty;
                    if ($consumeQty <= 0) continue;

                    // Deduct stockQty and reservedQty, increment consumedQty
                    $inventory->stockQty    = max(0, ($inventory->stockQty    ?? 0) - $consumeQty);
                    $inventory->reservedQty = max(0, ($inventory->reservedQty ?? 0) - $consumeQty);
                    $inventory->consumedQty = ($inventory->consumedQty ?? 0) + $consumeQty;
                    $inventory->save();

                    // Log to StockHistory
                    \App\Models\StockHistory::create([
                        'inventoryId'  => (string) $inventory->_id,
                        'quantity'     => $consumeQty,
                        'remainingQty' => $inventory->stockQty,
                        'unitCost'     => $inventory->averageCost ?? 0,
                        'totalCost'    => ($inventory->averageCost ?? 0) * $consumeQty,
                        'reason'       => 'production',
                        'type'         => 'deduction',
                        'performedBy'  => $checkedBy,
                        'remarks'      => "QC Passed — JO {$jobOrder->joId}",
                        'createdAt'    => now(),
                    ]);
                    try {
                        \App\Models\AuditLog::create([
                            'inventoryId'  => (string) $inventory->_id,
                            'productName'  => $inventory->name ?? 'Unknown',
                            'category'     => $inventory->category ?? 'Uncategorized',
                            'reason'       => 'production',
                            'quantity'     => -(int) $consumeQty,
                            'stockBefore'  => (int) $inventory->stockQty + (int) $consumeQty,
                            'stockAfter'   => (int) $inventory->stockQty,
                            'unitCost'     => (float) ($inventory->averageCost ?? 0),
                            'totalCost'    => (float) (($inventory->averageCost ?? 0) * $consumeQty),
                            'remarks'      => "QC Passed — JO {$jobOrder->joId}",
                            'performedBy'  => $checkedBy,
                            'createdAt'    => now(),
                        ]);
                    } catch (\Exception $auditEx) {
                        Log::warning('AuditLog write failed (JobOrderController@submitQC)', ['error' => $auditEx->getMessage()]);
                    }
                }

                // 3. QC passed → order is Ready for Delivery (packed, awaiting balance + courier).
                //    The balance-before-delivery and courier gates apply when the owner moves it on
                //    to For Delivery (OrderController@adminUpdate) — QC must NOT skip them.
                $linkedOrder = Order::where('_id', $jobOrder->orderId)->first();
                if ($linkedOrder && !in_array(OrderStatus::normalize($linkedOrder->orderStatus), [OrderStatus::READY_FOR_DELIVERY, OrderStatus::FOR_DELIVERY, OrderStatus::DELIVERED, OrderStatus::CANCELLED], true)) {
                    $linkedOrder->orderStatus = OrderStatus::READY_FOR_DELIVERY;
                    $linkedOrder->updatedAt   = now();
                    $linkedOrder->save();
                }

            } else {
                // ── QC FAILED ──────────────────────────────────────────────────
                // reservedQty stays — materials still committed for reprint
                // Do NOT deduct stockQty
                $jobOrder->joStatus  = 'QC_Failed';
                $jobOrder->qcResult  = $qcResult;
                $jobOrder->updatedAt = now();
                $jobOrder->save();

                // Log the failure for audit — no inventory change
                Log::info('submitQC: QC failed, materials remain reserved for reprint', [
                    'jobOrderId' => (string) $jobOrder->_id,
                    'joId'       => $jobOrder->joId,
                    'checkedBy'  => $checkedBy,
                    'defects'    => $validated['defects'] ?? null,
                ]);
            }

            return $this->successResponse(
                $passed ? 'QC passed. Materials consumed; order is Ready for Delivery (collect balance + book courier to dispatch).' : 'QC failed. Order flagged for reprint.',
                $jobOrder
            );

        } catch (\Illuminate\Validation\ValidationException $e) {
            return $this->validationErrorResponse($e);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'Failed to submit QC result.');
        }
    }

    public function schedule(Request $request)
    {
        try {
            if (!$this->hasAnyPermission($request, ['jobOrders', 'production'])) {
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
