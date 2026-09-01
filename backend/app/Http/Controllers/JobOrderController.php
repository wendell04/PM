<?php

namespace App\Http\Controllers;

use App\Models\JobOrder;
use App\Models\Order;
use App\Models\Product;
use App\Models\BillOfMaterial;
use App\Models\Inventory;
use App\Support\OrderStatus;
use App\Models\StockHistory;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
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

            // Serialize defensively: a single legacy job_orders doc with an unparseable date (bad
            // targetCompletion/createdAt) would otherwise throw during casting and 500 the WHOLE list,
            // showing "Failed to fetch job orders" even when there is nothing to build. Repair per-doc
            // instead of failing everyone.
            $jobOrders = [];
            foreach ($query->get() as $jo) {
                try {
                    $row = $jo->toArray();
                } catch (\Throwable $e) {
                    $row = $jo->getAttributes();
                    $row['targetCompletion'] = null;
                    $row['_repaired'] = true;
                }
                // The document id surfaces as 'id' or '_id' depending on the path, and as a raw BSON
                // ObjectId it serialises to {"$oid": "..."} - the client then addresses the job order
                // as "[object Object]" and every write 404s. Expose both keys as plain strings.
                $docId = $row['_id'] ?? $row['id'] ?? $jo->getKey();
                if ($docId !== null) {
                    $row['_id'] = (string) $docId;
                    $row['id']  = (string) $docId;
                }
                $jobOrders[] = $row;
            }

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
                'orderStatus' => OrderStatus::IN_PRODUCTION,
                'updatedAt' => now(),
            ]);
            $this->syncOrderProductionStage($validated['orderId']);

            return $this->successResponse('Job order created successfully.', $jobOrder, 201);
        } catch (\Illuminate\Validation\ValidationException $e) {
            return $this->validationErrorResponse($e);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'Failed to create job order.');
        }
    }

    /**
     * Batch create — one Job Order PER printable item of a mixed order. Each item prints its own
     * artwork with its own recipe/QC, so a 2-custom-item order produces 2 JOs (JOB-001, JOB-002)
     * that share the order's backward-scheduled target date and rush flag. Ready-made items carry
     * no design and are never sent here (fulfilled from stock). The pay/design gates run ONCE.
     */
    public function storeBatch(Request $request)
    {
        try {
            if (!$this->hasAnyPermission($request, ['jobOrders', 'production'])) {
                return $this->unauthorizedResponse();
            }

            $validated = $request->validate([
                'orderId'                 => 'required|string|exists:orders,_id',
                'items'                   => 'required|array|min:1',
                'items.*.itemIndex'       => 'required|integer|min:0',
                'items.*.product'         => 'required|array',
                'items.*.product.name'    => 'required|string',
                'items.*.product.variant' => 'nullable|string',
                'items.*.product.quantity'=> 'required|integer|min:1',
                'items.*.product.productId'=> 'nullable|string',
                'items.*.product.variantId'=> 'nullable|string',
                'items.*.notes'           => 'nullable|string|max:2000',
                'targetCompletion'        => 'required|date',
                'isRush'                  => 'boolean',
                'notes'                   => 'nullable|string',
            ]);

            $linkedOrder = Order::find($validated['orderId']);
            if (!$linkedOrder) {
                return $this->errorResponse('Linked order not found.', 404);
            }

            // Gate 1 — payment (downpayment or COD), mirrors store().
            $payMethod  = strtolower((string) ($linkedOrder->paymentMethod ?? ''));
            $hasPayment = ($linkedOrder->downPayment ?? 0) > 0
                || count($linkedOrder->paymentHistory ?? []) > 0
                || in_array($linkedOrder->paymentStatus ?? '', ['partial', 'paid'], true);
            if ($payMethod !== 'cod' && !$hasPayment) {
                return $this->errorResponse('A downpayment is required before this order can go into production.', 422);
            }

            // Gate 2 — design: custom order must be design-approved (order-level aggregate = approved
            // only when every custom item is approved).
            if (($linkedOrder->isCustomOrder ?? false) && ($linkedOrder->designStatus ?? null) !== 'approved') {
                return $this->errorResponse('The customer must approve the design before this order can go into production.', 422);
            }

            $orderItems = $linkedOrder->items ?? [];
            $notes = htmlspecialchars(strip_tags(trim($validated['notes'] ?? '')), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');

            // Sequential JO ids, incremented locally across the batch.
            $lastJO = JobOrder::orderBy('joId', 'desc')->first();
            $counter = $lastJO ? intval(substr($lastJO->joId, 4)) : 0;

            $created = [];
            foreach ($validated['items'] as $line) {
                $idx  = (int) $line['itemIndex'];
                $item = $orderItems[$idx] ?? [];
                $product = $line['product'];
                // Carry the product image into the snapshot. Without it every screen that wants to show
                // WHICH product a job order is for falls back to the proof - which a grouped design
                // request makes identical across all of them.
                if (empty($product['thumbnail']) && !empty($item['thumbnail'])) {
                    $product['thumbnail'] = $item['thumbnail'];
                }

                // The approved proof for this item. On a GROUPED design request there is no per-item
                // mapping to be had: one send covers several products and every line ends up holding
                // the same first URL. Picking one of them and calling it "the" proof for a mug when it
                // is a picture of a totebag invents a mapping that does not exist - so carry the whole
                // set and let the operator see which one is theirs.
                $proofSet = array_values(array_filter(array_unique(array_merge(
                    (array) ($item['adminDesignUrls'] ?? []),
                    (array) ($linkedOrder->adminDesignUrls ?? []),
                    array_filter([$item['adminDesignUrl'] ?? null]),
                    array_map(fn ($f) => $f['url'] ?? null, (array) ($item['designFiles'] ?? [])),
                    array_filter([$item['designUrl'] ?? null])
                ))));

                $designPath = $item['adminDesignUrl']
                    ?? ($linkedOrder->adminDesignUrls[$idx] ?? null)
                    ?? $item['designUrl']
                    ?? ($item['designFiles'][0]['url'] ?? null)
                    ?? $linkedOrder->designFilePath
                    ?? null;

                $counter++;
                $newJoId = 'JOB-' . str_pad($counter, 3, '0', STR_PAD_LEFT);

                $jobOrder = JobOrder::create([
                    'joId'             => $newJoId,
                    'orderId'          => $validated['orderId'],
                    'itemIndex'        => $idx,
                    'product'          => $product,
                    'targetCompletion' => $validated['targetCompletion'],
                    'isRush'           => $validated['isRush'] ?? false,
                    'joStatus'         => 'Queued',
                    // Per item, falling back to the batch note. One instruction for every job order was
                    // wrong the moment there was more than one: "mirrored, 180C 60s" is the mug's
                    // setting and means nothing to a totebag.
                    'notes'            => isset($line['notes']) && trim((string) $line['notes']) !== ''
                        ? htmlspecialchars(strip_tags(trim((string) $line['notes'])), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8')
                        : $notes,
                    'designNotes'      => $item['designNotes'] ?? $linkedOrder->designNotes ?? null,
                    'designFilePath'   => $designPath,
                    'designFilePaths'  => $proofSet,
                    'adminComment'     => $linkedOrder->adminComment ?? null,
                    'createdAt'        => now(),
                    'updatedAt'        => now(),
                ]);

                $snap = $this->computeBomSnapshot(
                    $product['productId'] ?? null,
                    $product['variantId'] ?? null,
                    (int) ($product['quantity'] ?? 1)
                );
                $jobOrder->bomSnapshot = $snap;
                $jobOrder->materialsConsumed = array_values(array_filter(array_map(
                    fn ($m) => $m['inventoryId'] ? ['inventoryId' => $m['inventoryId'], 'qty' => $m['qtyPerUnit'], 'name' => $m['name']] : null,
                    $snap
                )));
                $jobOrder->save();

                $created[] = $jobOrder;
            }

            // Link every JO id back to the order; keep the single joId field (first) for backward
            // compatibility with screens that read it, and joIds[] for the full set.
            $joIds = array_map(fn ($j) => $j->joId, $created);
            Order::where('_id', $validated['orderId'])->update([
                'joId'        => $joIds[0] ?? null,
                'joIds'       => $joIds,
                'joStatus'    => 'Queued',
                'orderStatus' => OrderStatus::IN_PRODUCTION,
                'updatedAt'   => now(),
            ]);

            $this->syncOrderProductionStage($validated['orderId']);

            return $this->successResponse(count($created) . ' job order(s) created successfully.', $created, 201);
        } catch (\Illuminate\Validation\ValidationException $e) {
            return $this->validationErrorResponse($e);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'Failed to create job orders.');
        }
    }

    /**
     * Aggregate readiness across ALL of an order's job orders. A multi-item order produces one JO per
     * item, so a single JO completing must NOT release the whole order — only when EVERY non-cancelled
     * JO is done (QC-passed / Completed) does the order become Ready for Delivery. Idempotent and
     * self-guarding; safe to call after any JO status change or deletion.
     */
    private function syncOrderReadiness(string $orderId): void
    {
        $order = Order::where('_id', $orderId)->first();
        if (!$order) return;
        // Already at/past ready — never walk it back from here.
        if (in_array(OrderStatus::normalize($order->orderStatus), [OrderStatus::READY_FOR_DELIVERY, OrderStatus::FOR_DELIVERY, OrderStatus::DELIVERED, OrderStatus::CANCELLED], true)) {
            return;
        }
        $jobs = JobOrder::where('orderId', $orderId)->get()->filter(fn ($j) => $j->joStatus !== 'Cancelled');
        if ($jobs->isEmpty()) return;

        $allDone = $jobs->every(fn ($j) => in_array($j->joStatus, ['QC_Passed', 'Completed'], true));
        if (!$allDone) {
            // Partial progress — keep it in production, just reflect that work has started.
            $order->joStatus  = 'In Progress';
            $order->updatedAt = now();
            $order->save();
            return;
        }

        $order->joStatus    = 'Completed';
        $order->orderStatus = OrderStatus::READY_FOR_DELIVERY;
        // When the goods started waiting. Personalised stock cannot be resold, so the shop needs to
        // know how long it has been sitting - that is the whole basis of the holding period.
        if (empty($order->readyAt)) $order->readyAt = now();
        $order->updatedAt   = now();
        $order->save();
        $this->notifyBalanceDue($order);
    }

    /** Balance-due-before-delivery reminder once an order is fully produced (non-COD, unpaid balance). */
    private function notifyBalanceDue(Order $order): void
    {
        $isCOD   = strtolower((string) ($order->paymentMethod ?? '')) === 'cod';
        $balance = $order->balance !== null && $order->balance !== ''
            ? (float) $order->balance
            : max(0, (float) ($order->totalAmount ?? 0) - (float) ($order->downPayment ?? 0));
        if ($isCOD || ($order->paymentStatus ?? '') === 'paid' || $balance <= 0) return;
        try {
            \App\Models\Notification::create([
                'user_id'    => (string) $order->userId,
                'type'       => 'balance_due_before_delivery',
                'title'      => 'Ready Soon - Balance Due',
                'message'    => 'Your order #' . strtoupper(substr((string) $order->_id, -8)) .
                    ' is ready. Please settle the remaining balance of P' . number_format($balance, 2) .
                    ' in My Orders so we can release it for delivery.',
                'is_read'    => false,
                'data'       => ['orderId' => (string) $order->_id, 'balance' => $balance],
                'created_at' => now(),
            ]);
        } catch (\Exception $e) {
            Log::warning('JO complete: balance-due notification failed', ['error' => $e->getMessage()]);
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
                // Which materials the operator has actually taken off the shelf. Persisted because a
                // tick box that forgets the moment you close the panel is worse than no tick box - it
                // looks like a record and is not one.
                'materialsPulled'  => 'sometimes|array',
                'materialsPulled.*'=> 'string|max:200',
                'targetCompletion' => 'sometimes|date',
                'isRush'           => 'sometimes|boolean',
                'assignedTo'       => 'nullable|string',
                'notes'            => 'nullable|string',
            ]);

            if (isset($validated['notes'])) {
                $validated['notes'] = htmlspecialchars(strip_tags(trim($validated['notes'])), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
            }

            // A job being cancelled stops needing its materials. Release BEFORE the write, while the
            // old status still says whether anything was consumed - afterwards there is no way to tell
            // a cancelled-from-queued job from a cancelled-after-QC one.
            $released = 0;
            if (($validated['joStatus'] ?? null) === 'Cancelled' && $jobOrder->joStatus !== 'Cancelled') {
                $released = $this->releaseJobOrderMaterials($jobOrder, "Job order {$jobOrder->joId} cancelled");
                $validated['cancelledAt'] = now();
            }

            $jobOrder->update($validated);
            $jobOrder->updatedAt = now();
            $jobOrder->save();

            // Re-aggregate the order across ALL its job orders: it only becomes Ready for Delivery when
            // every item's JO is done (balance + courier gates still apply before For Delivery).
            if (isset($validated['joStatus'])) {
                $this->syncOrderReadiness((string) $jobOrder->orderId);
                // Readiness only fires when EVERY job has passed. Until then the order still needs its
                // stage kept in step, or the customer's tracker sits on Production through all of QC.
                $this->syncOrderProductionStage($jobOrder->orderId ?? null);
            }

            // The order's own stage follows its jobs, so recompute it whenever one of them moves.
            if (isset($validated['joStatus'])) {
                $this->syncOrderProductionStage($jobOrder->orderId ?? null);
            }

            return $this->successResponse(
                $released > 0
                    ? "Job order cancelled. {$released} reserved unit(s) returned to stock."
                    : 'Job order updated successfully.',
                $jobOrder
            );
        } catch (\Illuminate\Validation\ValidationException $e) {
            return $this->validationErrorResponse($e);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'Failed to update job order.');
        }
    }

    /**
     * DELETE /api/admin/job-orders/{id}
     * Hard-delete a job order. GUARDED to test/junk cleanup: only a JO that has produced nothing
     * (still 'Queued', or already 'Cancelled') may be deleted — anything In Progress / QC-passed /
     * Completed has consumed materials or has QC history and must be CANCELLED (soft) instead, so the
     * audit trail and inventory stay intact. On delete the linked order is relinked (the joId is
     * pulled from its joIds); if no job orders remain, the order drops back to Processing so it can be
     * re-scheduled into production.
     */
    public function destroy(Request $request, $id)
    {
        try {
            if (!$this->hasAnyPermission($request, ['jobOrders', 'production'])) {
                return $this->unauthorizedResponse();
            }

            $jobOrder = JobOrder::find($id);
            if (!$jobOrder) {
                return $this->notFoundResponse('Job order');
            }

            if (!in_array($jobOrder->joStatus, ['Queued', 'Cancelled'], true)) {
                return $this->errorResponse('Only a Queued or Cancelled job order can be deleted. This one has started production - cancel it instead to keep its history.', 422);
            }

            $orderId = (string) $jobOrder->orderId;
            $deletedJoId = $jobOrder->joId;

            // Deleting a job order changes how an order gets fulfilled, so it must leave a trace even
            // though nothing was produced. Untraceable cleanups are how a collection ends up with
            // records nobody can account for.
            try {
                $actor = $request->user();
                \App\Models\ActivityLog::create([
                    'action'           => 'job_order_deleted',
                    'entityType'       => 'job_order',
                    'entityId'         => (string) $jobOrder->_id,
                    'description'      => "Job order {$deletedJoId} deleted while {$jobOrder->joStatus}"
                        . " (order " . strtoupper(substr($orderId, -8)) . ", "
                        . ($jobOrder->product['name'] ?? 'unknown product') . ")",
                    'performedBy'      => $actor ? trim("{$actor->firstName} {$actor->lastName}") : 'admin',
                    'performedByEmail' => $actor->email ?? null,
                    'createdAt'        => now(),
                ]);
            } catch (\Exception $logEx) {
                Log::warning('ActivityLog write failed (JobOrderController@destroy)', ['error' => $logEx->getMessage()]);
            }

            // A queued job order still holds its materials; deleting the record must not orphan the hold.
            // Nothing to give back on one that was already cancelled - that released them on the way in.
            $released = $jobOrder->joStatus === 'Cancelled'
                ? 0
                : $this->releaseJobOrderMaterials($jobOrder, "Job order {$jobOrder->joId} deleted");

            $jobOrder->delete();

            // Relink the order: pull this JO from the set; revert to Processing when none remain.
            $order = Order::where('_id', $orderId)->first();
            if ($order) {
                $remaining = JobOrder::where('orderId', $orderId)->get();
                $joIds = $remaining->map(fn ($j) => $j->joId)->values()->all();
                if (empty($joIds)) {
                    $order->joId        = null;
                    $order->joIds       = [];
                    $order->joStatus    = null;
                    if (OrderStatus::normalize($order->orderStatus) === OrderStatus::IN_PRODUCTION) {
                        $order->orderStatus = OrderStatus::PROCESSING;
                    }
                } else {
                    $order->joId  = $joIds[0];
                    $order->joIds = $joIds;
                }
                $order->updatedAt = now();
                $order->save();
            }

            return $this->successResponse("Job order {$deletedJoId} deleted.", ['id' => $id]);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'Failed to delete job order.');
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

            // Every movement below belongs to a real customer order. Without these the rows landed in
            // "Manual / Adjustments" forever, "Orders with deductions" stayed 0, and total cost of
            // goods read P0.00 - so the cost of a sale could never be tied back to the sale.
            $srcOrder    = $jobOrder->orderId ? Order::find($jobOrder->orderId) : null;
            $attribution = [
                'orderId'      => $jobOrder->orderId ? (string) $jobOrder->orderId : null,
                // The order carries the buyer in `userSnapshot`, taken at checkout - not in a
                // customerName column, which is why the first attempt wrote NULL.
                'customerName' => $srcOrder->userSnapshot['name']
                    ?? ($srcOrder->customerName ?? null),
                'productId'    => $jobOrder->product['productId'] ?? null,
                'productName'  => $jobOrder->product['productName'] ?? ($jobOrder->product['name'] ?? null),
            ];

            $ordered  = (int) ($jobOrder->product['quantity'] ?? 1);
            $doneSoFar = (int) ($jobOrder->acceptedQty ?? 0);
            $remaining = max(0, $ordered - $doneSoFar);

            $validated = $request->validate([
                // A batch is rarely all-or-nothing. Nine good mugs and one cracked one is the normal
                // case, and forcing it into pass/fail either ships a defect or sends nine good units
                // back through production.
                'accepted'    => 'required|integer|min:0|max:' . max(0, $remaining),
                'rejected'    => 'required|integer|min:0|max:' . max(0, $remaining),
                // What happens to the rejects decides what happens to the material, so it cannot be
                // inferred: rework re-runs the same units and the material stays committed; scrap
                // destroys it and the job has to pull replacements.
                'disposition' => 'required_if:rejected,>0|nullable|in:rework,scrap',
                // Which components were actually destroyed. A misprinted mug loses the blank and the
                // transfer paper, but the gift box was never opened - writing off the whole recipe
                // charges the owner for packaging that is still on the shelf. Omitted means all.
                'materials'   => 'nullable|array',
                'materials.*' => 'string|max:32',
                'defects'     => 'nullable|string|max:1000',
                'checkedBy'   => 'required|string|max:255',
            ], [
                'accepted.max' => "Only {$remaining} unit(s) are still outstanding on this job.",
                'rejected.max' => "Only {$remaining} unit(s) are still outstanding on this job.",
            ]);

            $accepted = (int) $validated['accepted'];
            $rejected = (int) $validated['rejected'];

            if ($accepted + $rejected === 0) {
                return $this->errorResponse('Enter how many passed and how many were rejected.', 422);
            }
            // The whole batch reaches QC together, so a half-counted inspection is a slip. The UI
            // blocks it, but the UI is not the authority - an 8-of-10 submission would silently leave
            // 2 units in limbo, neither shipped nor remade.
            if ($accepted + $rejected !== $remaining) {
                return $this->errorResponse(
                    "Account for all {$remaining} outstanding unit(s): {$accepted} passed and {$rejected} rejected leaves "
                    . ($remaining - $accepted - $rejected) . " unrecorded.", 422);
            }
            if ($accepted + $rejected > $remaining) {
                return $this->errorResponse("That is more than the {$remaining} unit(s) still outstanding.", 422);
            }
            if ($rejected > 0 && empty($validated['disposition'])) {
                return $this->errorResponse('Say whether the rejects are being reworked or scrapped.', 422);
            }
            if ($rejected > 0 && ($validated['defects'] ?? '') === '') {
                return $this->errorResponse('Describe the defect - a count on its own cannot be acted on.', 422);
            }

            // The old shape sent `passed: true|false`. Nothing calls it that way any more, but the
            // variable below still drives the branch, so derive it from the split.
            $passed = ($doneSoFar + $accepted) >= $ordered;

            $adminUser   = $request->user();
            $checkedBy   = $validated['checkedBy'];

            $qcResult = [
                'passed'      => $passed,
                'accepted'    => $accepted,
                'rejected'    => $rejected,
                'disposition' => $rejected > 0 ? $validated['disposition'] : null,
                'defects'     => $validated['defects'] ?? null,
                'checkedBy'   => $checkedBy,
                'checkedAt'   => now()->toISOString(),
            ];

            // Every inspection is kept, not just the last one. A job that failed twice before passing
            // is a different story from one that passed first time, and only the log tells them apart.
            $history   = $jobOrder->qcHistory ?? [];
            $history[] = $qcResult;
            $jobOrder->qcHistory  = $history;
            $jobOrder->acceptedQty = $doneSoFar + $accepted;

            // Scrapped rejects are gone: stock drops now. The reservation is deliberately left alone,
            // because the job still owes those units and will pull replacement material to make them.
            // Rework touches nothing - the same material is being re-run.
            if ($rejected > 0 && $validated['disposition'] === 'scrap') {
                // Null means the whole recipe was lost; a list scopes the write-off to what the
                // inspector actually threw away.
                $lost = $validated['materials'] ?? null;

                foreach (($jobOrder->bomSnapshot['components'] ?? $jobOrder->bomSnapshot ?? []) as $c) {
                    $inv = Inventory::find($c['inventoryId'] ?? null);
                    if (!$inv || ($inv->isOnDemand ?? false)) continue;
                    if (is_array($lost) && !in_array((string) ($c['inventoryId'] ?? ''), $lost, true)) continue;

                    // The snapshot stores qtyPerUnit. Reading 'qty' returned 0 for every component,
                    // so $take was 0, every iteration hit the continue below, and QC scrap silently
                    // wrote off nothing at all - the stock never moved and no history was written.
                    $per = (float) ($c['qtyPerUnit'] ?? $c['qty'] ?? 0);
                    $take = (int) round($per * $rejected);
                    if ($take <= 0) continue;

                    $lineCost = $this->drawFromBatches($inv, $take);
                    $inv->stockQty = max(0, (int) ($inv->stockQty ?? 0) - $take);
                    $inv->save();
                    try {
                        StockHistory::create([
                            'inventoryId'  => (string) $inv->_id,
                            'quantity'     => -$take,
                            'remainingQty' => (int) ($inv->stockQty ?? 0),
                            // From the batches actually drawn, not a headline average - scrap is
                            // charged at what the scrapped units really cost.
                            'unitCost'     => $take > 0 ? round($lineCost / $take, 4) : 0,
                            'totalCost'    => round($lineCost, 2),
                            'reason'       => 'qc_scrap',
                            ...$attribution,
                            // Stock Out History filters on type='deduction' and reads the note from
                            // 'remarks'. Without these the write-off happened but never appeared on
                            // the screen the owner checks, so scrapped material vanished silently.
                            'type'         => 'deduction',
                            'reference'    => $jobOrder->joId,
                            'performedBy'  => $checkedBy,
                            'remarks'      => 'QC scrap - JO ' . $jobOrder->joId . ': ' . ($validated['defects'] ?? 'no detail'),
                            'createdAt'    => now(),
                        ]);
                    } catch (\Throwable $e) {
                        Log::warning('submitQC: scrap history failed', ['error' => $e->getMessage()]);
                    }
                }
            }

            // Material is consumed when units are ACCEPTED, not when the job finally finishes.
            // This lived inside the `if ($passed)` branch below, so a partial inspection - 9 good
            // and 1 scrapped out of 10 - consumed nothing, and the later pass on the remade unit
            // consumed only that one. Nine mugs stayed on the books as stock that no longer existed
            // and stayed reserved forever.
            if ($accepted > 0) {
                    $materialsConsumed = $jobOrder->materialsConsumed ?? [];
                    // Consume for the units accepted in THIS inspection. Consuming the whole job would
                    // double-count anything already accepted in an earlier partial pass.
                    $joQty = $accepted;

                    foreach ($materialsConsumed as $component) {
                        $inventoryId = $component['inventoryId'] ?? null;
                        if (!$inventoryId) continue;

                        $inventory = \App\Models\Inventory::find($inventoryId);
                        if (!$inventory || $inventory->isOnDemand) continue;

                        $consumeQty = (float) ($component['qty'] ?? 0) * (int) $joQty;
                        if ($consumeQty <= 0) continue;

                        // Deduct stockQty and reservedQty, increment consumedQty
                        $lineCost = $this->drawFromBatches($inventory, (int) round($consumeQty));
                        $inventory->stockQty    = max(0, ($inventory->stockQty    ?? 0) - $consumeQty);
                        $inventory->reservedQty = max(0, ($inventory->reservedQty ?? 0) - $consumeQty);
                        $inventory->consumedQty = ($inventory->consumedQty ?? 0) + $consumeQty;
                        $inventory->save();

                        // Log to StockHistory
                        \App\Models\StockHistory::create([
                            'inventoryId'  => (string) $inventory->_id,
                            'quantity'     => $consumeQty,
                            'remainingQty' => $inventory->stockQty,
                            'unitCost'     => $consumeQty > 0 ? round($lineCost / $consumeQty, 4) : 0,
                            'totalCost'    => round($lineCost, 2),
                            'reason'       => 'production',
                            'type'         => 'deduction',
                            ...$attribution,
                            'performedBy'  => $checkedBy,
                            'remarks'      => "QC Passed - JO {$jobOrder->joId}",
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
                                'unitCost'     => $this->unitCostOf($inventory),
                                'totalCost'    => (float) ($this->unitCostOf($inventory) * $consumeQty),
                                'remarks'      => "QC Passed - JO {$jobOrder->joId}",
                                'performedBy'  => $checkedBy,
                                'createdAt'    => now(),
                            ]);
                        } catch (\Exception $auditEx) {
                            Log::warning('AuditLog write failed (JobOrderController@submitQC)', ['error' => $auditEx->getMessage()]);
                        }
                    }
            }

            if ($passed) {
                // ── QC PASSED ──────────────────────────────────────────────────
                // 1. Update JO status
                $jobOrder->joStatus  = 'QC_Passed';
                $jobOrder->qcResult  = $qcResult;
                $jobOrder->updatedAt = now();
                $jobOrder->save();


                // 3. QC passed → re-aggregate: the order is Ready for Delivery only when EVERY item's JO
                //    has passed (a mixed order has one JO per item). The balance-before-delivery and
                //    courier gates still apply when the owner moves it on to For Delivery.
                $this->syncOrderReadiness((string) $jobOrder->orderId);
                // Readiness only fires when EVERY job has passed. Until then the order still needs its
                // stage kept in step, or the customer's tracker sits on Production through all of QC.
                $this->syncOrderProductionStage($jobOrder->orderId ?? null);

            } else {
                // ── QC FAILED ──────────────────────────────────────────────────
                // reservedQty stays — materials still committed for reprint
                // Do NOT deduct stockQty
                // Partly good is not the same as failed. If some units were accepted, the job is not
                // in a rework loop - it simply still owes the balance, so it goes back to production
                // rather than being flagged as a QC failure nobody has looked at.
                $jobOrder->joStatus  = $accepted > 0 ? 'In Progress' : 'QC_Failed';
                $jobOrder->qcResult  = $qcResult;
                // The pull list belongs to the run that just ended. Left ticked, the remake opens with
                // every material already crossed off, so the one mug that still has to be fetched
                // looks like it is already on the bench.
                $jobOrder->materialsPulled = [];
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





    /**
     * Move the ORDER's stage to match its job orders.
     *
     * The customer's tracker has a QC step that never lit up, because nothing moved the order out of
     * In Production - it jumped straight to Ready for Delivery once every job passed. So a customer
     * watching their order saw it sit on "Production" through the whole of QC.
     *
     * An order is only as far along as its LEAST advanced item: one job at QC and another still on the
     * bench means the order is still in production, because it cannot ship until both are done.
     * Promoting on the furthest-ahead job would promise progress the order has not made.
     *
     * Deliberately does not touch anything at or past Ready for Delivery - `syncOrderReadiness` owns
     * that transition, and a delivered order must not be dragged backwards.
     */
    private function syncOrderProductionStage(?string $orderId): void
    {
        if (!$orderId) return;

        try {
            $order = Order::find($orderId);
            if (!$order) return;

            $jobs = JobOrder::where('orderId', $orderId)->get()
                ->filter(fn ($j) => $j->joStatus !== 'Cancelled');
            if ($jobs->isEmpty()) return;

            // The per-job list is refreshed for EVERY status, not only inside the production window.
            // It used to sit below the early return, so on the final pass `syncOrderReadiness` set the
            // order to Ready for Delivery, this returned immediately, and the customer was left with a
            // Ready order whose Production card still said the last job was In Progress.
            $inProductionWindow = in_array($order->orderStatus, [
                OrderStatus::PROCESSING, OrderStatus::IN_PRODUCTION, OrderStatus::FOR_QC,
                'Processing', 'In Production', 'For QC',
            ], true);

            // Anything still being worked on holds the whole order back.
            $stillMaking = $jobs->contains(fn ($j) => in_array($j->joStatus, ['Queued', 'In Progress', 'QC_Failed'], true));
            $stage = $stillMaking ? OrderStatus::IN_PRODUCTION : OrderStatus::FOR_QC;

            // A single dot cannot say "one at QC, one still on the bench", and lighting two dots at once
            // would stop the stepper meaning "you are here". So the dot keeps the order's true stage
            // and this counter feeds a line beside it. Stored on the order because the customer's
            // orders endpoint never carries job orders, and it should not have to.
            // The order kept only a scalar joId (and joIds, which carries no status), so a 2-item order
            // showed the customer JOB-001 and nothing else. One JO per printable item is the whole
            // point of the batch creator, so the order has to carry all of them, with their stage.
            $order->productionJobs = $jobs->map(fn ($j) => [
                'joId'             => $j->joId,
                'joStatus'         => $j->joStatus,
                'targetCompletion' => $j->targetCompletion,
                'label'            => $j->product['productName'] ?? ($j->product['name'] ?? null),
                'variant'          => $j->product['variantName'] ?? null,
                'quantity'         => $j->product['quantity'] ?? null,
            ])->values()->all();

            // Only the STAGE is gated. Past Ready for Delivery `syncOrderReadiness` owns the status
            // and a delivered order must never be dragged backwards.
            if ($inProductionWindow && $order->orderStatus !== $stage) {
                $order->orderStatus = $stage;
                $history = $order->statusHistory ?? [];
                $history[] = ['status' => $stage, 'at' => now()->toISOString()];
                $order->statusHistory = $history;
                $order->updatedAt = now();
            }

            $order->save();

            if ($order->wasChanged('orderStatus')) {
                try { broadcast(new \App\Events\OrderStatusUpdated((string) $order->_id, $stage, null)); } catch (\Throwable) {}
            }
        } catch (\Throwable $e) {
            Log::warning('syncOrderProductionStage failed', ['orderId' => $orderId, 'error' => $e->getMessage()]);
        }
    }


    /**
     * What one unit of this material actually costs.
     *
     * Every stock write here read `averageCost` alone, which is NULL on this data - the real figure
     * lives in lastUnitCost / baseCost / the FIFO batch. So every movement was logged at P0.00 and
     * the cost of goods came out as zero, which makes profit and margin fiction.
     * Same fallback order the BOM screens already use, plus the batch as a last resort.
     */
    /**
     * Draw qty out of the batch ledger, oldest batch first, and return what it actually cost.
     *
     * Every stock write in this controller moved stockQty alone and never touched batches, so the two
     * drifted apart with each QC pass. Master Data sums batch remainingQty, Product Stock reads
     * stockQty, and the same material read 50 on one screen and 30 on the other. Worse than the
     * mismatch: the low-stock and out-of-stock counters read the inflated number so they stopped
     * warning, and FIFO costing kept pricing sales from batches that were physically empty.
     *
     * Does not save - the caller does, so one write carries both the batch and the stockQty change.
     */
    private function drawFromBatches($inv, int $qty): float
    {
        $qty = max(0, $qty);
        if ($qty <= 0) return 0.0;

        $batches = $inv->batches ?? [];
        if (!is_array($batches) || !count($batches)) {
            return $this->unitCostOf($inv) * $qty;
        }

        usort($batches, fn ($x, $y) => strtotime($x['dateReceived'] ?? '0') <=> strtotime($y['dateReceived'] ?? '0'));

        $left = $qty;
        $cost = 0.0;
        foreach ($batches as &$batch) {
            if ($left <= 0) break;
            $have = (int) ($batch['remainingQty'] ?? $batch['goodQty'] ?? 0);
            if ($have <= 0) continue;
            $take = min($have, $left);
            $batch['remainingQty'] = $have - $take;
            $cost += $take * (float) ($batch['unitCost'] ?? 0);
            $left -= $take;
        }
        unset($batch);

        $inv->batches = $batches;

        // Whatever the ledger could not cover still left the shelf. Pricing it at the item's own cost
        // is a guess, but recording it free is a lie, and free is what Reports would believe.
        if ($left > 0) {
            $cost += $left * $this->unitCostOf($inv);
        }

        return $cost;
    }

    private function unitCostOf($inv): float
    {
        $c = (float) ($inv->lastUnitCost ?: $inv->averageCost ?: $inv->baseCost ?: 0);
        if ($c > 0) return $c;

        foreach (($inv->batches ?? []) as $b) {
            $bc = (float) ($b['unitCost'] ?? 0);
            if ($bc > 0) return $bc;
        }
        return 0.0;
    }

    /**
     * Give back the materials a job order was holding.
     *
     * Reservations are taken when the job is created and only ever released in one place: QC pass,
     * where they turn into consumption. Every other way a job can end - cancelled, deleted - left the
     * hold in place, so a job nobody is working on went on owning stock the shop could not sell. That
     * is the same leak that had 90 of 100 mug boxes held by abandoned orders.
     *
     * Only for a job that has NOT consumed yet. Once QC has passed, the material is gone rather than
     * held, and there is nothing to give back.
     */
    private function releaseJobOrderMaterials(JobOrder $jo, string $why): int
    {
        if (in_array($jo->joStatus, ['QC_Passed', 'Completed'], true)) {
            return 0;
        }

        $released = 0;
        foreach (($jo->bomSnapshot['components'] ?? $jo->bomSnapshot ?? []) as $c) {
            $inv = Inventory::find($c['inventoryId'] ?? null);
            if (!$inv || ($inv->isOnDemand ?? false)) continue;

            // The snapshot carries either a per-unit qty or an already-multiplied total, depending on
            // where it was written. Prefer the total when it is there.
            $qty = (int) round($c['totalQty'] ?? ((float) ($c['qty'] ?? 0) * (int) ($jo->product['quantity'] ?? 0)));
            if ($qty <= 0) continue;

            $inv->reservedQty = max(0, (int) ($inv->reservedQty ?? 0) - $qty);
            $inv->save();
            $released += $qty;

            try {
                StockHistory::create([
                    'inventoryId'  => (string) $inv->_id,
                    'quantity'     => $qty,
                    'remainingQty' => (int) ($inv->stockQty ?? 0),
                    'unitCost'     => $this->unitCostOf($inv),
                    'totalCost'    => 0,
                    'reason'       => 'reservation_released',
                    'reference'    => $jo->joId,
                    'note'         => $why,
                    'createdAt'    => now(),
                ]);
            } catch (\Throwable $e) {
                Log::warning('releaseJobOrderMaterials: history failed', ['error' => $e->getMessage()]);
            }
        }
        return $released;
    }

    /**
     * POST /api/admin/job-orders/{id}/spoilage
     *
     * Something was ruined on the shop floor. Two things follow from that, and only recording it
     * against the JOB captures both:
     *
     *  - The material is gone. Not reserved, not returnable - destroyed. `stockQty` drops now, rather
     *    than at QC where good output is consumed.
     *  - The customer is still owed the full quantity. So the reservation is NOT released: the job
     *    still needs its original count and will pull replacement material to get there. Net effect on
     *    a component is stockQty down, reservedQty unchanged.
     *
     * `kind` matters for costing, which is why it is required rather than inferred. NORMAL spoilage is
     * an expected rate and belongs in the cost of the job. ABNORMAL spoilage is a mistake and is
     * deliberately kept OUT of job cost - burying it there is how a recurring fault stays invisible.
     */
    public function reportSpoilage(Request $request, $id)
    {
        try {
            $user = $request->user();
            if (!$this->hasPermission($request, 'jobOrders.updateStatus')) {
                return $this->unauthorizedResponse();
            }

            $jo = JobOrder::find($id);
            if (!$jo) return $this->notFoundResponse('Job order');

            $ordered = (int) ($jo->product['quantity'] ?? 0);
            $validated = $request->validate([
                'quantity'    => 'required|integer|min:1|max:' . max(1, $ordered),
                'kind'        => 'required|in:normal,abnormal',
                'reason'      => 'required|string|min:3|max:500',
                // WHICH materials were lost. Spoilage at different stages destroys different things: a
                // mug that breaks before printing costs a mug and nothing else, while one that cracks in
                // the oven costs the mug, the paper and the film. Deducting the whole BOM every time
                // would quietly write off material still sitting on the shelf.
                'materials'   => 'sometimes|array',
                'materials.*' => 'string',
            ], [
                'quantity.max' => "You cannot spoil more than the {$ordered} this job is producing.",
                'reason.required' => 'Say what happened - a bare count tells nobody how to prevent it.',
            ]);

            $qty    = (int) $validated['quantity'];
            $reason = htmlspecialchars(strip_tags(trim($validated['reason'])), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
            $consumed = [];

            // Take the destroyed material out of stock now. The BOM snapshot is what the job was
            // costed against, so it is what spoilage is measured against too.
            // No list means everything, which is the worst case and the safe default for an old client.
            $lost = $validated['materials'] ?? null;

            foreach (($jo->bomSnapshot['components'] ?? $jo->bomSnapshot ?? []) as $c) {
                $invId = (string) ($c['inventoryId'] ?? '');
                if (is_array($lost) && !in_array($invId, $lost, true)) continue;

                $inv = Inventory::find($c['inventoryId'] ?? null);
                if (!$inv || ($inv->isOnDemand ?? false)) continue;
                $per = (float) ($c['qty'] ?? 0);
                if ($per <= 0) continue;

                $take = (int) round($per * $qty);
                if ($take <= 0) continue;

                $lineCost = $this->drawFromBatches($inv, $take);
                $inv->stockQty = max(0, (int) ($inv->stockQty ?? 0) - $take);
                $inv->save();
                $consumed[] = ['inventoryId' => (string) $inv->_id, 'name' => $inv->name, 'qty' => $take];

                try {
                    StockHistory::create([
                        'inventoryId'  => (string) $inv->_id,
                        'quantity'     => -$take,
                        'remainingQty' => (int) ($inv->stockQty ?? 0),
                        'unitCost'     => $take > 0 ? round($lineCost / $take, 4) : 0,
                        'totalCost'    => round($lineCost, 2),
                        'reason'       => 'production_spoilage',
                        'reference'    => $jo->joId,
                        'note'         => ucfirst($validated['kind']) . ' spoilage: ' . $reason,
                        'createdAt'    => now(),
                    ]);
                } catch (\Throwable $e) {
                    Log::warning('reportSpoilage: stock history failed', ['error' => $e->getMessage()]);
                }
            }

            if (empty($consumed)) {
                return $this->errorResponse('Pick at least one material that was actually lost.', 422);
            }

            $log   = $jo->spoilage ?? [];
            $log[] = [
                'quantity'   => $qty,
                'kind'       => $validated['kind'],
                'reason'     => $reason,
                'materials'  => $consumed,
                'reportedBy' => trim(($user->firstName ?? '') . ' ' . ($user->lastName ?? '')) ?: 'Staff',
                'reportedAt' => now()->toIso8601String(),
            ];
            $jo->spoilage  = $log;
            $jo->updatedAt = now();
            $jo->save();

            return $this->successResponse('Spoilage recorded. Replacement material stays reserved - the order still owes its full quantity.', $jo);
        } catch (\Illuminate\Validation\ValidationException $e) {
            return $this->validationErrorResponse($e);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'Failed to record spoilage.');
        }
    }

    /**
     * POST /api/admin/job-orders/{id}/production-files
     *
     * The print-ready artwork for THIS job order, which is not the same thing as the proof.
     *
     * The proof is a picture of the finished product for the customer to approve. What the shop floor
     * needs is the file the machine consumes - a DTF film layout at the right size, mirrored for
     * transfer, with bleed - and it differs per item: a mug wrap and a 10x12 tote panel share an
     * artwork but not a layout. Until now the job order carried only `designFilePath`, holding the
     * mockup, so production was being handed a picture it could not print.
     *
     * Kept as a list rather than one file because a reprint after a QC failure must not overwrite the
     * file that failed - you need to see which one was used.
     */
    public function uploadProductionFiles(Request $request, $id)
    {
        try {
            $user = $request->user();
            if (!$this->hasPermission($request, 'jobOrders.edit')) {
                return $this->unauthorizedResponse();
            }

            $jo = JobOrder::find($id);
            if (!$jo) return $this->notFoundResponse('Job order');

            if (!$request->hasFile('files')) {
                return response()->json(['message' => 'At least one file is required.'], 422);
            }

            $cloudName    = config('services.cloudinary.cloud_name');
            $uploadPreset = config('services.cloudinary.upload_preset');
            if (!$cloudName || !$uploadPreset) {
                return response()->json(['message' => 'Cloudinary configuration missing.'], 500);
            }

            $raw   = $request->file('files');
            $files = is_array($raw) ? $raw : [$raw];

            $stored = $jo->productionFiles ?? [];
            foreach ($files as $file) {
                if ($file->getSize() > 50 * 1024 * 1024) {
                    return response()->json(['message' => 'Each file must be under 50 MB.'], 422);
                }

                $res = Http::timeout(100)->connectTimeout(15)
                    ->attach('file', file_get_contents($file->getPathname()), $file->getClientOriginalName())
                    ->post("https://api.cloudinary.com/v1_1/{$cloudName}/auto/upload", [
                        'upload_preset' => $uploadPreset,
                    ]);

                if (!$res->successful()) {
                    Log::warning('uploadProductionFiles: Cloudinary error', ['body' => $res->body()]);
                    return response()->json(['message' => 'Failed to upload production file.'], 500);
                }

                $stored[] = [
                    'url'        => $res->json()['secure_url'],
                    'name'       => $file->getClientOriginalName(),
                    'sizeKB'     => (int) round($file->getSize() / 1024),
                    'note'       => $request->input('note') ?: null,
                    'uploadedBy' => trim(($user->firstName ?? '') . ' ' . ($user->lastName ?? '')) ?: 'Staff',
                    'uploadedAt' => now()->toIso8601String(),
                ];
            }

            $jo->productionFiles = $stored;
            $jo->updatedAt       = now();
            $jo->save();

            return $this->successResponse('Production files uploaded.', $jo);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'Failed to upload production files.');
        }
    }

    /** Remove one production file. The artwork that a job actually ran on is part of its record, so
     *  this is for correcting a mistaken upload - not for tidying up after a completed job. */
    public function deleteProductionFile(Request $request, $id, $index)
    {
        try {
            $user = $request->user();
            if (!$this->hasPermission($request, 'jobOrders.edit')) {
                return $this->unauthorizedResponse();
            }
            $jo = JobOrder::find($id);
            if (!$jo) return $this->notFoundResponse('Job order');

            if (in_array($jo->joStatus, ['QC_Passed', 'Completed'], true)) {
                return $this->errorResponse('This job has already passed QC - its artwork is part of the record.', 422);
            }

            $files = $jo->productionFiles ?? [];
            $i     = (int) $index;
            if (!array_key_exists($i, $files)) {
                return $this->errorResponse('File not found.', 404);
            }
            array_splice($files, $i, 1);
            $jo->productionFiles = $files;
            $jo->updatedAt       = now();
            $jo->save();

            return $this->successResponse('Production file removed.', $jo);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'Failed to remove production file.');
        }
    }

}
