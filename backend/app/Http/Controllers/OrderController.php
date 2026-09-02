<?php

namespace App\Http\Controllers;

use App\Events\OrderStatusUpdated;
use App\Mail\AdminNewOrderMail;
use App\Mail\OrderConfirmationMail;
use App\Mail\OrderStatusMail;
use App\Models\Order;
use App\Models\Product;
use App\Models\User;
use App\Models\Sale;
use App\Models\Inventory;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Storage;
use App\Models\ActivityLog;
use App\Models\Notification;
use App\Models\Conversation;
use App\Models\Message;
use App\Models\Voucher;
use App\Models\FlashSale;
use App\Models\BillOfMaterial;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use App\Models\StockHistory;
use App\Models\AuditLog;
use App\Services\PriceResolver;
use App\Support\OrderStatus;

class OrderController extends Controller
{
    // ─── Helpers ──────────────────────────────────────────────────────────────

    /**
     * Resolves the authenticated user from Bearer token.
     */
    private function getAuthUser(Request $request): ?User
    {
        return $request->user();
    }

    private function resolveInitialStatus($request): string
    {
        // Fulfillment only. The artwork stage lives in designStatus and the money in
        // paymentStatus - keeping a design word here (pending_review / pending_design) put a
        // non-canonical value in orderStatus that the admin transition table had no entry
        // for, so custom orders arrived with no way to be moved. Match /api/payment/initiate,
        // which already starts every order at canonical pending.
        return OrderStatus::PENDING;
    }

    /**
     * What one unit of this material actually costs.
     *
     * `averageCost` is NULL on this data - the real figure lives in lastUnitCost / baseCost / the
     * FIFO batch. Reading it alone logged every movement at P0.00, which makes cost of goods, profit
     * and margin fiction. Same fallback order the BOM screens use.
     */
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
     * Is THIS LINE something we have to make?
     *
     * The decision used to be read off the PRODUCT: anything customizable reserved material and
     * needed a job order. That was fine while a product was either customizable or not - but a
     * product can now be sold plain AND customized from the same shelf, and a plain purchase of one
     * would have reserved material, demanded a job order, and waited for a design approval that was
     * never coming.
     *
     * So it is the LINE that decides. A line carrying artwork, or asking us to draw some, is made to
     * order. A line with none is picked off the shelf, whatever the product is also capable of.
     * `isMadeToOrder` still counts, because those are produced regardless of decoration.
     */
    private function lineIsProduced($product, array $item): bool
    {
        if ((bool) ($product->isMadeToOrder ?? false)) return true;

        return !empty($item['designUrl'])
            || !empty($item['designFiles'])
            || !empty($item['designRequested'])
            || ($item['designMode'] ?? null) === 'request'
            || !empty($item['isCustom']);
    }

    private function normalizeOrderForCustomer(Order $order): array
    {
        $arr                = $order->toArray();
        $arr['id']          = (string) ($order->_id ?? $order->id ?? '');
        $arr['status']      = $order->orderStatus;
        $arr['proofUrl']    = $order->adminDesignUrl ?? null;
        $arr['isCustomOrder'] = (bool) ($order->isCustomOrder ?? false);
        return $arr;
    }

    // ─── Customer ─────────────────────────────────────────────────────────────

    /**
     * POST /api/orders
     * Customer places an order.
     *
     * Body: {
     *   items: [{ productId, variantId?, variantName?, qty }],
     *   notes?: string
     * }
     */
    public function store(Request $request)
    {
        try {
            $user = $this->getAuthUser($request);
            if (!$user) {
                return $this->unauthorizedResponse();
            }

            $validated = $request->validate([
                'items'                       => 'required|array|min:1',
                'items.*.productId'           => 'required|string',
                'items.*.variantId'           => 'nullable|string',
                'items.*.variantName'         => 'nullable|string',
                'items.*.qty'                 => 'required|integer|min:1',
                'items.*.flashSaleId'         => 'nullable|string|max:24',
                'items.*.designUrl'           => 'nullable|string',
                'items.*.designName'          => 'nullable|string|max:255',
                'items.*.designNotes'         => 'nullable|string|max:2000',
                'items.*.designFiles'         => 'nullable|array|max:5',
                'items.*.designFiles.*.url'   => 'required_with:items.*.designFiles|string|max:600',
                'items.*.designFiles.*.name'  => 'nullable|string|max:255',
                'notes'                       => 'nullable|string|max:1000',
                'paymentMethod'               => 'nullable|string|in:cod,online',
                'deliveryAddress'             => 'nullable|array',
                'deliveryAddress.label'       => 'nullable|string|max:100',
                'deliveryAddress.house_number'=> 'nullable|string|max:100',
                'deliveryAddress.street'      => 'nullable|string|max:255',
                'deliveryAddress.subdivision' => 'nullable|string|max:255',
                'deliveryAddress.region'      => 'nullable|string|max:255',
                'deliveryAddress.barangay'    => 'nullable|string|max:255',
                'deliveryAddress.city'        => 'nullable|string|max:255',
                'deliveryAddress.province'    => 'nullable|string|max:255',
                'deliveryAddress.zip'         => 'nullable|string|max:10',
                'deliveryAddress.phone'       => 'nullable|string|max:30',
                'deliveryAddress.lat'         => 'nullable|numeric|between:-90,90',
                'deliveryAddress.lng'         => 'nullable|numeric|between:-180,180',
                'design_file'                 => 'nullable|file|mimes:jpeg,jpg,png,webp,pdf|max:10240',
                'design_notes'                => 'nullable|string|max:2000',
                'voucherCode'                 => 'nullable|string|max:50',
                'shippingFee'                 => 'nullable|numeric|min:0|max:10000',
                'isCustomOrder'               => 'nullable|boolean',
                'designType'                  => 'nullable|string|in:upload,request',
                'items.*.designRequested'     => 'nullable|boolean',
                'items.*.designFee'           => 'nullable|numeric|min:0',
            ]);

            // Build order items with pricing (no transaction wrapper for MongoDB compatibility)
            $orderItems               = [];
            $totalAmount              = 0;
            $pendingFlashSaleIncrements = [];
            $firstProduct             = null;

            foreach ($validated['items'] as $item) {
                $product = Product::where('_id', $item['productId'])
                                  ->where('isActive', true)
                                  ->first();

                if (!$product) {
                    throw new \Exception("Product '{$item['productId']}' not found or unavailable.");
                }

                if (!$firstProduct) $firstProduct = $product;

                $qty              = (int) $item['qty'];
                $variantId        = $item['variantId'] ?? null;
                $flashSaleId      = isset($item['flashSaleId']) && $item['flashSaleId'] !== '' ? $item['flashSaleId'] : null;
                $appliedFlashSale = null;

                if ($flashSaleId) {
                    $fs = FlashSale::live()
                        ->where('_id', $flashSaleId)
                        ->where('productId', (string) $product->_id)
                        ->first();

                    if ($fs && (
                        $fs->stockLimit === null ||
                        ($fs->stockUsed ?? 0) < $fs->stockLimit
                    )) {
                        $appliedFlashSale = $fs;
                    }
                }

                $unitPrice = PriceResolver::resolve($product, $qty, $variantId, $appliedFlashSale);

                if ($unitPrice === null) {
                    throw new \Exception("No price configured for product '{$product->name}'.");
                }

                $lineTotal    = $unitPrice * $qty;
                $totalAmount += $lineTotal;

                if ($appliedFlashSale) {
                    $pendingFlashSaleIncrements[] = [$appliedFlashSale, $qty];
                }

                $variantId         = $item['variantId'] ?? null;
                $variantImageUrls  = (array) ($product->variantImageUrls ?? []);
                $rawThumb          = ($variantId && !empty($variantImageUrls[$variantId]))
                    ? $variantImageUrls[$variantId]
                    : ($product->thumbnail ?? null);
                $thumb = $rawThumb
                    ? (str_starts_with($rawThumb, 'http') ? $rawThumb : asset('storage/' . $rawThumb))
                    : null;

                $orderItems[] = [
                    'productId'   => (string) $product->_id,
                    'productName' => $product->name,
                    // What was BOUGHT, not what the product is capable of. Copying the product's
                    // flag meant a plain purchase of a both-ways product arrived marked custom, and
                    // every screen downstream - job orders, production, design approval - then waited
                    // for artwork that was never coming.
                    'isCustom'    => !empty($item['designUrl']) || !empty($item['designFiles'])
                        || !empty($item['designRequested'])
                        || ($item['designMode'] ?? null) === 'request'
                        // A customise-only product has no plain route, so a line on it is custom
                        // whether or not the artwork has been attached yet.
                        || ((bool) $product->isCustom && !($product->allowPlainPurchase ?? false)),
                    'isMadeToOrder' => (bool) ($product->isMadeToOrder ?? false),
                    'thumbnail'   => $thumb,
                    'variantId'   => $variantId,
                    'variantName' => $item['variantName'] ?? null,
                    'qty'         => $qty,
                    'unitPrice'   => $unitPrice,
                    'lineTotal'   => $lineTotal,
                    'flashSaleId' => $flashSaleId,
                    // The full artwork context has to survive here, not just the url - the
                    // online endpoint already carries it, and this COD path was dropping
                    // everything else, so the same line behaved differently by payment method.
                    'designUrl'       => $item['designUrl']   ?? null,
                    'designName'      => $item['designName']  ?? null,
                    'designNotes'     => $item['designNotes'] ?? null,
                    'designFiles'     => $item['designFiles'] ?? null,
                    'designRequested' => (bool) ($item['designRequested'] ?? false),
                    'designFee'       => isset($item['designFee']) ? (float) $item['designFee'] : null,
                    // Per-item design state (Option 2): an uploaded file waits for review, a
                    // requested design waits for the shop to draw it, a ready-made line has none.
                    'designStatus'    => !empty($item['designUrl'])
                        ? 'pending_review'
                        : (filter_var($item['designRequested'] ?? false, FILTER_VALIDATE_BOOLEAN) ? 'pending_design' : null),
                ];
            }

            $requiresDownpayment = (bool) ($firstProduct?->requiresDownpayment ?? false);
            $orderDownpaymentPct = $requiresDownpayment ? (int) ($firstProduct?->downpaymentPercent ?? 0) : 0;

            // One design fee for the order (highest wins, once) - the same rule the cart and
            // checkout show. A request-design order carries it so the fee can be collected as
            // the first payment from the order detail modal, not on the product page.
            $orderDesignFee = 0.0;
            $designLines = array_filter($validated['items'], fn($i) => filter_var($i['designRequested'] ?? false, FILTER_VALIDATE_BOOLEAN));
            if (count($designLines) > 0) {
                $storeFee = (float) (User::where('role', 'owner')->first()->designRequestFee ?? 100);
                $lineFees = array_map(fn($i) => (float) ($i['designFee'] ?? 0), $designLines);
                $orderDesignFee = round(max($storeFee, ...$lineFees), 2);
                $totalAmount += $orderDesignFee;
            }

            // Add shipping fee to total
            $shippingFee  = (float) ($validated['shippingFee'] ?? 0);
            $totalAmount += $shippingFee;

            // Delivery estimate + optional rush. Turnaround config lives on the store owner; the
            // estimate is snapshotted onto the order so the promised window never shifts later.
            $owner     = \App\Models\User::where('role', 'owner')->first() ?? \App\Models\User::where('role', 'admin')->first();
            $prodLead  = (int)   ($owner->productionLeadDays ?? 3);
            $shipMin   = (int)   ($owner->shippingDaysMin    ?? 1);
            $shipMax   = (int)   ($owner->shippingDaysMax    ?? 2);
            $rushOn    = (bool)  ($owner->rushEnabled        ?? true);
            $rushLead  = (int)   ($owner->rushLeadDays       ?? 1);
            // 150 to match SettingsController, which is what the settings screen and the public
            // settings endpoint both report. A different fallback here meant the order was billed a
            // fee the customer was never shown.
            $rushFee   = (float) ($owner->rushFee            ?? 150);

            // Does anything on this order actually have to be MADE? A cart of stocked goods needs
            // picking and shipping, nothing more - charging it the production lead time promised a
            // customer eleven days for a bag already sitting on the shelf. Read from the order items
            // that were just built, so it reflects what was bought rather than what the products are
            // capable of.
            $needsProduction = collect($orderItems)->contains(
                fn ($oi) => !empty($oi['isCustom']) || !empty($oi['isMadeToOrder'])
            );

            // Rush buys priority in the production queue. With nothing to produce there is no queue
            // to jump, so it is neither offered nor charged.
            $isRush = $needsProduction && $rushOn
                && filter_var($request->input('isRush', false), FILTER_VALIDATE_BOOLEAN);
            if ($isRush && $rushFee > 0) { $totalAmount += $rushFee; }
            // Rush is a REQUEST the admin confirms ("kaya ba isabay"), never an auto-guarantee. The
            // need-by date is the customer's target, subject to the production queue.
            $needByDate = $request->input('needByDate') ?: null;
            $rushStatus = $isRush ? 'requested' : null;

            $leadDays = !$needsProduction ? 0 : ($isRush ? $rushLead : $prodLead);
            $addBusinessDays = function (int $days) {          // skip Sundays (Sat is a work day here)
                $d = now();
                while ($days > 0) { $d = $d->addDay(); if (!$d->isSunday()) { $days--; } }
                return $d;
            };
            $estimatedDeliveryMin = $addBusinessDays($leadDays + $shipMin)->toIso8601String();
            $estimatedDeliveryMax = $addBusinessDays($leadDays + $shipMax)->toIso8601String();

            // The date picker enforces a minimum client-side, but a request built by hand skips it
            // entirely - and this is the one field that becomes a promise the shop is held to. A
            // needByDate earlier than what production and shipping can actually deliver is dropped
            // rather than stored, the same way an out-of-range value from any other form field would
            // be rejected rather than trusted.
            if ($needByDate) {
                try {
                    if (\Carbon\Carbon::parse($needByDate)->lt(\Carbon\Carbon::parse($estimatedDeliveryMin)->startOfDay())) {
                        $needByDate = null;
                    }
                } catch (\Throwable) {
                    $needByDate = null;
                }
            }

            // Handle design file upload (non-fatal)
            $designFilePath = null;
            if ($request->hasFile('design_file') && $request->file('design_file')->isValid()) {
                try {
                    $cloudName    = config('services.cloudinary.cloud_name');
                    $uploadPreset = config('services.cloudinary.upload_preset');
                    $file         = $request->file('design_file');
                    $ext          = strtolower($file->getClientOriginalExtension());
                    $resourceType = in_array($ext, ['jpg','jpeg','png','webp','svg']) ? 'image' : 'raw';
                    $response     = Http::attach(
                        'file',
                        file_get_contents($file->getPathname()),
                        $file->getClientOriginalName()
                    )->post("https://api.cloudinary.com/v1_1/{$cloudName}/{$resourceType}/upload", [
                        'upload_preset' => $uploadPreset,
                        'folder'        => 'pmp-customer-designs',
                    ]);
                    if ($response->successful()) {
                        $designFilePath = $response->json()['secure_url'];
                    }
                } catch (\Exception $fileErr) {
                    Log::warning('OrderController@store: design file upload failed', [
                        'error'  => $fileErr->getMessage(),
                        'userId' => (string) $user->_id,
                    ]);
                }
            }

            $paymentMethod = $validated['paymentMethod'] ?? 'cod';

            // ── COD guard — reject if any product disallows COD ──────────
            if ($paymentMethod === 'cod') {
                foreach ($validated['items'] as $item) {
                    $prod = Product::find($item['productId'] ?? null);
                    if ($prod && $prod->allowCOD === false) {
                        return $this->errorResponse('One or more items in your order do not allow Cash on Delivery.', 422);
                    }
                }
            }

            // ── Voucher discount — atomic claim ───────────────────────────
            $discountAmount = 0.0;
            $appliedVoucher = null;

            if (!empty($validated['voucherCode'])) {
                $voucherCode = strtoupper(trim($validated['voucherCode']));
                $userId      = (string) $user->_id;
                $now         = now();

                $voucher = Voucher::where('code', $voucherCode)->first();

                $preValid = $voucher
                    && $voucher->isActive
                    && (!$voucher->expiresAt || $voucher->expiresAt >= $now)
                    && ($voucher->maxUses === null || $voucher->usedCount < $voucher->maxUses)
                    && !in_array($userId, $voucher->usedBy ?? [], true)
                    && ($voucher->minOrderAmount === null || $totalAmount >= $voucher->minOrderAmount);

                if ($preValid) {
                    $discountAmount = $voucher->discountType === 'percentage'
                        ? round($totalAmount * $voucher->discountValue / 100, 2)
                        : min((float) $voucher->discountValue, $totalAmount);

                    $filter = [
                        'code'     => $voucherCode,
                        'isActive' => true,
                        'usedBy'   => ['$nin' => [$userId]],
                    ];
                    if ($voucher->maxUses !== null) {
                        $filter['$expr'] = ['$lt' => ['$usedCount', '$maxUses']];
                    }

                    $claimed = DB::connection('mongodb')
                        ->getCollection('vouchers')
                        ->findOneAndUpdate(
                            $filter,
                            [
                                '$inc'      => ['usedCount' => 1],
                                '$addToSet' => ['usedBy' => $userId],
                            ],
                            ['returnDocument' => \MongoDB\Operation\FindOneAndUpdate::RETURN_DOCUMENT_AFTER]
                        );

                    if ($claimed) {
                        $totalAmount    = max(0, $totalAmount - $discountAmount);
                        $appliedVoucher = $voucher;
                    } else {
                        $discountAmount = 0.0;
                    }
                }
            }

            // ── Pre-validate BOM products against can-produce ────────────
            foreach ($orderItems as $item) {
                $bomProd  = Product::find($item['productId'] ?? null);
                $itemQty  = (int) ($item['qty'] ?? 1);
                $variantId = $item['variantId'] ?? null;

                if (!$bomProd) continue;

                // Determine the BOM to validate against
                $bom = null;
                if (!empty($bomProd->bomGroupName) && $variantId) {
                    $bom = BillOfMaterial::find($variantId);
                } elseif (!empty($bomProd->bomId)) {
                    $bom = BillOfMaterial::find($bomProd->bomId);
                }
                // per-combination bomId: each combo stores its own bomId
                if (!$bom && $variantId && !empty($bomProd->combinations)) {
                    foreach ($bomProd->combinations as $combo) {
                        if ((string) ($combo['id'] ?? $combo['_id'] ?? '') === (string) $variantId && !empty($combo['bomId'])) {
                            $bom = BillOfMaterial::find($combo['bomId']);
                            break;
                        }
                    }
                }

                if (!$bom || empty($bom->components)) continue;

                // Per-variant manual cap stored in variantStock
                if (!empty($bomProd->bomGroupName) && $variantId) {
                    $variantCap = isset($bomProd->variantStock[$variantId]) && (int) $bomProd->variantStock[$variantId] > 0
                        ? (int) $bomProd->variantStock[$variantId]
                        : null;
                    if ($variantCap !== null && $itemQty > $variantCap) {
                        return $this->errorResponse(
                            "\"{$bomProd->name}\" has a storefront cap of {$variantCap} unit(s) for that variant.",
                            422
                        );
                    }
                } elseif ($bomProd->storeStockCap !== null && $itemQty > (int) $bomProd->storeStockCap) {
                    return $this->errorResponse(
                        "\"{$bomProd->name}\" has a storefront limit of {$bomProd->storeStockCap} unit(s).",
                        422
                    );
                }

                $canProduce = PHP_INT_MAX;
                foreach ($bom->components as $component) {
                    $rawInv = Inventory::find($component['inventoryId'] ?? null);
                    if (!$rawInv || $rawInv->isOnDemand) continue;
                    $qpu = (float) ($component['qty'] ?? 0);
                    if ($qpu <= 0) continue;
                    // Available for new orders = physical stock minus what's already reserved for production.
                    $available = max(0, (int) ($rawInv->stockQty ?? 0) - (int) ($rawInv->reservedQty ?? 0));
                    $canProduce = min($canProduce, (int) floor($available / $qpu));
                }
                if ($canProduce !== PHP_INT_MAX && $itemQty > $canProduce) {
                    return $this->errorResponse(
                        "\"{$bomProd->name}\" can only produce {$canProduce} unit(s) with current materials.",
                        422
                    );
                }
            }

            // ── Atomic stock reservation BEFORE order creation ───────────
            // Uses findOneAndUpdate with $gte condition: if two buyers race,
            // only one succeeds; the other gets a 422 and no order is created.
            $stockReservations = [];
            foreach ($orderItems as $item) {
                $prod = Product::find($item['productId'] ?? null);
                if (!$prod || !$prod->inventoryId) continue;
                $inv = Inventory::find($prod->inventoryId);
                if (!$inv || $inv->isOnDemand) continue;

                $qty = (int) $item['qty'];

                $updated = DB::connection('mongodb')
                    ->getCollection('inventories')
                    ->findOneAndUpdate(
                        [
                            '_id'      => new \MongoDB\BSON\ObjectId((string) $inv->_id),
                            'stockQty' => ['$gte' => $qty],
                        ],
                        ['$inc' => ['stockQty' => -$qty]],
                        ['returnDocument' => \MongoDB\Operation\FindOneAndUpdate::RETURN_DOCUMENT_AFTER]
                    );

                if ($updated === null) {
                    // Rollback all previous reservations in this request
                    foreach ($stockReservations as $r) {
                        DB::connection('mongodb')
                            ->getCollection('inventories')
                            ->updateOne(
                                ['_id' => new \MongoDB\BSON\ObjectId($r['invId'])],
                                ['$inc' => ['stockQty' => $r['qty']]]
                            );
                    }
                    $currentStock = (int) ($inv->stockQty ?? 0);
                    return $this->errorResponse(
                        "\"{$prod->name}\" only has {$currentStock} item(s) in stock.",
                        422
                    );
                }

                $stockReservations[] = [
                    'invId'       => (string) $inv->_id,
                    'qty'         => $qty,
                    'newStockQty' => (int) ($updated->stockQty ?? 0),
                    'unitCost'    => $this->unitCostOf($inv),
                    'productId'   => (string) $prod->_id,
                    'productName' => $prod->name ?? '',
                ];
            }

            // Order-level design context, derived from the lines so a cart order behaves the
            // same as a single one. designFilePath mirrors the first uploaded artwork; the
            // admin's approve/reject screens and the production gate read these.
            $anyCustom      = false;
            $anyUploaded    = false;
            $anyRequested   = false;
            $firstItemThumb = null;
            foreach ($orderItems as $oi) {
                if (!empty($oi['isCustom']))        $anyCustom    = true;
                if (!empty($oi['designRequested'])) $anyRequested = true;
                if (!empty($oi['designUrl'])) {
                    $anyUploaded    = true;
                    $firstItemThumb = $firstItemThumb ?? $oi['designUrl'];
                }
            }
            $orderIsCustom  = filter_var($request->input('isCustomOrder', false), FILTER_VALIDATE_BOOLEAN) || $anyCustom;
            $orderDesign    = $designFilePath ?: $firstItemThumb;
            // Uploaded artwork waits for a review; a request has nothing to review yet.
            $orderDesignSt  = $orderDesign ? 'pending_review' : null;
            $orderDesignTp  = $request->input('designType')
                ?? ($anyUploaded ? 'upload' : ($anyRequested ? 'request' : null));

            $order = Order::create([
                'userId'          => (string) $user->_id,
                'userSnapshot'    => [
                    'name'  => trim("{$user->firstName} {$user->lastName}"),
                    'email' => $user->email,
                    'phone' => $user->phoneNumber,
                ],
                'items'           => $orderItems,
                'totalAmount'     => $totalAmount,
                'shippingFee'     => $shippingFee,
                // Snapshot how shipping was charged AT THE TIME. A zero fee means two different
                // things - free delivery, or the recipient pays the rider - and without this an old
                // receipt would silently re-label itself the day the owner changes the setting.
                'shippingMode'    => $owner->shippingMode ?? 'courier_booked',
                'discountAmount'  => $discountAmount > 0 ? $discountAmount : null,
                'voucherCode'     => $appliedVoucher?->code ?? null,
                'orderStatus'     => $this->resolveInitialStatus($request),
                'paymentStatus'   => 'unpaid',
                'paymentMethod'   => $paymentMethod,
                'notes'           => htmlspecialchars(strip_tags(trim($validated['notes'] ?? '')), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'),
                'deliveryAddress' => $validated['deliveryAddress'] ?? null,
                'designNotes'     => isset($validated['design_notes'])
                    ? htmlspecialchars(strip_tags(trim($validated['design_notes'])), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8')
                    : null,
                'designFilePath'  => $orderDesign,
                'designStatus'    => $orderDesignSt,
                'isCustomOrder'        => $orderIsCustom,
                'designType'           => $orderDesignTp,
                'designFee'            => $orderDesignFee > 0 ? $orderDesignFee : null,
                'designFeePaid'        => false,
                'requiresDownpayment'  => $requiresDownpayment,
                'downpaymentPercent'   => $orderDownpaymentPct > 0 ? $orderDownpaymentPct : null,
                'isRush'               => $isRush,
                'rushFee'              => $isRush ? $rushFee : null,
                'rushStatus'           => $rushStatus,
                'needByDate'           => $needByDate,
                'estimatedDeliveryMin' => $estimatedDeliveryMin,
                'estimatedDeliveryMax' => $estimatedDeliveryMax,
                // Clickwrap acceptance recorded for proof (which terms version, when).
                'agreedToTerms'        => filter_var($request->input('agreedToTerms', false), FILTER_VALIDATE_BOOLEAN),
                'agreedAt'             => filter_var($request->input('agreedToTerms', false), FILTER_VALIDATE_BOOLEAN) ? ($request->input('agreedAt') ?: now()->toIso8601String()) : null,
                'termsVersion'         => $request->input('termsVersion') !== null ? (int) $request->input('termsVersion') : null,
                // Exact clauses agreed to (snapshot), so the proof survives even if the terms change later.
                'agreedTermsSnapshot'  => is_array($request->input('agreedTermsSnapshot')) ? $request->input('agreedTermsSnapshot') : null,
                'statusHistory'        => [['status' => OrderStatus::PENDING, 'at' => now()->toISOString()]],
                'createdAt'       => now(),
                'updatedAt'       => now(),
            ]);

            // Deduct flash sale stock only after order is persisted
            foreach ($pendingFlashSaleIncrements as [$flashSale, $qty]) {
                $flashSale->increment('stockUsed', $qty);
            }

            // Record StockHistory for the atomically-reserved quantities
            foreach ($stockReservations as $r) {
                try {
                    StockHistory::create([
                        'inventoryId'  => $r['invId'],
                        'quantity'     => $r['qty'],
                        'remainingQty' => $r['newStockQty'],
                        'unitCost'     => $r['unitCost'],
                        'totalCost'    => $r['unitCost'] * $r['qty'],
                        'reason'       => 'sale_reserved',
                        'type'         => 'deduction',
                        'performedBy'  => 'system',
                        'orderId'      => (string) $order->_id,
                        'productId'    => $r['productId'],
                        'productName'  => $r['productName'],
                        'customerName' => $order->userSnapshot['name'] ?? '',
                        'remarks'      => 'Order: ' . (string) $order->_id,
                        'createdAt'    => now(),
                    ]);
                } catch (\Exception $e) {
                    Log::warning('store: StockHistory write failed', ['error' => $e->getMessage()]);
                }
            }

            // ── BOM material deduction at order creation ──────────────
            foreach ($orderItems as $item) {
                $prod      = Product::find($item['productId'] ?? null);
                $variantId = $item['variantId'] ?? null;
                if (!$prod) continue;
                try {
                    $bom = null;
                    if (!empty($prod->bomGroupName) && $variantId) {
                        $bom = BillOfMaterial::find($variantId);
                    } elseif (!empty($prod->bomId)) {
                        $bom = BillOfMaterial::find($prod->bomId);
                    }
                    // per-combination bomId: each combo stores its own bomId
                    if (!$bom && $variantId && !empty($prod->combinations)) {
                        foreach ($prod->combinations as $combo) {
                            if ((string) ($combo['id'] ?? $combo['_id'] ?? '') === (string) $variantId && !empty($combo['bomId'])) {
                                $bom = BillOfMaterial::find($combo['bomId']);
                                break;
                            }
                        }
                    }
                    if (!$bom || empty($bom->components)) continue;
                    // Made-to-order / custom items RESERVE materials now (consumed at QC pass via the
                    // Job Order). Stocked ready-made items DEDUCT now (no production step).
                    $producedItem = $this->lineIsProduced($prod, (array) $item);
                    foreach ($bom->components as $component) {
                        $rawInv = Inventory::find($component['inventoryId'] ?? null);
                        if (!$rawInv || $rawInv->isOnDemand) continue;
                        $deductQty = (int) round(($component['qty'] ?? 0) * ($item['qty'] ?? 1));
                        if ($deductQty <= 0) continue;
                        if ($producedItem) {
                            $rawInv->reservedQty = (int) ($rawInv->reservedQty ?? 0) + $deductQty;
                            $rawInv->save();
                            StockHistory::create([
                                'inventoryId'  => (string) $rawInv->_id,
                                'quantity'     => $deductQty,
                                'remainingQty' => (int) ($rawInv->stockQty ?? 0),
                                'unitCost'     => $this->unitCostOf($rawInv),
                                'totalCost'    => 0,
                                'reason'       => 'production_reserved',
                                'type'         => 'reservation',
                                'performedBy'  => 'system',
                                'orderId'      => (string) $order->_id,
                                'productId'    => (string) $prod->_id,
                                'productName'  => $prod->name ?? '',
                                'customerName' => $order->userSnapshot['name'] ?? '',
                                'remarks'      => 'Reserved for production: ' . (string) $order->_id,
                                'createdAt'    => now(),
                            ]);
                        } else {
                            $this->deductInventoryFIFO(
                                inventory:    $rawInv,
                                qty:          $deductQty,
                                reason:       'sale_reserved',
                                unitPrice:    0.0,
                                orderId:      (string) $order->_id,
                                productId:    (string) $prod->_id,
                                productName:  $prod->name ?? '',
                                customerName: $order->userSnapshot['name'] ?? '',
                            );
                        }
                    }
                } catch (\Exception $bomErr) {
                    Log::warning('store: BOM deduction failed', [
                        'orderId'   => (string) $order->_id,
                        'productId' => $item['productId'],
                        'error'     => $bomErr->getMessage(),
                    ]);
                }
            }

            // Broadcast new order to admin channel
            try {
                broadcast(new OrderStatusUpdated(
                    (string) $order->_id,
                    'pending',
                    null
                ));
            } catch (\Throwable $e) {
                Log::warning('OrderController@store: broadcast failed', ['error' => $e->getMessage()]);
            }

            // Notify owner
            $this->notifyOwner($order);

            // In-app notification to admin — B-13
            try {
                $admin = \App\Models\User::where('role', 'admin')->first();
                if ($admin) {
                    Notification::create([
                        'user_id'    => (string) $admin->_id,
                        'type'       => 'new_order',
                        'title'      => 'New Order Received',
                        'message'    => 'Order #' . strtoupper(substr((string) $order->_id, -8)) .
                                        ' placed by ' . ($order->userSnapshot['name'] ?? 'Unknown') . '.',
                        'is_read'    => false,
                        'data'       => ['orderId' => (string) $order->_id],
                        'created_at' => now(),
                    ]);
                }
            } catch (\Exception $e) {
                Log::warning('store: admin notification failed', ['error' => $e->getMessage()]);
            }

            // Notify customer — order confirmation
            try {
                $customerEmail = $order->userSnapshot['email'] ?? null;
                $customerName  = $order->userSnapshot['name'] ?? '';
                $firstName     = explode(' ', trim($customerName))[0] ?? 'Customer';
                if ($customerEmail) {
                    Mail::to($customerEmail)->send(new OrderConfirmationMail(
                        firstName:   $firstName,
                        orderId:     (string) $order->_id,
                        items:       $order->items ?? [],
                        totalAmount: (float) ($order->totalAmount ?? 0),
                        status:      $order->orderStatus ?? 'Pending',
                        notes:       $order->notes ?? ''
                    ));
                }
            } catch (\Exception $e) {
                Log::error('OrderController @store: Failed to send confirmation email', [
                    'order_id' => (string) $order->_id,
                    'error'    => $e->getMessage(),
                ]);
            }

            return $this->successResponse('Order placed successfully!', $order, 201);

        } catch (\Illuminate\Validation\ValidationException $e) {
            return $this->validationErrorResponse($e);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'An unexpected error occurred while placing your order.');
        }
    }

    /**
     * GET /api/orders/my
     * Returns the authenticated customer's orders.
     */
    public function myOrders(Request $request)
    {
        try {
            $user = $this->getAuthUser($request);
            if (!$user) {
                return $this->unauthorizedResponse();
            }

            $limit  = min(100, max(1, (int) $request->query('limit', 50)));
            $page   = max(1, (int) $request->query('page', 1));
            $offset = ($page - 1) * $limit;

            $total  = Order::where('userId', (string) $user->_id)->count();
            $orders = Order::where('userId', (string) $user->_id)
                           ->orderBy('createdAt', 'desc')
                           ->skip($offset)
                           ->limit($limit)
                           ->get();

            return $this->successResponse('Orders fetched successfully.', [
                'data'       => $orders->map(fn($o) => $this->normalizeOrderForCustomer($o)),
                'total'      => $total,
                'page'       => $page,
                'limit'      => $limit,
                'totalPages' => (int) ceil($total / $limit),
            ]);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'An unexpected error occurred while fetching your orders.');
        }
    }

    /**
     * GET /api/orders/my/{id}
     * Returns a single order belonging to the authenticated customer.
     */
    public function myOrderShow(Request $request, $id)
    {
        try {
            $user = $this->getAuthUser($request);
            if (!$user) {
                return $this->unauthorizedResponse();
            }

            $order = Order::where('_id', $id)
                          ->where('userId', (string) $user->_id)
                          ->first();

            if (!$order) {
                return $this->notFoundResponse('Order');
            }

            return $this->successResponse('Order fetched successfully.', $this->normalizeOrderForCustomer($order));
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'An unexpected error occurred while fetching your order.');
        }
    }

    // ─── Admin Only ───────────────────────────────────────────────────────────


    /**
     * POST /api/admin/orders/{id}/remind-balance
     *
     * The automatic balance-due notice fires once, at the moment the last job passes QC. If the
     * customer misses it there was no way to follow up except typing in the chat by hand, so the
     * owner had a finished order sitting on a shelf with no lever to pull.
     *
     * Sends to BOTH surfaces deliberately: the bell is easy to miss, the chat is where this customer
     * has been talking all along. Rate limited because a reminder that arrives twice an hour reads as
     * harassment, not service.
     */
    public function remindBalance(Request $request, $id)
    {
        try {
            if (!$this->hasPermission($request, 'orders.edit')) {
                return $this->forbiddenResponse();
            }

            $order = Order::find($id);
            if (!$order) return $this->notFoundResponse('Order');

            if (strtolower((string) ($order->paymentMethod ?? '')) === 'cod') {
                return $this->errorResponse('This is a cash-on-delivery order - there is nothing to settle in advance.', 422);
            }

            $paid    = max((float) ($order->downPayment ?? 0), collect($order->paymentHistory ?? [])->sum(fn ($p) => (float) ($p['amount'] ?? 0)));
            $balance = round(max(0, (float) ($order->totalAmount ?? 0) - $paid), 2);
            if (($order->paymentStatus ?? '') === 'paid' || $balance <= 0) {
                return $this->errorResponse('This order has no outstanding balance.', 422);
            }

            $last = $order->balanceReminderAt ? \Carbon\Carbon::parse($order->balanceReminderAt) : null;
            if ($last && $last->diffInHours(now()) < 6) {
                return $this->errorResponse(
                    'A reminder was already sent ' . $last->diffForHumans() . '. You can send another after 6 hours.', 429);
            }

            $ref  = $order->orderNumber ?: ('ORD-' . strtoupper(substr((string) $order->_id, -8)));
            $text = 'Your order ' . $ref . ' is finished and ready to go. There is a remaining balance of P'
                  . number_format($balance, 2) . '. Once it is settled we will release the order for delivery.';

            \App\Models\Notification::create([
                'user_id'    => (string) $order->userId,
                'type'       => 'balance_due_before_delivery',
                'title'      => 'Balance Due - Order Ready',
                'message'    => $text,
                'is_read'    => false,
                'data'       => ['orderId' => (string) $order->_id, 'balance' => $balance],
                'created_at' => now(),
            ]);

            $this->postOrderChat($order, $text, $ref, $balance);

            $order->balanceReminderAt = now();
            $order->save();

            return $this->successResponse('Reminder sent to the customer.', ['balance' => $balance]);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'Failed to send the reminder.');
        }
    }

    /**
     * Drop a line into the customer's existing thread. Best effort: a chat that cannot be reached
     * must not fail the reminder, because the notification has already been written.
     */
    private function postOrderChat(Order $order, string $text, string $ref, float $balance): void
    {
        try {
            $customerId = (string) $order->userId;
            if ($customerId === '') return;

            $conversation = \App\Models\Conversation::where('participants', $customerId)->get()
                ->first(fn ($c) => count(array_map('strval', $c->participants ?? [])) === 2);
            if (!$conversation) return;

            $admin = auth()->user();
            $msg = \App\Models\Message::create([
                'conversation_id' => (string) $conversation->_id,
                'sender_id'       => $admin?->_id,
                'sender_name'     => trim(($admin->firstName ?? '') . ' ' . ($admin->lastName ?? '')) ?: 'Personalize Me Prints',
                'body'            => $text,
                'type'            => 'text',
                'metadata'        => ['order_reference' => [
                    'orderId' => (string) $order->_id, 'orderNo' => $ref, 'balance' => $balance, 'kind' => 'balance_due',
                ]],
                'is_read'         => false,
            ]);

            $conversation->update(['last_message' => $text, 'last_message_at' => now()]);
            try { broadcast(new \App\Events\MessageSent($msg))->toOthers(); } catch (\Throwable) {}
        } catch (\Throwable $e) {
            Log::warning('Balance reminder chat post failed', ['order' => (string) $order->_id, 'error' => $e->getMessage()]);
        }
    }


    /**
     * POST /api/admin/orders/{id}/write-off
     *
     * The end of the holding period. The goods are made, the customer never paid the balance, and
     * personalised stock cannot be sold to anyone else - so this is a real loss that has to be
     * recorded, not an order that quietly disappears.
     *
     * Without it the shop archives the order and the forfeited deposit looks like pure profit, while
     * ten mugs it is about to throw away appear nowhere. The cost of those goods is knowable because
     * every QC movement now carries its orderId.
     */
    public function writeOffOrder(Request $request, $id)
    {
        try {
            if (!$this->hasPermission($request, 'payments.edit')) {
                return $this->forbiddenResponse();
            }

            $order = Order::find($id);
            if (!$order) return $this->notFoundResponse('Order');

            if (!empty($order->writeOff)) {
                return $this->errorResponse('This order has already been written off.', 422);
            }

            $status = OrderStatus::normalize($order->orderStatus);
            if (!in_array($status, [OrderStatus::READY_FOR_DELIVERY, OrderStatus::FOR_DELIVERY], true)) {
                return $this->errorResponse('Only a finished order that was never collected can be written off.', 422);
            }

            $paid = collect($order->paymentHistory ?? [])->sum(fn ($p) => (float) ($p['amount'] ?? 0));
            $owed = round(max(0, (float) ($order->totalAmount ?? 0) - $paid), 2);
            if ($owed <= 0) {
                return $this->errorResponse('This order is fully paid - there is nothing to forfeit.', 422);
            }

            // What the goods actually cost to make. Every QC consumption and scrap row carries this
            // order's id, so the figure is the real one rather than an estimate.
            $goodsCost = (float) StockHistory::where('orderId', (string) $order->_id)
                ->where('type', 'deduction')
                ->get()
                ->sum(fn ($h) => (float) ($h->totalCost ?? 0));

            $writeOff = [
                'goodsCost'    => round($goodsCost, 2),
                'depositKept'  => round($paid, 2),
                'balanceLost'  => $owed,
                // Positive means the forfeited deposit covered the build; negative is a real hole.
                'netPosition'  => round($paid - $goodsCost, 2),
                'reason'       => trim((string) $request->input('reason', '')) ?: 'Unclaimed after the holding period.',
                'at'           => now()->toISOString(),
                'by'           => trim(($request->user()->firstName ?? '') . ' ' . ($request->user()->lastName ?? '')) ?: 'Shop',
            ];

            $order->writeOff        = $writeOff;
            $order->orderStatus     = OrderStatus::CANCELLED;
            $order->cancelledBy     = 'shop';
            $order->cancelledReason = $writeOff['reason'] . ' Deposit forfeited under the holding period.';
            $order->cancelledAt     = now();
            $order->isArchived      = true;
            $order->archivedAt      = now();
            $order->updatedAt       = now();
            $order->save();

            // Materials were consumed at QC, so nothing returns to stock. What is missing is a record
            // that finished goods were destroyed - otherwise the loss exists only in the owner's head.
            try {
                StockHistory::create([
                    'inventoryId'  => null,
                    'quantity'     => 0,
                    'remainingQty' => 0,
                    'unitCost'     => 0,
                    'totalCost'    => round($goodsCost, 2),
                    'reason'       => 'unclaimed_writeoff',
                    'type'         => 'deduction',
                    'performedBy'  => $writeOff['by'],
                    'orderId'      => (string) $order->_id,
                    'customerName' => $order->userSnapshot['name'] ?? null,
                    'remarks'      => 'Finished goods disposed of, unclaimed. ' . $writeOff['reason'],
                    'createdAt'    => now(),
                ]);
            } catch (\Throwable $e) {
                Log::warning('write-off history failed', ['order' => (string) $order->_id, 'error' => $e->getMessage()]);
            }

            return $this->successResponse('Order written off and archived.', $writeOff);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'Failed to write off the order.');
        }
    }


    /**
     * GET /api/admin/orders/cost-of-goods
     *
     * What each order actually cost to make, keyed by order id.
     *
     * The Sales report measured REVENUE from orders but COST from the Sale collection, and only the
     * POS writes Sale records - so every storefront order contributed revenue with no cost and the
     * gross margin came out far too high. The figures are knowable now that each QC consumption and
     * scrap row carries its orderId, so this reads the real thing.
     *
     * One aggregate rather than a query per order, because this is called for a whole reporting
     * window at a time.
     */
    public function orderCostOfGoods(Request $request)
    {
        try {
            if (!$this->hasPermission($request, 'orders')) {
                return $this->forbiddenResponse();
            }

            $rows = StockHistory::where('type', 'deduction')
                ->whereNotNull('orderId')
                ->get(['orderId', 'productId', 'productName', 'totalCost']);

            // Per PRODUCT as well as per order. A sales export that lumps every line of an order into
            // one number cannot answer the question the owner actually has: which product makes money.
            $byOrder = [];
            foreach ($rows as $r) {
                $key  = (string) $r->orderId;
                $cost = (float) ($r->totalCost ?? 0);
                $pid  = (string) ($r->productId ?? '') ?: ('name:' . (string) ($r->productName ?? 'unknown'));

                if (!isset($byOrder[$key])) $byOrder[$key] = ['total' => 0, 'byProduct' => []];
                $byOrder[$key]['total'] = round($byOrder[$key]['total'] + $cost, 2);
                $byOrder[$key]['byProduct'][$pid] = round(($byOrder[$key]['byProduct'][$pid] ?? 0) + $cost, 2);
            }

            return $this->successResponse('Cost of goods fetched.', $byOrder);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'Failed to fetch cost of goods.');
        }
    }

    /**
     * GET /api/admin/orders
     * Returns all orders for the admin dashboard.
     */
    public function adminIndex(Request $request)
    {
        try {
            if (!$this->hasPermission($request, 'orders')) {
                return $this->unauthorizedResponse();
            }

            $query = Order::select($this->orderListFields())
                ->with(['jobOrder' => function ($q) {
                    $q->select([
                        '_id',
                        'orderId',
                        'joStatus',
                        'targetCompletion',
                        'assignedTo',
                        'isRush',
                    ]);
                }])
                ->where('isArchived', '!=', true)
                ->orderBy('createdAt', 'desc');

            if ($request->filled('orderStatus')) {
                $query->where('orderStatus', $request->orderStatus);
            }

            $orders = $query->get();
            return $this->successResponse('Orders fetched successfully.', $this->stripOrderFinancials($request, $orders));
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'An unexpected error occurred while fetching orders.');
        }
    }

    /**
     * MongoDB projection for admin/API order list responses (avoids loading unused fields).
     *
     * @return array<int, string>
     */
    private function orderListFields(): array
    {
        return [
            '_id',
            'orderId',
            'userId',
            'orderStatus',
            'paymentStatus',
            'customerName',
            'customer',
            'userSnapshot',
            'items',
            'subtotal',
            'shippingFee',
            'courierFee',
            'totalAmount',
            'total',
            'totalPrice',
            'downPayment',
            'balance',
            'paymentMethod',
            'paymentHistory',
            // Money the shop owes back. Without these on the projection the obligation exists in
            // the database and nowhere a person will ever look.
            'refunds', 'refundOwed',
            'notes',
            'joId',
            // A mixed order produces one job order per printable item, so the admin screens need the
            // whole set, not just the first. 'joId' stays for older screens that still read it.
            'joIds',
            'joStatus',
            'isRush',
            'targetCompletion',
            'orderSource',
            'voucherCode',
            'discountAmount',
            'courierName',
            'trackingNumber',
            'createdAt',
            'updatedAt',
            'shippingAddress',
            'deliveryAddress',
            'designNotes',
            'designStatus',
            'designFilePath',
            // Design-flow fields the order detail modal needs: without these the modal
            // cannot show the Pay Design Fee action, the rejection reason, or the proof.
            'isCustomOrder',
            'designType',
            'designFee',
            'designFeePaid',
            'designFeePaidAmount',
            'paymentDueAt',
            'revisionCount',
            'revisionFees',
            'designRejectionReason',
            'designFiles',
            'adminDesignUrl',
            'adminDesignUrls',
            // Informational mockups sent after approval. Listed here or the admin list silently
            // drops them, which is how every other field on this projection has gone missing.
            'mockups',
            'revisionNotes',
            'requiresDownpayment',
            'downpaymentPercent',
            'rushFee',
            'rushStatus',
            'needByDate',
            'estimatedDeliveryMin',
            'estimatedDeliveryMax',
            'agreedTermsSnapshot',
            'agreedToTerms',
            'agreedAt',
            'termsVersion',
        ];
    }

    /** Order money fields hidden from roles with no money-facing access. */
    private function orderFinancialKeys(): array
    {
        return [
            'subtotal', 'shippingFee', 'courierFee', 'totalAmount', 'total', 'totalPrice',
            'downPayment', 'balance', 'paymentMethod', 'paymentHistory', 'discountAmount',
            'refunds', 'refundOwed',
            'designFee', 'designFeePaid', 'designFeePaidAmount', 'rushFee', 'revisionFees',
        ];
    }

    /**
     * Hide order money from roles that can view orders but have NO money-facing
     * capability (e.g. Production Staff). Admin/Owner/Super Admin and anyone with
     * payments / sales / POS visibility keep the full financial picture unchanged.
     * Accepts a single order (model/array) or a collection; returns array(s).
     */
    private function stripOrderFinancials(Request $request, $orders)
    {
        $user = $request->user();
        $canSeeMoney = \App\Support\Rbac::allows($user, 'payments.view')
            || \App\Support\Rbac::allows($user, 'sales.view')
            || \App\Support\Rbac::allows($user, 'pos');
        if ($canSeeMoney) {
            return $orders; // full financial view — unchanged
        }

        $keys  = $this->orderFinancialKeys();
        $scrub = function ($o) use ($keys) {
            $arr = is_array($o) ? $o : $o->toArray();
            foreach ($keys as $k) unset($arr[$k]);
            if (isset($arr['items']) && is_array($arr['items'])) {
                $arr['items'] = array_map(function ($it) {
                    if (is_array($it)) {
                        unset($it['price'], $it['unitPrice'], $it['lineTotal'], $it['subtotal'], $it['total'], $it['amount']);
                    }
                    return $it;
                }, $arr['items']);
            }
            return $arr;
        };

        if ($orders instanceof \Illuminate\Support\Collection) {
            return $orders->map($scrub)->all();
        }
        if (is_array($orders)) {
            return array_is_list($orders) ? array_map($scrub, $orders) : $scrub($orders);
        }
        return $scrub($orders);
    }

    /**
     * PUT /api/admin/orders/{id}
     * Admin updates order status.
     */
    public function adminUpdate(Request $request, $id)
    {
        try {
            // Editing an order is a financial-capable action → fine-grained `orders.edit`.
            if (!$this->hasPermission($request, 'orders.edit')) {
                return $this->unauthorizedResponse();
            }

            $order = Order::find($id);

            if (!$order) {
                return $this->notFoundResponse('Order');
            }

            $validated = $request->validate([
                'orderStatus'   => 'sometimes|in:Pending,Processing,In Production,For QC,For Delivery,Delivered,Returned,Cancelled,pending_design,proof_sent,revision_requested,design_approved,awaiting_payment,awaiting_production,in_production,for_qc,ready_for_delivery,for_delivery,delivered,cancelled',
                'paymentStatus' => 'sometimes|in:unpaid,partial,paid',
                'notes'         => 'nullable|string|max:1000',
                'shippingFee'   => 'sometimes|numeric|min:0|max:50000',
                // Courier-booked delivery fee — paid by the customer directly to the
                // rider on delivery. Informational only: does NOT change the order total.
                'courierFee'    => 'sometimes|numeric|min:0|max:50000',
                // Admin can adjust the promised delivery window (e.g. production backlog); the
                // customer is notified below when it changes.
                'estimatedDeliveryMin' => 'sometimes|nullable|date',
                'estimatedDeliveryMax' => 'sometimes|nullable|date',
            ]);

            $prevDeliveryMax = $order->estimatedDeliveryMax ?? null;

            // Balance gate — a non-COD order must be fully paid before it can be released for
            // delivery/marked delivered (COD collects on delivery, so it's exempt). Casing-tolerant.
            if (isset($validated['orderStatus'])) {
                $targetNorm = OrderStatus::normalize($validated['orderStatus']);
                // QC decides readiness. Jumping the order past its open job orders skips inspection
                // entirely, and the next QC sync would drag it back to In Production anyway.
                if (in_array($targetNorm, [OrderStatus::READY_FOR_DELIVERY, OrderStatus::FOR_DELIVERY, OrderStatus::DELIVERED], true)) {
                    $openJobs = \App\Models\JobOrder::where('orderId', (string) $order->_id)->get()
                        ->filter(fn ($j) => !in_array($j->joStatus, ['QC_Passed', 'Completed', 'Cancelled'], true));
                    if ($openJobs->isNotEmpty()) {
                        return response()->json(['message' =>
                            $openJobs->count() . ' job order(s) have not passed QC yet. The order is released for delivery by Quality Control.',
                        ], 422);
                    }
                }

                if (in_array($targetNorm, [OrderStatus::FOR_DELIVERY, OrderStatus::DELIVERED], true)) {
                    $isCOD = strtolower((string) ($order->paymentMethod ?? '')) === 'cod';
                    if (!$isCOD && ($order->paymentStatus ?? '') !== 'paid') {
                        return response()->json(['message' => 'The remaining balance must be fully paid before this order can be released for delivery.'], 422);
                    }
                }

                // Production gate — a custom order enters production only by creating a Job Order,
                // which enforces downpayment-paid + design-approved and gives Production/QC a JO to
                // work on. Block a manual jump straight to In Production that would bypass both gates
                // and leave the Production module with nothing to build.
                if ($targetNorm === OrderStatus::IN_PRODUCTION
                    && ($order->isCustomOrder ?? false)
                    && empty($order->joId)) {
                    return response()->json(['message' => 'Create a Job Order to start production. The downpayment must be paid and the design approved first.'], 422);
                }

                // Nothing to produce means no production stage. Without this the UI dropdown was the
                // only thing stopping a shelf-goods order from entering a stage Production and QC
                // have no job order for, and it could never be released from there by QC either.
                if ($targetNorm === OrderStatus::IN_PRODUCTION) {
                    $produces = collect($order->items ?? [])->contains(fn ($it) =>
                        !empty($it['isCustom']) || !empty($it['isMadeToOrder'])
                        || !empty($it['designRequested']) || !empty($it['designUrl'])
                        || !empty($it['designFiles'])
                    );
                    if (!$produces) {
                        return response()->json(['message' => 'Nothing on this order has to be produced - it is ready-made stock. Send it straight to delivery.'], 422);
                    }
                }
            }

            $oldStatus = $order->orderStatus;

            // Store courier info when moving to (Out for) Delivery — casing-tolerant.
            if (isset($validated['orderStatus']) && OrderStatus::normalize($validated['orderStatus']) === OrderStatus::FOR_DELIVERY) {
                $order->courierName    = $request->input('courierName') ?: null;
                $order->trackingNumber = $request->input('trackingNumber') ?: null;
            }

            // Read before the save, not after. update() resyncs the model's originals, so anything
            // that wants to know what a field USED to be has to capture it here.
            $prevCourierFee = (float) ($order->courierFee ?? 0);

            $order->update($validated);

            // Notify the customer when the promised delivery date is moved (e.g. production backlog).
            if (array_key_exists('estimatedDeliveryMax', $validated)
                && (string) ($validated['estimatedDeliveryMax'] ?? '') !== (string) ($prevDeliveryMax ?? '')) {
                try {
                    $when = $validated['estimatedDeliveryMax']
                        ? \Carbon\Carbon::parse($validated['estimatedDeliveryMax'])->format('M j, Y')
                        : null;
                    Notification::create([
                        'user_id'    => (string) $order->userId,
                        'type'       => 'delivery_date_updated',
                        'title'      => 'Delivery Date Updated',
                        'message'    => 'The estimated delivery for order #' .
                            strtoupper(substr((string) $order->_id, -8)) .
                            ($when ? ' is now ' . $when . '.' : ' has been updated.') .
                            ' The date is our best effort and may still shift; we will keep you posted.',
                        'is_read'    => false,
                        'data'       => ['orderId' => (string) $order->_id, 'estimatedDeliveryMax' => $validated['estimatedDeliveryMax'] ?? null],
                        'created_at' => now(),
                    ]);
                } catch (\Exception $e) {
                    Log::warning('adminUpdate: delivery-date notification failed', ['error' => $e->getMessage()]);
                }
            }

            // When shipping fee is updated, derive subtotal from existing data and recalculate total
            if (isset($validated['shippingFee'])) {
                $prevShipping = (float) ($order->getOriginal('shippingFee') ?? $order->shippingFee ?? 0);
                $subtotal = (float) ($order->subtotal ?? ($order->totalAmount - $prevShipping));
                $order->totalAmount = round($subtotal + (float) $validated['shippingFee'], 2);
                $order->save();
            }

            // Courier-booked delivery fee: store as informational only (paid by the
            // customer to the rider on delivery — NOT added to the shop's order total).
            // Notify the customer so they have cash ready.
            if (array_key_exists('courierFee', $validated)) {
                $newFee = (float) $validated['courierFee'];
                $prevFee = $prevCourierFee;
                // update() above has already persisted it; this only keeps the in-memory model
                // consistent for the notification payloads below.
                $order->courierFee = $newFee;

                if ($newFee > 0 && abs($newFee - $prevFee) > 0.001) {
                    try {
                        Notification::create([
                            'user_id'    => (string) $order->userId,
                            'type'       => 'delivery_fee_set',
                            'title'      => 'Delivery Fee',
                            'message'    => 'Your delivery fee for order #' .
                                strtoupper(substr((string) $order->_id, -8)) .
                                ' is ₱' . number_format($newFee, 2) .
                                '. You can pay this in cash to the rider on delivery, or send it '
                                . 'ahead via GCash or Maya. It is separate from the item total.',
                            'is_read'    => false,
                            'data'       => ['orderId' => (string) $order->_id, 'courierFee' => $newFee],
                            'created_at' => now(),
                        ]);
                        $this->postOrderCardToChat(
                            $order,
                            'delivery_fee',
                            'Your order has been booked with a third-party courier. The delivery fee is P'
                                . number_format($newFee, 2) . '. You can hand this to the rider in cash on '
                                . 'delivery, or send it ahead via GCash or Maya and we will confirm here. '
                                . 'This is the courier\'s charge - it is not part of the item total you already paid.',
                            ['courierFee' => $newFee]
                        );
                    } catch (\Exception $e) {
                        Log::warning('adminUpdate: courier fee notification failed', ['error' => $e->getMessage()]);
                    }
                }
            }

            // Handle cancellation: cancel linked JobOrder and restore inventory
            if (isset($validated['orderStatus']) && $order->orderStatus === 'Cancelled' && $oldStatus !== 'Cancelled') {
                $this->cancelLinkedJobOrder($order);
                $this->restoreStockOnCancel($order);
            }

            // Handle return: restore inventory
            if (isset($validated['orderStatus']) && $order->orderStatus === 'Returned' && $oldStatus !== 'Returned') {
                $this->restoreInventoryOnReturn($order);
            }

            // Log activity if status changed
            // Balance-due-before-delivery reminder when an admin moves the order to Ready for Delivery.
            if (isset($validated['orderStatus']) && $oldStatus !== $order->orderStatus
                && OrderStatus::normalize($order->orderStatus) === OrderStatus::READY_FOR_DELIVERY) {
                $rfdCOD     = strtolower((string) ($order->paymentMethod ?? '')) === 'cod';
                $rfdBalance = $order->balance !== null && $order->balance !== ''
                    ? (float) $order->balance
                    : max(0, (float) ($order->totalAmount ?? 0) - (float) ($order->downPayment ?? 0));
                if (!$rfdCOD && ($order->paymentStatus ?? '') !== 'paid' && $rfdBalance > 0) {
                    try {
                        Notification::create([
                            'user_id'    => (string) $order->userId,
                            'type'       => 'balance_due_before_delivery',
                            'title'      => 'Ready Soon - Balance Due',
                            'message'    => 'Your order #' . strtoupper(substr((string) $order->_id, -8)) .
                                ' is ready. Please settle the remaining balance of P' . number_format($rfdBalance, 2) .
                                ' in My Orders so we can release it for delivery.',
                            'is_read'    => false,
                            'data'       => ['orderId' => (string) $order->_id, 'balance' => $rfdBalance],
                            'created_at' => now(),
                        ]);
                    } catch (\Exception $e) {
                        Log::warning('adminUpdate: balance-due notification failed', ['error' => $e->getMessage()]);
                    }
                }
            }

            if (isset($validated['orderStatus']) && $oldStatus !== $order->orderStatus) {
                try {
                    $adminUser = $request->user();
                    ActivityLog::create([
                        'action'           => 'order_status_changed',
                        'entityType'       => 'order',
                        'entityId'         => (string) $order->_id,
                        'description'      => "Order status changed from {$oldStatus} to {$order->orderStatus}",
                        'performedBy'      => $adminUser
                            ? trim("{$adminUser->firstName} {$adminUser->lastName}")
                            : 'admin',
                        'performedByEmail' => $adminUser->email ?? null,
                        'metadata'         => [
                            'oldStatus' => $oldStatus,
                            'newStatus' => $order->orderStatus,
                            'orderId'   => (string) $order->_id,
                        ],
                        'createdAt'        => now(),
                    ]);
                } catch (\Exception $logErr) {
                    Log::warning('ActivityLog write failed (adminUpdate)', [
                        'error' => $logErr->getMessage(),
                    ]);
                }
            }

            // Handle completion: Create sales records and deduct inventory
            if ($order->orderStatus === 'Delivered' && $oldStatus !== 'Delivered') {
                $this->completeOrder($order);
            }

            // Notify customer if status changed
            if (isset($validated['orderStatus']) && $oldStatus !== $order->orderStatus) {
                try {
                    $customerEmail = $order->userSnapshot['email']
                        ?? optional(User::find($order->userId))->email
                        ?? null;
                    $customerName  = $order->userSnapshot['name'] ?? '';
                    $firstName     = explode(' ', trim($customerName))[0] ?? 'Customer';
                    if ($customerEmail) {
                        Mail::to($customerEmail)->send(new OrderStatusMail(
                            firstName:   $firstName,
                            orderId:     (string) $order->_id,
                            newStatus:   $order->orderStatus,
                            totalAmount: (float) ($order->totalAmount ?? 0)
                        ));
                    }
                } catch (\Exception $e) {
                    Log::error('OrderController @adminUpdate: Failed to send status email', [
                        'order_id' => (string) $order->_id,
                        'error'    => $e->getMessage(),
                    ]);
                }
            }

            return $this->successResponse('Order updated successfully.', $order);
        } catch (\Illuminate\Validation\ValidationException $e) {
            return $this->validationErrorResponse($e);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'An unexpected error occurred while updating the order.');
        }
    }

    /**
     * GET /api/admin/orders/stats
     * Returns order statistics for the admin dashboard.
     */
    public function stats(Request $request)
    {
        try {
            if (!$this->hasPermission($request, 'orders')) {
                return $this->unauthorizedResponse();
            }

            $cacheKey = 'admin_order_stats_' . md5($request->getQueryString() ?? '');
            $data = Cache::remember($cacheKey, 30, function () use ($request) {
                $base = Order::query()
                    ->when($request->filled('startDate'), fn($q) => $q->where('createdAt', '>=', $request->startDate))
                    ->when($request->filled('endDate'),   fn($q) => $q->where('createdAt', '<=', $request->endDate));

                $totalOrders     = (clone $base)->count();
                $pendingOrders   = (clone $base)->where('orderStatus', 'Pending')->count();
                $completedOrders = (clone $base)->where('orderStatus', 'Delivered')->count();
                $cancelledOrders = (clone $base)->where('orderStatus', 'Cancelled')->count();
                $totalRevenue    = (clone $base)->where('orderStatus', 'Delivered')->sum('totalAmount');

                $cancellationRate = $totalOrders > 0
                    ? round(($cancelledOrders / $totalOrders) * 100, 2)
                    : 0;

                return [
                    'totalOrders'      => $totalOrders,
                    'pendingOrders'    => $pendingOrders,
                    'completedOrders'  => $completedOrders,
                    'cancelledOrders'  => $cancelledOrders,
                    'totalRevenue'     => $totalRevenue,
                    'cancellationRate' => $cancellationRate,
                ];
            });

            return $this->successResponse('Order statistics fetched successfully.', $data);
        } catch (\Throwable $e) {
            return $this->serverErrorResponse($e, 'An unexpected error occurred while fetching order statistics.');
        }
    }

    /**
     * Processes completion of an order: creates sales and deducts stock.
     */
    private function completeOrder(Order $order): void
    {
        try {
            // Idempotency guard — if sales already exist for this order, skip entirely
            $existingSale = Sale::where('notes', 'like', '%' . ($order->orderId ?? $order->_id) . '%')->first();
            if ($existingSale) {
                Log::warning('completeOrder: sales already exist for order, skipping to prevent duplication', [
                    'orderId' => (string) $order->_id,
                ]);
                return;
            }

            foreach ($order->items as $item) {
                $product = Product::find($item['productId']);
                if (!$product) continue;

                $inventory = null;
                if ($product->inventoryId) {
                    $inventory = Inventory::find($product->inventoryId);
                    if (!$inventory) {
                        Log::warning('completeOrder: inventory record not found for product', [
                            'orderId'     => $order->_id,
                            'productId'   => $item['productId'],
                            'inventoryId' => $product->inventoryId,
                        ]);
                    }
                }

                // 1. Always create Sale Record (even for custom products with no inventory)
                $newSaleId = 'SALE-' . strtoupper(substr(str_replace('-', '',
                    \Illuminate\Support\Str::uuid()->toString()), 0, 8));

                // COGS resolved from BOM → inventory → product cost, so profit is correct even when
                // there is no directly-linked inventory item (services, finished goods with a buy price).
                $cost        = \App\Support\CostResolver::lineCost($product, $item['qty']);
                $profit      = $item['lineTotal'] - $cost;
                $variantName = $item['variantName'] ?? '';

                Sale::create([
                    'saleId'          => $newSaleId,
                    'inventoryId'     => $inventory ? (string) $inventory->_id : null,
                    'productName'     => $product->name . ($variantName ? " ({$variantName})" : ""),
                    'category'        => $product->category,
                    'quantity'        => $item['qty'],
                    'unitPrice'       => $item['unitPrice'],
                    'totalPrice'      => $item['lineTotal'],
                    'cost'            => $cost,
                    'profit'          => $profit,
                    'saleDate'        => $order->createdAt ?? now(),
                    'customerName'    => $order->userSnapshot['name'] ?? 'Online Customer',
                    'customerEmail'   => $order->userSnapshot['email'] ?? null,
                    'source'          => 'online',
                    'status'          => 'completed',
                    'notes'           => "From Order: " . ($order->orderId ?? $order->_id),
                    'createdAt'       => now(),
                ]);

                // 3. Increment Flash Sale stockUsed (if item was part of a flash sale)
                if (!empty($item['flashSaleId'])) {
                    try {
                        $flashSale = FlashSale::find($item['flashSaleId']);
                        if ($flashSale && $flashSale->isActive) {
                            $flashSale->stockUsed = ($flashSale->stockUsed ?? 0) + $item['qty'];
                            if ($flashSale->stockLimit !== null &&
                                $flashSale->stockUsed >= $flashSale->stockLimit) {
                                $flashSale->isActive = false;
                            }
                            $flashSale->save();
                        }
                    } catch (\Exception $flashErr) {
                        Log::warning('completeOrder: failed to update flash sale stockUsed', [
                            'orderId'     => (string) $order->_id,
                            'flashSaleId' => $item['flashSaleId'],
                            'error'       => $flashErr->getMessage(),
                        ]);
                    }
                }

                // BOM materials are deducted at order creation (store/initiatePayment), not here.
            }
        } catch (\Exception $e) {
            Log::error('OrderController@completeOrder: Failed for order ' . $order->_id, ['error' => $e->getMessage()]);
            // We don't throw exception here to avoid failing the order update,
            // but we log it for manual intervention.
        }
    }

    /**
     * Deduct inventory via FIFO across batches.
     * Mirrors WalkInOrderController::deductInventoryFIFO but takes a
     * $reason for the StockHistory record.
     */
    private function deductInventoryFIFO(
        Inventory $inventory,
        int $qty,
        string $reason,
        float $unitPrice = 0.0,
        ?string $orderId = null,
        ?string $productId = null,
        ?string $productName = null,
        ?string $customerName = null,
    ): void {
        $qty = max(0, $qty);
        if ($qty <= 0) return;

        $batches = $inventory->batches ?? [];
        usort($batches, function ($a, $b) {
            return strtotime($a['dateReceived'] ?? '0')
                <=> strtotime($b['dateReceived'] ?? '0');
        });

        $available = array_reduce($batches, function ($carry, $b) {
            return $carry + ($b['remainingQty'] ?? $b['goodQty'] ?? 0);
        }, 0);

        if ($available < $qty) {
            Log::warning('OrderController@deductInventoryFIFO: insufficient batch stock', [
                'inventoryId' => (string) $inventory->_id,
                'requested'   => $qty,
                'available'   => $available,
            ]);
            // Fall back to stockQty only — batches may be unpopulated
            $inventory->stockQty = max(0, (int) ($inventory->stockQty ?? 0) - $qty);
            $inventory->updatedAt = now();
            $inventory->save();
            StockHistory::create([
                'inventoryId'  => (string) $inventory->_id,
                'quantity'     => $qty,
                'remainingQty' => $inventory->stockQty,
                'unitCost'     => $this->unitCostOf($inventory),
                'totalCost'    => $this->unitCostOf($inventory) * $qty,
                'reason'       => $reason,
                'type'         => 'deduction',
                'orderId'      => $orderId,
                'productId'    => $productId,
                'productName'  => $productName,
                'customerName' => $customerName,
                'remarks'      => $orderId ? "Order: {$orderId}" : null,
                'createdAt'    => now(),
            ]);
            try {
                AuditLog::create([
                    'inventoryId'  => (string) $inventory->_id,
                    'productName'  => $inventory->name ?? 'Unknown',
                    'category'     => $inventory->category ?? 'Uncategorized',
                    'reason'       => $reason,
                    'quantity'     => -$qty,
                    'stockBefore'  => $inventory->stockQty + $qty,
                    'stockAfter'   => $inventory->stockQty,
                    'unitCost'     => $this->unitCostOf($inventory),
                    'totalCost'    => (float) ($this->unitCostOf($inventory) * $qty),
                    'remarks'      => $orderId ? "Order: {$orderId}" : '',
                    'performedBy'  => 'system',
                    'createdAt'    => now(),
                ]);
            } catch (\Exception $auditEx) {
                Log::warning('AuditLog write failed (OrderController@deductInventoryFIFO)', ['error' => $auditEx->getMessage()]);
            }
            return;
        }

        $remaining = $qty;
        $batchDeductions = [];
        foreach ($batches as &$batch) {
            if ($remaining <= 0) break;
            $batchQty = $batch['remainingQty'] ?? $batch['goodQty'] ?? 0;
            if ($batchQty <= 0) continue;
            $deduct = min($batchQty, $remaining);
            $batch['remainingQty'] = $batchQty - $deduct;
            $remaining -= $deduct;
            // A batch recorded without a unit cost used to price the sale at zero, and zero cost is
            // not "unknown" to Reports - it is pure profit. A ready-made sale showed a cost of goods
            // of P0.00 against a material carrying a base cost of P32. Fall back to what the item
            // itself knows rather than booking it free.
            $batchCost = (float) ($batch['unitCost'] ?? 0);
            if ($batchCost <= 0) $batchCost = $this->unitCostOf($inventory);
            $batchDeductions[] = [
                'batchId'  => $batch['batchId'] ?? null,
                'qty'      => $deduct,
                'unitCost' => $batchCost,
            ];
        }
        unset($batch);

        $newStock = max(0, (int) ($inventory->stockQty ?? 0) - $qty);
        $inventory->batches   = $batches;
        $inventory->stockQty  = $newStock;
        $inventory->updatedAt = now();
        $inventory->save();

        $runningRemaining = $newStock + $qty;
        foreach ($batchDeductions as $bd) {
            $runningRemaining -= $bd['qty'];
            StockHistory::create([
                'inventoryId'  => (string) $inventory->_id,
                'quantity'     => $bd['qty'],
                'remainingQty' => $runningRemaining,
                'unitCost'     => $bd['unitCost'],
                'totalCost'    => $bd['qty'] * $bd['unitCost'],
                'reason'       => $reason,
                'type'         => 'deduction',
                'batchId'      => $bd['batchId'],
                'sellingPrice' => $unitPrice,
                'orderId'      => $orderId,
                'productId'    => $productId,
                'productName'  => $productName,
                'customerName' => $customerName,
                'remarks'      => $orderId ? "Order: {$orderId}" : null,
                'performedBy'  => 'system',
                'createdAt'    => now(),
            ]);
        }
        try {
            AuditLog::create([
                'inventoryId'  => (string) $inventory->_id,
                'productName'  => $inventory->name ?? 'Unknown',
                'category'     => $inventory->category ?? 'Uncategorized',
                'reason'       => $reason,
                'quantity'     => -$qty,
                'stockBefore'  => $newStock + $qty,
                'stockAfter'   => $newStock,
                'unitCost'     => $this->unitCostOf($inventory),
                'totalCost'    => (float) ($this->unitCostOf($inventory) * $qty),
                'remarks'      => $orderId ? "Order: {$orderId}" : '',
                'performedBy'  => 'system',
                'createdAt'    => now(),
            ]);
        } catch (\Exception $auditEx) {
            Log::warning('AuditLog write failed (OrderController@deductInventoryFIFO)', ['error' => $auditEx->getMessage()]);
        }
    }

    // ─── Admin API Endpoints (New Schema) ─────────────────────────────────────

    /**
     * DELETE /api/admin/orders/{id}
     * Soft-deletes (archives) an order. Owner/Admin only.
     */
    public function hardDelete(Request $request, $id)
    {
        try {
            $user = $request->user();
            if (!$this->hasPermission($request, 'orders.delete')) {
                return response()->json(['error' => 'Forbidden'], 403);
            }

            $order = Order::find($id);
            if (!$order) {
                return response()->json(['error' => 'Order not found'], 404);
            }

            $order->isArchived = true;
            $order->archivedAt = now();
            $order->save();

            return response()->json(['message' => 'Order archived']);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'Failed to archive order.');
        }
    }

    /**
     * GET /api/orders
     * Returns all orders for admin dashboard (new schema).
     */
    public function index(Request $request)
    {
        try {
            $user = $request->user();

            if (!$user) {
                return response()->json(['error' => 'Unauthorized'], 401);
            }

            if (!$this->hasPermission($request, 'orders')) {
                return $this->unauthorizedResponse();
            }

            $limit = min(max((int) $request->input('limit', 50), 1), 200);
            $page = max((int) $request->input('page', 1), 1);
            $skip = ($page - 1) * $limit;

            $showArchived = $request->boolean('showArchived', false);

            $query = Order::select($this->orderListFields())
                ->orderBy('createdAt', 'desc')
                ->skip($skip)
                ->limit($limit);

            if (!$showArchived) {
                $query->where('isArchived', '!=', true);
            }

            $orders = $query->get();

            return response()->json(['orders' => $this->stripOrderFinancials($request, $orders)]);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'An unexpected error occurred while fetching orders.');
        }
    }

    /**
     * GET /api/orders/{id}
     * Returns a single order by ID (new schema).
     */
    public function show(Request $request, $id)
    {
        try {
            $user = $request->user();

            if (!$user) {
                return response()->json(['error' => 'Unauthorized'], 401);
            }

            if (!$this->hasPermission($request, 'orders')) {
                return $this->unauthorizedResponse();
            }

            // Try exact _id match first
            $order = Order::find($id);

            // Fall back to suffix match if not found and input looks like a short code
            // (8 hex chars, case-insensitive — matches the #XXXXXXXX shown on receipts)
            if (!$order && preg_match('/^[0-9a-fA-F]{8}$/', $id)) {
                $order = Order::whereRaw([
                    '$expr' => [
                        '$eq' => [
                            ['$substr' => [['$toString' => '$_id'], 16, 8]],
                            strtolower($id),
                        ],
                    ],
                ])->first();
            }

            if (!$order) {
                return response()->json(['error' => 'Order not found'], 404);
            }

            return response()->json(['order' => $this->stripOrderFinancials($request, $order)]);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'An unexpected error occurred while fetching the order.');
        }
    }

    /**
     * PATCH /api/orders/{id}/status
     * Admin updates order status only.
     */
    public function updateStatus(Request $request, $id)
    {
        try {
            $user = $request->user();

            if (!$user) {
                return response()->json(['error' => 'Unauthorized'], 401);
            }

            // Production Staff may advance status without holding full order edit.
            if (!$this->hasPermission($request, 'orders.updateStatus')) {
                return $this->unauthorizedResponse();
            }

            $validated = $request->validate([
                'orderStatus' => 'required|string',
            ]);

            $order = Order::find($id);

            if (!$order) {
                return response()->json(['error' => 'Order not found'], 404);
            }

            // Phase 1: validate transitions canonically (casing-tolerant) but STORE the raw value
            // unchanged — the admin Orders UI still reads the legacy casing until its focused rewire.
            $newRaw    = $validated['orderStatus'];
            $oldStatus = OrderStatus::normalize($order->orderStatus);
            $newStatus = OrderStatus::normalize($newRaw);

            if (!in_array($newStatus, OrderStatus::all(), true)) {
                return response()->json([
                    'error' => "Unknown order status: '{$validated['orderStatus']}'.",
                ], 422);
            }

            // Enforce valid status transitions (canonical machine)
            if ($oldStatus !== $newStatus && !OrderStatus::canTransition($oldStatus, $newStatus)) {
                return response()->json([
                    'error' => "Invalid transition: cannot move from '" . OrderStatus::label($oldStatus) . "' to '" . OrderStatus::label($newStatus) . "'.",
                ], 422);
            }

            // Payment gate — downpayment required before entering production
            // COD orders are exempt from this gate if paymentMethod is 'cod'
            // or if at least one payment has been recorded via paymentHistory.
            if ($newStatus === OrderStatus::IN_PRODUCTION) {
                $downPayment    = $order->downPayment ?? 0;
                $paymentMethod  = $order->paymentMethod ?? '';
                $paymentHistory = $order->paymentHistory ?? [];
                $paymentStatus  = $order->paymentStatus ?? '';

                $hasCodMethod    = $paymentMethod === 'cod';
                $hasAnyPayment   = $downPayment > 0 || count($paymentHistory) > 0 || $paymentStatus === 'paid';

                if (!$hasCodMethod && !$hasAnyPayment) {
                    return response()->json([
                        'error' => 'A downpayment is required before moving this order to production. Please collect at least a partial payment first.',
                    ], 422);
                }
            }

            // Courier required when moving to Out for Delivery
            if ($newStatus === OrderStatus::FOR_DELIVERY) {
                $validated2 = $request->validate([
                    'courierName'    => 'required|string|max:100',
                    'trackingNumber' => 'nullable|string|max:200',
                ]);
                $order->courierName    = $validated2['courierName'];
                $order->trackingNumber = $validated2['trackingNumber'] ?? null;
            }

            $order->orderStatus    = $newRaw;
            $order->updatedAt      = now();
            $history               = $order->statusHistory ?? [];
            $history[]             = ['status' => $newRaw, 'at' => now()->toISOString()];
            $order->statusHistory  = $history;
            $order->save();

            // Broadcast status update to order subscribers and admin channel
            try {
                broadcast(new OrderStatusUpdated(
                    (string) $order->_id,
                    $order->orderStatus,
                    trim(($user->firstName ?? '') . ' ' . ($user->lastName ?? '')) ?: null
                ))->toOthers();
            } catch (\Throwable $e) {
                Log::warning('OrderController@updateStatus: broadcast failed', ['error' => $e->getMessage()]);
            }

            // Handle completion: create sales records and deduct inventory
            if ($newStatus === OrderStatus::DELIVERED && $oldStatus !== OrderStatus::DELIVERED) {
                $this->completeOrder($order);
            }

            // Handle cancellation: cancel linked JobOrder and restore inventory
            if ($newStatus === OrderStatus::CANCELLED) {
                $this->cancelLinkedJobOrder($order);
                if ($oldStatus !== OrderStatus::CANCELLED) {
                    $this->restoreStockOnCancel($order);

                    // Why the SHOP cancelled. Returns record a reason and a customer's own
                    // cancellation records a reason; this path recorded nothing, so the one
                    // cancellation the customer did not ask for was the one nobody could explain.
                    $reason = trim((string) $request->input('cancelReason', ''));
                    $order->cancelledBy     = 'admin';
                    $order->cancelledReason = $reason !== '' ? mb_substr($reason, 0, 500) : null;
                    $order->cancelledAt     = now();

                    // The money. `refundAmount` lets the shop keep a deposit when work had already
                    // started - personalised goods cannot be resold, which is what a deposit is for
                    // - but the DEFAULT is everything received, because a shop that cancels an
                    // order nobody has made yet is not entitled to any of it.
                    $paid = $this->paidSoFar($order);
                    $refund = $request->has('refundAmount')
                        ? max(0, min($paid, (float) $request->input('refundAmount')))
                        : $paid;
                    $this->recordRefundOwed(
                        $order,
                        $refund,
                        $reason !== ''
                            ? 'Cancelled by the shop - ' . mb_substr($reason, 0, 200)
                            : 'Cancelled by the shop',
                        trim(($user->firstName ?? '') . ' ' . ($user->lastName ?? '')) ?: null
                    );
                    $order->save();

                    try {
                        Notification::create([
                            'user_id'    => (string) $order->userId,
                            'type'       => 'order_cancelled',
                            'title'      => 'Order Cancelled',
                            'message'    => 'Order #' . strtoupper(substr((string) $order->_id, -8))
                                . ' was cancelled by the shop.'
                                . ($reason !== '' ? ' Reason: ' . mb_substr($reason, 0, 200) : '')
                                . ($refund > 0 ? ' A refund of P' . number_format($refund, 2) . ' is being arranged.' : ''),
                            'is_read'    => false,
                            'data'       => ['orderId' => (string) $order->_id],
                            'created_at' => now(),
                        ]);
                    } catch (\Exception $e) {
                        Log::warning('updateStatus: cancel notification failed', ['error' => $e->getMessage()]);
                    }
                }
            }

            // Handle return: restore inventory
            if ($newStatus === OrderStatus::RETURNED && $oldStatus !== OrderStatus::RETURNED) {
                // Why it came back is the difference between a courier problem, a quality problem and
                // a customer who changed their mind - and only the log tells them apart later.
                $order->returnReason = trim((string) $request->input('returnReason', '')) ?: null;
                $order->returnedAt   = now();
                $order->save();

                $this->restoreInventoryOnReturn($order, filter_var($request->input('restock', false), FILTER_VALIDATE_BOOLEAN));
            }

            // Log activity
            try {
                ActivityLog::create([
                    'action'           => 'order_status_changed',
                    'entityType'       => 'order',
                    'entityId'         => (string) $order->_id,
                    'description'      => "Order status changed from {$oldStatus} to {$order->orderStatus}",
                    'performedBy'      => $user->firstName . ' ' . $user->lastName,
                    'performedByEmail' => $user->email ?? null,
                    'metadata'         => [
                        'oldStatus' => $oldStatus,
                        'newStatus' => $order->orderStatus,
                        'orderId'   => (string) $order->_id,
                    ],
                    'createdAt'        => now(),
                ]);
            } catch (\Exception $logErr) {
                Log::warning('ActivityLog write failed (updateStatus)', [
                    'error' => $logErr->getMessage(),
                ]);
            }

            // Notify customer on status change
            if ($oldStatus !== $order->orderStatus) {
                try {
                    $customerEmail = $order->userSnapshot['email']
                        ?? optional(User::find($order->userId))->email
                        ?? null;
                    $customerName  = $order->userSnapshot['name'] ?? '';
                    $firstName     = explode(' ', trim($customerName))[0] ?? 'Customer';
                    if ($customerEmail) {
                        Mail::to($customerEmail)->send(new OrderStatusMail(
                            firstName:   $firstName,
                            orderId:     (string) $order->_id,
                            newStatus:   $order->orderStatus,
                            totalAmount: (float) ($order->totalAmount ?? 0)
                        ));
                    }
                } catch (\Exception $e) {
                    Log::error('OrderController @updateStatus: Failed to send status email', [
                        'order_id' => (string) $order->_id,
                        'error'    => $e->getMessage(),
                    ]);
                }
            }

            return response()->json([
                'message' => 'Status updated',
                'order'   => $order,
            ]);
        } catch (\Illuminate\Validation\ValidationException $e) {
            return $this->validationErrorResponse($e);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'An unexpected error occurred while updating the order status.');
        }
    }

    /**
     * Restores product inventory when an order is cancelled.
     * Mirrors the immediate deduction done in store().
     */
    /**
     * Public door onto the same release, for callers outside this controller (the payment page's
     * abandoned-checkout cleanup). Kept as a wrapper so the release logic itself stays in one place.
     */
    public function releaseReservationsFor(Order $order): void
    {
        $this->restoreStockOnCancel($order);
    }

    private function restoreStockOnCancel(Order $order): void
    {
        try {
            foreach ($order->items as $item) {
                $product = Product::find($item['productId'] ?? null);
                if (!$product || !$product->inventoryId) continue;
                $inv = Inventory::find($product->inventoryId);
                if (!$inv || $inv->isOnDemand) continue;
                $qty = (int) ($item['qty'] ?? 0);
                if ($qty <= 0) continue;

                // Atomic restore — mirrors the atomic reservation on order creation
                $updated = DB::connection('mongodb')
                    ->getCollection('inventories')
                    ->findOneAndUpdate(
                        ['_id' => new \MongoDB\BSON\ObjectId((string) $inv->_id)],
                        ['$inc' => ['stockQty' => $qty]],
                        ['returnDocument' => \MongoDB\Operation\FindOneAndUpdate::RETURN_DOCUMENT_AFTER]
                    );

                $newQty = (int) ($updated->stockQty ?? (($inv->stockQty ?? 0) + $qty));

                StockHistory::create([
                    'inventoryId'  => (string) $inv->_id,
                    'quantity'     => $qty,
                    'remainingQty' => $newQty,
                    'unitCost'     => $this->unitCostOf($inv),
                    'totalCost'    => 0,
                    'reason'       => 'order_cancelled',
                    'type'         => 'adjustment',
                    'performedBy'  => 'system',
                    'remarks'      => 'Order cancelled: ' . (string) $order->_id,
                    'createdAt'    => now(),
                ]);
                try {
                    AuditLog::create([
                        'inventoryId'  => (string) $inv->_id,
                        'productName'  => $inv->name ?? 'Unknown',
                        'category'     => $inv->category ?? 'Uncategorized',
                        'reason'       => 'return',
                        'quantity'     => $qty,
                        'stockBefore'  => $newQty - $qty,
                        'stockAfter'   => $newQty,
                        'unitCost'     => $this->unitCostOf($inv),
                        'totalCost'    => 0.0,
                        'remarks'      => 'Order cancelled: ' . (string) $order->_id,
                        'performedBy'  => 'system',
                        'createdAt'    => now(),
                    ]);
                } catch (\Exception $auditEx) {
                    Log::warning('AuditLog write failed (OrderController@restoreStockOnCancel)', ['error' => $auditEx->getMessage()]);
                }
            }

            // A quote-converted order holds materials the ADMIN chose when drafting the quote,
            // in the admin's own quantities - not the product's BOM. Releasing it through the
            // BOM path below would release the wrong amount, or nothing at all when the quoted
            // service has no BOM, and the real hold would never come back. Release what was
            // actually taken, then skip the BOM path so nothing is released twice.
            if (!empty($order->quoteReservations)) {
                foreach ($order->quoteReservations as $held) {
                    try {
                        $inv = Inventory::find($held['inventoryId'] ?? null);
                        $qty = (int) ($held['qty'] ?? 0);
                        if (!$inv || $inv->isOnDemand || $qty <= 0) continue;
                        $inv->reservedQty = max(0, (int) ($inv->reservedQty ?? 0) - $qty);
                        $inv->save();
                        StockHistory::create([
                            'inventoryId'  => (string) $inv->_id,
                            'quantity'     => $qty,
                            'remainingQty' => (int) ($inv->stockQty ?? 0),
                            'unitCost'     => $this->unitCostOf($inv),
                            'totalCost'    => 0,
                            'reason'       => 'reservation_released',
                            'type'         => 'reservation',
                            'performedBy'  => 'system',
                            'orderId'      => (string) $order->_id,
                            'customerName' => $order->userSnapshot['name'] ?? '',
                            'remarks'      => 'Quote order cancelled (reservation released): ' . (string) $order->_id,
                            'createdAt'    => now(),
                        ]);
                    } catch (\Throwable $e) {
                        Log::warning('restoreStockOnCancel: quote reservation release failed', [
                            'orderId' => (string) $order->_id,
                            'error'   => $e->getMessage(),
                        ]);
                    }
                }
                return;
            }

            // Restore BOM raw materials deducted at order creation
            foreach ($order->items as $item) {
                $bomProduct = Product::find($item['productId'] ?? null);
                if (!$bomProduct) continue;
                $variantId = $item['variantId'] ?? null;

                // Same three-path BOM lookup used at order creation
                $bom = null;
                if (!empty($bomProduct->bomGroupName) && $variantId) {
                    $bom = BillOfMaterial::find($variantId);
                } elseif (!empty($bomProduct->bomId)) {
                    $bom = BillOfMaterial::find($bomProduct->bomId);
                }
                if (!$bom && $variantId && !empty($bomProduct->combinations)) {
                    foreach ($bomProduct->combinations as $combo) {
                        if ((string) ($combo['id'] ?? $combo['_id'] ?? '') === (string) $variantId && !empty($combo['bomId'])) {
                            $bom = BillOfMaterial::find($combo['bomId']);
                            break;
                        }
                    }
                }

                if (!$bom || empty($bom->components)) continue;
                $producedItem = $this->lineIsProduced($bomProduct, (array) $item);
                try {
                    foreach ($bom->components as $component) {
                        $rawInv = Inventory::find($component['inventoryId'] ?? null);
                        if (!$rawInv || $rawInv->isOnDemand) continue;
                        $qty = (int) round(($component['qty'] ?? 0) * ($item['qty'] ?? 0));
                        if ($qty <= 0) continue;
                        if ($producedItem) {
                            // Materials were RESERVED (consumed only at QC) → release the reservation.
                            $rawInv->reservedQty = max(0, (int) ($rawInv->reservedQty ?? 0) - $qty);
                            $rawInv->save();
                            StockHistory::create([
                                'inventoryId'  => (string) $rawInv->_id,
                                'quantity'     => $qty,
                                'remainingQty' => (int) ($rawInv->stockQty ?? 0),
                                'unitCost'     => $this->unitCostOf($rawInv),
                                'totalCost'    => 0,
                                'reason'       => 'reservation_released',
                                'type'         => 'reservation',
                                'performedBy'  => 'system',
                                'orderId'      => (string) $order->_id,
                                'productId'    => (string) ($bomProduct->_id ?? ''),
                                'productName'  => $bomProduct->name ?? '',
                                'customerName' => $order->userSnapshot['name'] ?? '',
                                'remarks'      => 'Order cancelled (reservation released): ' . (string) $order->_id,
                                'createdAt'    => now(),
                            ]);
                            continue;
                        }
                        $updated = DB::connection('mongodb')
                            ->getCollection('inventories')
                            ->findOneAndUpdate(
                                ['_id' => new \MongoDB\BSON\ObjectId((string) $rawInv->_id)],
                                ['$inc' => ['stockQty' => $qty]],
                                ['returnDocument' => \MongoDB\Operation\FindOneAndUpdate::RETURN_DOCUMENT_AFTER]
                            );
                        $newQty = (int) ($updated->stockQty ?? (($rawInv->stockQty ?? 0) + $qty));
                        StockHistory::create([
                            'inventoryId'  => (string) $rawInv->_id,
                            'quantity'     => $qty,
                            'remainingQty' => $newQty,
                            'unitCost'     => $this->unitCostOf($rawInv),
                            'totalCost'    => 0,
                            'reason'       => 'order_cancelled',
                            'type'         => 'adjustment',
                            'performedBy'  => 'system',
                            'orderId'      => (string) $order->_id,
                            'productId'    => (string) ($bomProduct->_id ?? ''),
                            'productName'  => $bomProduct->name ?? '',
                            'customerName' => $order->userSnapshot['name'] ?? '',
                            'remarks'      => 'Order cancelled (BOM restore): ' . (string) $order->_id,
                            'createdAt'    => now(),
                        ]);
                    }
                } catch (\Exception $bomErr) {
                    Log::warning('restoreStockOnCancel: BOM restore failed', [
                        'orderId'   => (string) $order->_id,
                        'productId' => $item['productId'],
                        'error'     => $bomErr->getMessage(),
                    ]);
                }
            }
        } catch (\Exception $e) {
            Log::error('restoreStockOnCancel: failed', [
                'orderId' => (string) $order->_id,
                'error'   => $e->getMessage(),
            ]);
        }
    }

    /**
     * Cancels the linked JobOrder when an Order is cancelled.
     * Prevents production staff from continuing work on a dead order.
     */
    private function cancelLinkedJobOrder(Order $order): void
    {
        try {
            // A multi-item order has one job order per item — cancel ALL of them that are still
            // in-flight, not just the first, or the rest orphan in Production/QC.
            $jobOrders = \App\Models\JobOrder::where('orderId', (string) $order->_id)
                ->whereIn('joStatus', ['Queued', 'In Progress'])
                ->get();

            foreach ($jobOrders as $jobOrder) {
                $jobOrder->joStatus  = 'Cancelled';
                $jobOrder->updatedAt = now();
                $jobOrder->save();

                Log::info('cancelLinkedJobOrder: JobOrder cancelled', [
                    'orderId'    => (string) $order->_id,
                    'jobOrderId' => (string) $jobOrder->_id,
                ]);
            }
        } catch (\Exception $e) {
            Log::error('cancelLinkedJobOrder: failed', [
                'orderId' => (string) $order->_id,
                'error'   => $e->getMessage(),
            ]);
        }
    }

    /**
     * Restores inventory stock when an Order is returned.
     * Mirrors the deduction done in completeOrder().
     */
    /**
     * Goods have physically come back.
     *
     * The old version restocked NOTHING and only logged, on the reasoning that printed material is
     * gone. True for a personalised item - a mug with someone's name on it can never be sold again,
     * so a return is a total loss. But it is wrong for a plain READY-MADE line that came back
     * unopened: that is ordinary sellable stock, and refusing to return it quietly writes off goods
     * the shop still physically has.
     *
     * So the split is by what the item IS, plus a human judgement on condition. `$restock` is the
     * inspector saying the goods arrived sellable; without it nothing goes back, because "returned"
     * does not mean "undamaged".
     */
    private function restoreInventoryOnReturn(Order $order, bool $restock = false): void
    {
        try {
            foreach ($order->items as $item) {
                $product = Product::find($item['productId']);
                if (!$product || !$product->inventoryId) continue;

                $inventory = Inventory::find($product->inventoryId);
                if (!$inventory || $inventory->isOnDemand) continue;

                // Personalised or made-to-order goods carry the customer's design and cannot be
                // resold, whatever condition they came back in.
                $personalised = (bool) ($product->isCustom ?? false) || (bool) ($product->isMadeToOrder ?? false)
                    || !empty($item['isCustom']) || !empty($item['designUrl']) || !empty($item['designFiles'])
                    || !empty($item['designRequested']);

                if ($restock && !$personalised) {
                    $qty = (int) ($item['qty'] ?? 0);
                    if ($qty > 0) {
                        Inventory::where('_id', $inventory->_id)->update(['$inc' => ['stockQty' => $qty]]);
                        $inventory->refresh();
                    }
                }

                StockHistory::create([
                    'inventoryId'  => (string) $inventory->_id,
                    'quantity'     => $item['qty'],
                    'remainingQty' => $inventory->stockQty ?? 0,
                    'unitCost'     => $this->unitCostOf($inventory),
                    'totalCost'    => $this->unitCostOf($inventory) * $item['qty'],
                    'reason'       => 'customer_return',
                    'type'         => 'adjustment',
                    'performedBy'  => 'system',
                    'createdAt'    => now(),
                ]);
            }
        } catch (\Exception $e) {
            Log::error('OrderController: inventory restoration failed', [
                'orderId' => (string) $order->_id,
                'error'   => $e->getMessage(),
            ]);
        }
    }

    /**
     * Sends a branded email to the store owner when a new order is placed.
     */
    private function notifyOwner(Order $order): void
    {
        try {
            $ownerEmail = env('ADMIN_EMAIL');
            if (!$ownerEmail) return;

            Mail::to($ownerEmail)->send(new AdminNewOrderMail(
                orderId:       (string) $order->_id,
                customerName:  $order->userSnapshot['name']  ?? 'Unknown',
                customerEmail: $order->userSnapshot['email'] ?? '',
                customerPhone: $order->userSnapshot['phone'] ?? '',
                items:         $order->items ?? [],
                totalAmount:   (float) ($order->totalAmount ?? 0),
                notes:         $order->notes ?? ''
            ));
        } catch (\Exception $e) {
            Log::error('OrderController@notifyOwner: ' . $e->getMessage());
        }
    }

    /**
     * POST /api/admin/orders/{id}/record-payment
     * Records a cash payment against an order (COD or partial payment).
     * Appends to paymentHistory[], recalculates downPayment and balance.
     */
    /**
     * Record that the shop owes the customer money back.
     *
     * Cancelling a paid order and declining a paid-for rush both take money the shop is not
     * entitled to keep, and neither said so anywhere. This does not MOVE money - no refund
     * API exists - it makes the obligation visible so somebody can send it.
     */
    private function recordRefundOwed($order, float $amount, string $reason, ?string $by = null): void
    {
        if ($amount <= 0.009) return;
        $refunds   = $order->refunds ?? [];
        $refunds[] = [
            'amount'     => round($amount, 2),
            'reason'     => mb_substr($reason, 0, 300),
            'status'     => 'owed',
            'recordedBy' => $by,
            'recordedAt' => now()->toISOString(),
        ];
        $order->refunds    = $refunds;
        $order->refundOwed = round(
            collect($refunds)->filter(fn ($r) => ($r['status'] ?? 'owed') === 'owed')
                ->sum(fn ($r) => (float) ($r['amount'] ?? 0)),
            2
        );
    }

    /** What the customer has actually handed over, however it was recorded. */
    private function paidSoFar($order): float
    {
        return max(
            (float) ($order->downPayment ?? 0),
            (float) collect($order->paymentHistory ?? [])->sum(fn ($p) => (float) ($p['amount'] ?? 0))
        );
    }

    /**
     * POST /api/admin/orders/{id}/mark-refunded
     *
     * The other half of recordRefundOwed. That one records that money is owed; nothing until now
     * could record that it had been sent, so the debt sat on the order forever and the only way to
     * clear it was to forget about it. There is still no refund API - the shop sends it by hand -
     * so this is a receipt, not a transfer, and it says who logged it and how.
     */
    public function markRefunded(Request $request, $id)
    {
        try {
            $user = $request->user();
            if (!$this->hasPermission($request, 'payments.create')) {
                return $this->unauthorizedResponse();
            }

            $order = Order::find($id);
            if (!$order) return $this->notFoundResponse('Order');

            $owed = (float) ($order->refundOwed ?? 0);
            if ($owed <= 0) {
                return $this->errorResponse('This order has no refund outstanding.', 422);
            }

            $validated = $request->validate([
                'amount' => 'required|numeric|min:0.01',
                'method' => 'required|string|in:gcash,maya,bank_transfer,cash,paymongo',
                'note'   => 'nullable|string|max:500',
            ]);

            $amount = round((float) $validated['amount'], 2);
            if ($amount > $owed + 0.01) {
                return $this->errorResponse(
                    'That is more than the ' . number_format($owed, 2) . ' owed on this order.',
                    422
                );
            }

            // Mark the owed entries settled oldest first, so a partial payment clears the oldest
            // debt rather than leaving several half-paid rows nobody can reconcile.
            $left    = $amount;
            $refunds = $order->refunds ?? [];
            foreach ($refunds as $i => $r) {
                if (($r['status'] ?? 'owed') !== 'owed') continue;
                if ($left <= 0.009) break;
                $rowAmt = (float) ($r['amount'] ?? 0);
                if ($rowAmt <= $left + 0.009) {
                    $refunds[$i]['status']   = 'paid';
                    $refunds[$i]['paidAt']   = now()->toISOString();
                    $refunds[$i]['paidVia']  = $validated['method'];
                    $refunds[$i]['paidBy']   = trim(($user->firstName ?? '') . ' ' . ($user->lastName ?? '')) ?: null;
                    $refunds[$i]['paidNote'] = isset($validated['note'])
                        ? htmlspecialchars(strip_tags(trim($validated['note'])), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8')
                        : null;
                    $left -= $rowAmt;
                } else {
                    // Partly settled: split it so the remainder is still visibly owed.
                    $refunds[$i]['amount'] = round($rowAmt - $left, 2);
                    $refunds[] = [
                        'amount'     => round($left, 2),
                        'reason'     => $r['reason'] ?? 'Refund',
                        'status'     => 'paid',
                        'recordedBy' => $r['recordedBy'] ?? null,
                        'recordedAt' => $r['recordedAt'] ?? now()->toISOString(),
                        'paidAt'     => now()->toISOString(),
                        'paidVia'    => $validated['method'],
                        'paidBy'     => trim(($user->firstName ?? '') . ' ' . ($user->lastName ?? '')) ?: null,
                    ];
                    $left = 0;
                }
            }

            $order->refunds    = array_values($refunds);
            $order->refundOwed = round(
                collect($order->refunds)->filter(fn ($r) => ($r['status'] ?? 'owed') === 'owed')
                    ->sum(fn ($r) => (float) ($r['amount'] ?? 0)),
                2
            );
            $order->updatedAt = now();
            $order->save();

            try {
                Notification::create([
                    'user_id'    => (string) $order->userId,
                    'type'       => 'refund_sent',
                    'title'      => 'Refund Sent',
                    'message'    => 'We have sent P' . number_format($amount, 2) . ' back for order #'
                        . strtoupper(substr((string) $order->_id, -8))
                        . ' via ' . strtoupper($validated['method']) . '.',
                    'is_read'    => false,
                    'data'       => ['orderId' => (string) $order->_id],
                    'created_at' => now(),
                ]);
            } catch (\Exception $e) {
                Log::warning('markRefunded: notification failed', ['error' => $e->getMessage()]);
            }

            return $this->successResponse('Refund recorded.', $order);
        } catch (\Illuminate\Validation\ValidationException $e) {
            return $this->validationErrorResponse($e);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'Failed to record the refund.');
        }
    }

    public function recordPayment(Request $request, $id)
    {
        try {
            $user = $request->user();
            // Recording a payment is a Finance capability (Admin/Owner/Super bypass).
            if (!$this->hasPermission($request, 'payments.create')) {
                return $this->unauthorizedResponse();
            }

            $order = Order::find($id);
            if (!$order) {
                return $this->notFoundResponse('Order');
            }

            if (in_array($order->orderStatus, ['Cancelled', 'Returned'])) {
                return response()->json([
                    'error' => "Cannot record payment for an order with status: {$order->orderStatus}.",
                ], 422);
            }

            // Allow payment recording on Delivered orders only if:
            // - payment method is COD (courier collects after delivery), AND
            // - order is not already fully paid
            if ($order->orderStatus === 'Delivered') {
                $isCod       = ($order->paymentMethod ?? '') === 'cod';
                $isFullyPaid = ($order->paymentStatus ?? '') === 'paid';
                if (!$isCod || $isFullyPaid) {
                    return response()->json([
                        'error' => $isFullyPaid
                            ? 'This order has already been fully paid.'
                            : 'Cannot record payment for a delivered non-COD order.',
                    ], 422);
                }
            }

            $validated = $request->validate([
                'amount'     => 'required|numeric|min:0.01',
                'method'     => 'required|string|in:cash,gcash,bank_transfer,cod',
                'note'       => 'nullable|string|max:500',
            ]);

            $recordedBy = trim("{$user->firstName} {$user->lastName}");

            $newEntry = [
                'amount'     => (float) $validated['amount'],
                'method'     => $validated['method'],
                'note'       => isset($validated['note'])
                    ? htmlspecialchars(strip_tags(trim($validated['note'])), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8')
                    : null,
                'recordedBy' => $recordedBy,
                'recordedAt' => now()->toISOString(),
            ];

            // Append to paymentHistory
            $history   = $order->paymentHistory ?? [];
            $history[] = $newEntry;

            // Recalculate downPayment as sum of all recorded payments
            $totalPaid = collect($history)->sum('amount');

            // Refuse to take more than is owed. The screens guard this, but a guard that only exists
            // in the UI is not a guard - and the failure here is silent and expensive: the order reads
            // as fully paid, `downPayment` exceeds the total, and the money owed BACK to the customer
            // is recorded nowhere at all. There is no refund flow to discover it later.
            $orderTotal = (float) ($order->totalAmount ?? $order->totalPrice ?? 0);
            $paidBefore = $totalPaid - (float) $validated['amount'];
            $owedBefore = round($orderTotal - $paidBefore, 2);
            if ((float) $validated['amount'] > $owedBefore + 0.01) {
                return response()->json([
                    'error' => $owedBefore > 0
                        ? 'That is more than the ' . number_format($owedBefore, 2) . ' still owed on this order.'
                        : 'This order has nothing outstanding.',
                ], 422);
            }
            $balance   = max(0, (float) ($order->totalAmount ?? 0) - $totalPaid);

            $order->paymentHistory = $history;
            $order->downPayment    = $totalPaid;
            $order->balance        = $balance;
            $order->paymentStatus  = $balance <= 0 ? 'paid' : 'partial';
            $order->updatedAt      = now();
            $order->save();

            return $this->successResponse('Payment recorded successfully.', $order);

        } catch (\Illuminate\Validation\ValidationException $e) {
            return $this->validationErrorResponse($e);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'Failed to record payment.');
        }
    }

    /**
     * POST /api/admin/orders/{id}/approve-design
     * Owner approves the customer's uploaded design.
     */
    /**
     * Recompute the order-level design mirror from the per-item design states (Option 2 mixed cart).
     * The order's Design node is "approved" only when EVERY custom item is approved; otherwise it
     * reflects the least-advanced item so the admin and customer still see design work is pending.
     * Order-level fields stay in sync so the production gate and trackers keep working unchanged.
     */
    private function syncDesignAggregate(Order $order): void
    {
        $statuses = [];
        foreach (($order->items ?? []) as $it) {
            // designFiles counts too. Today the configurator always mirrors the first upload into
            // designUrl, so this holds - but if that ever stops, an uploaded line would drop out of
            // the aggregate entirely and the order could reach "approved" with artwork nobody saw.
            $isCustom = ($it['isCustom'] ?? false) || !empty($it['designRequested'])
                || !empty($it['designUrl']) || !empty($it['designFiles']);
            $st = $it['designStatus'] ?? null;
            if ($isCustom && $st !== null && $st !== '') $statuses[] = $st;
        }
        if (empty($statuses)) return; // no per-item design state - leave the order-level value alone

        $allApproved = count(array_filter($statuses, fn($s) => $s === 'approved')) === count($statuses);
        if ($allApproved) {
            $order->designStatus = 'approved';
            return;
        }
        // Not all approved - surface the most blocking / least-advanced state.
        foreach (['rejected', 'revision_requested', 'pending_review', 'pending_design', 'draft_ready', 'proof_sent'] as $p) {
            if (in_array($p, $statuses, true)) { $order->designStatus = $p; return; }
        }
        $order->designStatus = 'pending_review';
    }

    /** Apply a per-item design status change and re-sync the order aggregate. Returns false if the
     *  itemIndex is present but invalid. Leaves order-level handling to the caller when null. */
    private function applyItemDesignStatus(Order $order, $itemIndex, string $status, array $extra = []): bool
    {
        if ($itemIndex === null || !is_numeric($itemIndex)) return true; // order-level path
        $items = $order->items ?? [];
        $idx   = (int) $itemIndex;
        if (!isset($items[$idx])) return false;
        $items[$idx]['designStatus'] = $status;
        foreach ($extra as $k => $v) { $items[$idx][$k] = $v; }
        $order->items = array_values($items);
        $this->syncDesignAggregate($order);
        return true;
    }

    /**
     * POST /api/orders/my/{id}/restart-design-job
     * The customer is past the revision cap and still wants changes. "Treated as a new design
     * job, back to base price" only means something if the new job carries the same terms as the
     * first one - the design fee that buys a few free rounds, not a bare re-charge with nothing
     * included. So this mirrors what the original design fee bought: it re-bills designRequestFee
     * and resets the round counter to zero, rather than leaving the customer paying full price for
     * every round of a job that is, on paper, brand new.
     */
    public function restartDesignJob(Request $request, $id)
    {
        try {
            $user = $this->getAuthUser($request);
            if (!$user) return $this->unauthorizedResponse();

            $order = Order::find($id);
            if (!$order || (string) $order->userId !== (string) $user->_id) {
                return $this->notFoundResponse('Order');
            }

            if (!$order->adminDesignUrl) {
                return $this->errorResponse('No design draft available for this order.', 422);
            }

            $validated = $request->validate([
                'notes'     => 'required|string|min:5|max:1000',
                'itemIndex' => 'nullable|integer|min:0',
            ], [
                'notes.required' => 'Please describe what the new design should do differently.',
                'notes.min'      => 'Please give a little more detail.',
            ]);
            $notes = htmlspecialchars(strip_tags(trim($validated['notes'])), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');

            $owner        = User::where('role', 'owner')->first();
            $maxRevisions = max(0, (int) ($owner->maxRevisions ?? 5));
            $designFee    = max(0, (float) ($owner->designRequestFee ?? 100));

            $itemIndex = $request->input('itemIndex');
            $items     = $order->items ?? [];
            $isLine    = is_numeric($itemIndex) && isset($items[(int) $itemIndex]);
            $usedSoFar = $isLine
                ? (int) ($items[(int) $itemIndex]['revisionCount'] ?? 0)
                : (int) ($order->revisionCount ?? 0);

            // Restarting is only a real "new job" once the customer has actually used up what the
            // first one bought. Allowing it earlier would let the cap be skipped for free by anyone
            // who just prefers to pay ₱100 rather than describe changes to the current draft.
            if ($usedSoFar < $maxRevisions) {
                return $this->errorResponse(
                    "This item still has revisions left ({$usedSoFar} of {$maxRevisions} used). Use \"Request changes\" instead.",
                    422
                );
            }

            $history   = $order->statusHistory ?? [];
            $history[] = ['status' => 'design_job_restarted', 'at' => now()->toISOString()];

            // Same reset the original job started from: zero rounds used, waiting on a fresh proof.
            if (!$this->applyItemDesignStatus($order, $itemIndex, 'pending_design', [
                    'revisionCount'  => 0,
                    'revisionNotes'  => $notes,
                    'adminDesignUrl' => null,
                ])) {
                return $this->errorResponse('Invalid item.', 422);
            }
            if (!$isLine) {
                $order->revisionCount  = 0;
                $order->designStatus   = 'pending_design';
                $order->adminDesignUrl = null;
            }

            if ($designFee > 0) {
                $order->designRestartFees = round((float) ($order->designRestartFees ?? 0) + $designFee, 2);
                $order->totalAmount       = round((float) ($order->totalAmount ?? 0) + $designFee, 2);
                if ($order->balance !== null && $order->balance !== '') {
                    $order->balance = round((float) $order->balance + $designFee, 2);
                }
            }

            $order->orderStatus   = 'pending_design';
            $order->statusHistory = $history;
            $order->revisionNotes = $notes;
            $order->updatedAt     = now();
            $order->save();

            try {
                $admins = User::whereIn('role', ['admin', 'owner'])->get();
                foreach ($admins as $admin) {
                    Notification::create([
                        'user_id'    => (string) $admin->_id,
                        'type'       => 'design_job_restarted',
                        'title'      => 'New Design Job Requested',
                        'message'    => 'Customer restarted the design for order #' .
                            strtoupper(substr((string) $order->_id, -8)) .
                            ' (₱' . number_format($designFee, 2) . ' charged): ' . substr($notes, 0, 100),
                        'is_read'    => false,
                        'data'       => ['orderId' => (string) $order->_id],
                        'created_at' => now(),
                    ]);
                }
            } catch (\Exception $notifErr) {
                Log::warning('restartDesignJob: notification failed', ['error' => $notifErr->getMessage()]);
            }

            return $this->successResponse(
                'New design job started. We will send a fresh proof.',
                $this->normalizeOrderForCustomer($order)
            );
        } catch (\Illuminate\Validation\ValidationException $e) {
            return $this->validationErrorResponse($e);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'Failed to restart the design job.');
        }
    }

    /**
     * POST /api/admin/orders/{id}/convert-to-design
     *
     * The customer uploaded a file, then turned out to want it designed - references rather than
     * artwork, or artwork that needs work. Until now there was no way to act on that: the design
     * fee is collected at checkout, so an upload order carries none, and the two mechanisms that
     * could add one both refuse. restartDesignJob is customer-only and requires an existing
     * draft; the revision fee requires a proof to revise.
     *
     * So the fee is billed onto the BALANCE rather than collected now. Nothing moves until the
     * customer has agreed in chat - which is the point: a refund of a fee taken too early costs
     * the shop the gateway charge and cannot be undone cleanly.
     */
    public function convertToDesignJob(Request $request, $id)
    {
        try {
            $user = $request->user();
            if (!in_array($user->role ?? null, ['admin', 'owner', 'superAdmin'], true)) {
                return $this->unauthorizedResponse();
            }

            $order = Order::find($id);
            if (!$order) return $this->notFoundResponse('Order');

            if (($order->designStatus ?? null) === 'approved') {
                return $this->errorResponse('This design is already approved - revert it first.', 422);
            }
            if (\App\Models\JobOrder::where('orderId', (string) $order->_id)
                    ->get()->contains(fn ($j) => $j->joStatus !== 'Cancelled')) {
                return $this->errorResponse('This order is already in production.', 422);
            }

            $owner     = User::where('role', 'owner')->first();
            $designFee = max(0, (float) ($request->input('designFee', $owner->designRequestFee ?? 100)));

            $itemIndex = $request->input('itemIndex');
            $items     = $order->items ?? [];
            if (is_numeric($itemIndex) && isset($items[(int) $itemIndex])) {
                $items[(int) $itemIndex]['designRequested'] = true;
                $items[(int) $itemIndex]['designStatus']    = 'pending_design';
                $order->items = $items;
            } else {
                foreach ($items as $i => $it) {
                    if (!empty($it['isCustom'])) {
                        $items[$i]['designRequested'] = true;
                        $items[$i]['designStatus']    = 'pending_design';
                    }
                }
                $order->items = $items;
            }

            // Billed, not charged. The customer settles it with the rest of the balance.
            if ($designFee > 0) {
                $order->designFee   = round((float) ($order->designFee ?? 0) + $designFee, 2);
                $order->totalAmount = round((float) ($order->totalAmount ?? 0) + $designFee, 2);
                if ($order->balance !== null && $order->balance !== '') {
                    $order->balance = round((float) $order->balance + $designFee, 2);
                }
            }

            $order->designStatus  = 'pending_design';
            $order->designType    = 'request';
            $history              = $order->statusHistory ?? [];
            $history[]            = ['status' => 'converted_to_design', 'at' => now()->toISOString()];
            $order->statusHistory = $history;
            $order->updatedAt     = now();
            $order->save();

            try {
                Notification::create([
                    'user_id'    => (string) $order->userId,
                    'type'       => 'design_job_started',
                    'title'      => 'We are designing your order',
                    'message'    => 'Order #' . strtoupper(substr((string) $order->_id, -8))
                        . ' - we will create the artwork and send you a mockup to approve.'
                        . ($designFee > 0 ? ' A design fee of P' . number_format($designFee, 2)
                            . ' has been added to your balance.' : ''),
                    'is_read'    => false,
                    'data'       => ['orderId' => (string) $order->_id],
                    'created_at' => now(),
                ]);
            } catch (\Exception $e) {
                Log::warning('convertToDesignJob: notification failed', ['error' => $e->getMessage()]);
            }

            return $this->successResponse('Converted to a design job.', $order);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'Failed to convert this order.');
        }
    }

    /**
     * POST /api/admin/orders/{id}/rush-decision  { decision: accepted|declined }
     * The shop confirms a rush REQUEST ("kaya ba isabay"). Declining waives + credits the rush fee.
     */
    public function rushDecision(Request $request, $id)
    {
        try {
            $user = $request->user();
            if (!$this->hasPermission($request, 'orders.edit')) return $this->unauthorizedResponse();
            $validated = $request->validate(['decision' => 'required|string|in:accepted,declined']);
            $order = Order::find($id);
            if (!$order) return $this->notFoundResponse('Order');
            if (!($order->isRush ?? false) && ($order->rushStatus ?? null) !== 'requested') {
                return $this->errorResponse('This order has no pending rush request.', 422);
            }
            $decision = $validated['decision'];
            if ($decision === 'accepted') {
                $order->rushStatus = 'accepted';
            } else {
                // Decline: waive the rush fee. The old version subtracted it from the balance with
                // max(0, ...) and called that "credited" - which only works while an unpaid balance
                // remains to subtract FROM. On an order already settled the balance is 0, so
                // max(0, 0 - 100) is 0 and the fee simply vanished: the total dropped, the payments
                // did not, and the shop was left holding money nothing recorded as owed.
                $rushFee = (float) ($order->rushFee ?? 0);
                if ($rushFee > 0) {
                    $order->totalAmount = round(max(0, (float) ($order->totalAmount ?? 0) - $rushFee), 2);
                    $balanceBefore = (float) ($order->balance ?? 0);
                    $absorbed      = min($rushFee, max(0, $balanceBefore));
                    if ($order->balance !== null && $order->balance !== '') {
                        $order->balance = round($balanceBefore - $absorbed, 2);
                    }
                    // Whatever the outstanding balance could not absorb has already been paid,
                    // and has to go back.
                    $this->recordRefundOwed(
                        $order,
                        $rushFee - $absorbed,
                        'Rush declined by the shop - rush fee returned',
                        trim(($user->firstName ?? '') . ' ' . ($user->lastName ?? '')) ?: null
                    );
                }
                $order->rushStatus = 'declined';
                $order->isRush = false;
                $order->rushFee = null;
            }
            $order->updatedAt = now();
            $order->save();

            try {
                Notification::create([
                    'user_id' => (string) $order->userId,
                    'type'    => 'rush_' . $decision,
                    'title'   => $decision === 'accepted' ? 'Rush Confirmed' : 'Rush Not Available',
                    'message' => 'Order #' . strtoupper(substr((string) $order->_id, -8)) . ($decision === 'accepted'
                        ? ' - we can meet your rush request. Thank you!'
                        : ' - we could not fit your rush timeline, so it follows the standard schedule and the rush fee was waived.'),
                    'is_read' => false,
                    'data'    => ['orderId' => (string) $order->_id, 'rushStatus' => $order->rushStatus],
                    'created_at' => now(),
                ]);
            } catch (\Exception $e) { Log::warning('rushDecision: notify failed', ['error' => $e->getMessage()]); }

            return $this->successResponse('Rush ' . $decision . '.', $order);
        } catch (\Illuminate\Validation\ValidationException $e) {
            return $this->validationErrorResponse($e);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'Failed to update rush decision.');
        }
    }

    public function approveDesign(Request $request, $id)
    {
        try {
            $user = $request->user();
            if (!$this->hasPermission($request, 'orders.edit')) {
                return $this->unauthorizedResponse();
            }

            $order = Order::find($id);
            if (!$order) {
                return $this->notFoundResponse('Order');
            }

            if (!$order->designFilePath && !$order->designNotes && empty($order->items)) {
                return $this->errorResponse('This order has no design to approve.', 422);
            }

            // Per-item approve (mixed cart): approve just this line, then re-sync the aggregate so
            // the order only advances once every custom item is approved.
            $itemIndex = $request->input('itemIndex');
            if (!$this->applyItemDesignStatus($order, $itemIndex, 'approved')) {
                return $this->errorResponse('Invalid item.', 422);
            }
            if ($itemIndex === null || !is_numeric($itemIndex)) {
                $order->designStatus = 'approved';
            }
            // An order submitted for review has not been paid yet - approving the artwork is what
            // unlocks payment. Only unlock once the order aggregate is fully approved.
            $awaitingPayment = ($order->paymentStatus ?? 'unpaid') === 'unpaid' && $order->designStatus === 'approved';
            if ($awaitingPayment) {
                $order->orderStatus = 'awaiting_payment';
            }
            $order->updatedAt    = now();
            $order->save();

            // Notify customer
            try {
                Notification::create([
                    'user_id'    => (string) $order->userId,
                    'type'       => 'design_approved',
                    'title'      => 'Design Approved!',
                    'message'    => 'Your design for order #' .
                        strtoupper(substr((string) $order->_id, -8)) .
                        ($awaitingPayment
                            ? ' has been approved. You can now complete your payment in My Orders.'
                            : ' has been approved. We\'ll begin production shortly.'),
                    'is_read'    => false,
                    'data'       => [
                        'orderId'      => (string) $order->_id,
                        'designStatus' => 'approved',
                    ],
                    'created_at' => now(),
                ]);
            } catch (\Exception $notifErr) {
                Log::warning('approveDesign: notification failed', [
                    'error' => $notifErr->getMessage(),
                ]);
            }

            // Log activity
            try {
                ActivityLog::create([
                    'action'           => 'design_approved',
                    'entityType'       => 'order',
                    'entityId'         => (string) $order->_id,
                    'description'      => 'Design approved for order #' .
                        strtoupper(substr((string) $order->_id, -8)),
                    'performedBy'      => trim("{$user->firstName} {$user->lastName}"),
                    'performedByEmail' => $user->email ?? null,
                    'metadata'         => ['orderId' => (string) $order->_id],
                    'createdAt'        => now(),
                ]);
            } catch (\Exception $logErr) {
                Log::warning('ActivityLog write failed (approveDesign)', [
                    'error' => $logErr->getMessage(),
                ]);
            }

            return $this->successResponse('Design approved.', $order);

        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'Failed to approve design.');
        }
    }

    /**
     * POST /api/admin/orders/{id}/revert-design
     * Undo an accidental design approval - sends it back to review. Only allowed BEFORE a Job
     * Order exists (i.e. production has not started); once a JO is created the approval is locked.
     */
    public function revertDesignApproval(Request $request, $id)
    {
        try {
            $user = $request->user();
            if (!$this->hasPermission($request, 'orders.edit')) {
                return $this->unauthorizedResponse();
            }

            $order = Order::find($id);
            if (!$order) {
                return $this->notFoundResponse('Order');
            }

            if (($order->designStatus ?? null) !== 'approved') {
                return $this->errorResponse('Only an approved design can be reverted.', 422);
            }

            // Locked once production starts - a Job Order (or any in-production+ status) means the
            // shop floor may already be working off this artwork.
            $inProduction = in_array(OrderStatus::normalize($order->orderStatus), [
                OrderStatus::IN_PRODUCTION, OrderStatus::FOR_QC, OrderStatus::READY_FOR_DELIVERY,
                OrderStatus::FOR_DELIVERY, OrderStatus::DELIVERED,
            ], true);
            if (!empty($order->joId) || $inProduction) {
                return $this->errorResponse('This design is locked - a Job Order was already created. Cancel the Job Order first.', 422);
            }

            // Send every custom line back too so the per-item cards match the order-level revert:
            // a line with a proof returns to draft_ready (re-approve), an uploaded file to review.
            $items = $order->items ?? [];
            foreach ($items as $k => $it) {
                $isCustom = ($it['isCustom'] ?? false) || !empty($it['designRequested']) || !empty($it['designUrl']);
                if ($isCustom && ($it['designStatus'] ?? null) === 'approved') {
                    $items[$k]['designStatus'] = !empty($it['adminDesignUrl']) ? 'draft_ready' : 'pending_review';
                }
            }
            $order->items = array_values($items);
            $order->designStatus = 'pending_review';
            $this->syncDesignAggregate($order);
            // approveDesign parks an unpaid order at awaiting_payment; undo exactly that.
            if ($order->orderStatus === 'awaiting_payment') {
                $order->orderStatus = OrderStatus::PENDING;
            }
            $order->updatedAt = now();
            $order->save();

            try {
                ActivityLog::create([
                    'action'           => 'design_approval_reverted',
                    'entityType'       => 'order',
                    'entityId'         => (string) $order->_id,
                    'description'      => 'Design approval reverted to review for order #' .
                        strtoupper(substr((string) $order->_id, -8)),
                    'performedBy'      => trim("{$user->firstName} {$user->lastName}"),
                    'performedByEmail' => $user->email ?? null,
                    'metadata'         => ['orderId' => (string) $order->_id],
                    'createdAt'        => now(),
                ]);
            } catch (\Exception $logErr) {
                Log::warning('ActivityLog write failed (revertDesignApproval)', ['error' => $logErr->getMessage()]);
            }

            return $this->successResponse('Design approval reverted to review.', $order);

        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'Failed to revert design approval.');
        }
    }

    /**
     * POST /api/admin/orders/{id}/reject-design
     * Owner rejects the customer's uploaded design.
     */
    public function rejectDesign(Request $request, $id)
    {
        try {
            $user = $request->user();
            if (!$this->hasPermission($request, 'orders.edit')) {
                return $this->unauthorizedResponse();
            }

            $validated = $request->validate([
                'reason'    => 'nullable|string|max:500',
                'itemIndex' => 'nullable|integer|min:0',
            ]);

            $order = Order::find($id);
            if (!$order) {
                return $this->notFoundResponse('Order');
            }

            if (!$order->designFilePath && !$order->designNotes && empty($order->items)) {
                return $this->errorResponse('This order has no design to reject.', 422);
            }

            $reason = $validated['reason'] ?? null;

            // Per-item reject (mixed cart): reject just this line and record its own reason, then
            // re-sync the aggregate so the whole order reflects the block.
            $itemIndex = $request->input('itemIndex');
            if (!$this->applyItemDesignStatus($order, $itemIndex, 'rejected', ['designRejectionReason' => $reason])) {
                return $this->errorResponse('Invalid item.', 422);
            }
            if ($itemIndex === null || !is_numeric($itemIndex)) {
                $order->designStatus = 'rejected';
            }
            // Persist the reason on the order so the customer sees it inline in the order
            // detail modal, not only in the notification bell.
            $order->designRejectionReason = $reason;
            $order->updatedAt    = now();
            $order->save();

            // Notify customer
            try {
                $message = 'Your design for order #' .
                    strtoupper(substr((string) $order->_id, -8)) .
                    ' needs revision.';
                if ($reason) {
                    $message .= ' Reason: ' . $reason;
                }
                Notification::create([
                    'user_id'    => (string) $order->userId,
                    'type'       => 'design_rejected',
                    'title'      => 'Design Needs Revision',
                    'message'    => $message,
                    'is_read'    => false,
                    'data'       => [
                        'orderId'      => (string) $order->_id,
                        'designStatus' => 'rejected',
                        'reason'       => $reason,
                    ],
                    'created_at' => now(),
                ]);
            } catch (\Exception $notifErr) {
                Log::warning('rejectDesign: notification failed', [
                    'error' => $notifErr->getMessage(),
                ]);
            }

            // Log activity
            try {
                ActivityLog::create([
                    'action'           => 'design_rejected',
                    'entityType'       => 'order',
                    'entityId'         => (string) $order->_id,
                    'description'      => 'Design rejected for order #' .
                        strtoupper(substr((string) $order->_id, -8)) .
                        ($reason ? '. Reason: ' . $reason : ''),
                    'performedBy'      => trim("{$user->firstName} {$user->lastName}"),
                    'performedByEmail' => $user->email ?? null,
                    'metadata'         => [
                        'orderId' => (string) $order->_id,
                        'reason'  => $reason,
                    ],
                    'createdAt'        => now(),
                ]);
            } catch (\Exception $logErr) {
                Log::warning('ActivityLog write failed (rejectDesign)', [
                    'error' => $logErr->getMessage(),
                ]);
            }

            return $this->successResponse('Design rejected.', $order);

        } catch (\Illuminate\Validation\ValidationException $e) {
            return $this->validationErrorResponse($e);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'Failed to reject design.');
        }
    }

    /**
     * POST /api/orders/my/{id}/cancel
     * Customer cancels their own order — only allowed when Pending.
     */
    public function cancelMyOrder(Request $request, $id)
    {
        try {
            $user = $this->getAuthUser($request);
            if (!$user) {
                return $this->unauthorizedResponse();
            }

            $order = Order::where('_id', $id)
                          ->where('userId', (string) $user->_id)
                          ->first();

            if (!$order) {
                return $this->notFoundResponse('Order');
            }

            // The check used to be `!== 'Pending'` with a capital P, but the canonical value is
            // lowercase 'pending' - so this rejected every order and the customer could never cancel
            // anything, at any stage. Normalise first.
            $status = OrderStatus::normalize($order->orderStatus);

            // A job order means material has been pulled and work has begun. Past that point a
            // cancellation is a negotiation about what was already made, not something to self-serve,
            // so it goes to the shop instead.
            $hasWork = \App\Models\JobOrder::where('orderId', (string) $order->_id)
                ->get()->contains(fn ($j) => $j->joStatus !== 'Cancelled');

            $selfCancellable = in_array($status, [
                OrderStatus::PENDING, 'awaiting_payment', 'pending_design', 'pending_review',
            ], true) && !$hasWork;

            if (!$selfCancellable) {
                return $this->errorResponse(
                    $hasWork
                        ? 'This order is already being made, so it cannot be cancelled here. Message the shop and they will tell you what can still be stopped.'
                        : 'This order can no longer be cancelled on its own. Message the shop to arrange it.',
                    422
                );
            }

            // Why an order was cancelled is the only thing that tells the shop whether this is a
            // pricing problem, a delivery-time problem, or a change of mind. Cancelling with no
            // record of the reason throws that away every single time.
            $reason = trim((string) $request->input('reason', ''));

            $order->orderStatus     = OrderStatus::CANCELLED;
            $order->cancelledBy     = 'customer';
            $order->cancelledReason = $reason !== '' ? mb_substr($reason, 0, 500) : null;
            $order->cancelledAt     = now();
            $order->updatedAt    = now();
            $order->save();

            // Restore inventory reserved at order creation
            $this->restoreStockOnCancel($order);

            // The gate above lets a PAID order be cancelled - correctly, since nothing has been
            // made yet - but the money was never mentioned anywhere: the order flipped to Cancelled,
            // the stock came back, and the customer got an email quoting the total as though it were
            // a receipt. A design fee is deliberately excluded because the design work was done and
            // the terms say it is non-refundable; only the goods side is unwound.
            $paid        = $this->paidSoFar($order);
            $designKept  = ($order->designFeePaid ?? false)
                ? (float) ($order->designFeePaidAmount ?? $order->designFee ?? 0)
                : 0.0;
            $this->recordRefundOwed(
                $order,
                $paid - $designKept,
                $designKept > 0
                    ? 'Order cancelled by the customer - goods payment returned, design fee retained'
                    : 'Order cancelled by the customer before production',
                'customer cancellation'
            );
            if (($order->refundOwed ?? 0) > 0) {
                $order->save();
            }

            // Email notification to customer
            try {
                $customerEmail = $order->userSnapshot['email'] ?? null;
                $customerName  = $order->userSnapshot['name'] ?? '';
                $firstName     = explode(' ', trim($customerName))[0] ?? 'Customer';
                if ($customerEmail) {
                    Mail::to($customerEmail)->send(new OrderStatusMail(
                        firstName:   $firstName,
                        orderId:     (string) $order->_id,
                        newStatus:   'Cancelled',
                        totalAmount: (float) ($order->totalAmount ?? 0)
                    ));
                }
            } catch (\Exception $e) {
                Log::error('cancelMyOrder: Failed to send cancellation email', [
                    'order_id' => (string) $order->_id,
                    'error'    => $e->getMessage(),
                ]);
            }

            // In-app notification to customer
            try {
                Notification::create([
                    'user_id'    => (string) $order->userId,
                    'type'       => 'order_cancelled',
                    'title'      => 'Order Cancelled',
                    'message'    => 'Your order #' .
                        strtoupper(substr((string) $order->_id, -8)) .
                        ' has been cancelled.',
                    'is_read'    => false,
                    'data'       => ['orderId' => (string) $order->_id],
                    'created_at' => now(),
                ]);
            } catch (\Exception $e) {
                Log::warning('cancelMyOrder: notification failed', [
                    'error' => $e->getMessage(),
                ]);
            }

            // In-app notification to admin — B-13
            try {
                $admin = \App\Models\User::where('role', 'admin')->first();
                if ($admin) {
                    Notification::create([
                        'user_id'    => (string) $admin->_id,
                        'type'       => 'order_cancelled',
                        'title'      => 'Order Cancelled by Customer',
                        'message'    => 'Order #' . strtoupper(substr((string) $order->_id, -8)) .
                                        ' was cancelled by ' . trim("{$user->firstName} {$user->lastName}") . '.',
                        'is_read'    => false,
                        'data'       => ['orderId' => (string) $order->_id],
                        'created_at' => now(),
                    ]);
                }
            } catch (\Exception $e) {
                Log::warning('cancelMyOrder: admin notification failed', ['error' => $e->getMessage()]);
            }

            // Activity log
            try {
                ActivityLog::create([
                    'action'           => 'order_cancelled_by_customer',
                    'entityType'       => 'order',
                    'entityId'         => (string) $order->_id,
                    'description'      => 'Order cancelled by customer.',
                    'performedBy'      => trim("{$user->firstName} {$user->lastName}"),
                    'performedByEmail' => $user->email ?? null,
                    'metadata'         => ['orderId' => (string) $order->_id],
                    'createdAt'        => now(),
                ]);
            } catch (\Exception $logErr) {
                Log::warning('ActivityLog write failed (cancelMyOrder)', [
                    'error' => $logErr->getMessage(),
                ]);
            }

            return $this->successResponse('Order cancelled successfully.', $order);

        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'Failed to cancel order.');
        }
    }

    /**
     * POST /api/orders/my/{id}/reupload-design
     * Customer re-uploads design after admin rejection.
     * Only allowed when designStatus === 'rejected'.
     */
    public function reuploadDesign(Request $request, $id)
    {
        try {
            $user = $this->getAuthUser($request);
            if (!$user) {
                return $this->unauthorizedResponse();
            }

            $order = Order::where('_id', $id)
                          ->where('userId', (string) $user->_id)
                          ->first();

            if (!$order) {
                return $this->notFoundResponse('Order');
            }

            if ($order->designStatus !== 'rejected') {
                return $this->errorResponse('Design can only be re-uploaded when the previous submission was rejected.', 422);
            }

            $validated = $request->validate([
                'design_file'  => 'nullable|file|mimes:jpeg,jpg,png,webp,pdf,ai,psd,svg|max:10240',
                'design_notes' => 'nullable|string|max:2000',
            ]);

            if (!$request->hasFile('design_file') && empty(trim($validated['design_notes'] ?? ''))) {
                return $this->errorResponse('Please provide a new design file or updated notes.', 422);
            }

            $designFilePath = $order->designFilePath;
            if ($request->hasFile('design_file') && $request->file('design_file')->isValid()) {
                try {
                    $cloudName    = config('services.cloudinary.cloud_name');
                    $uploadPreset = config('services.cloudinary.upload_preset');
                    $file         = $request->file('design_file');
                    $ext          = strtolower($file->getClientOriginalExtension());
                    $resourceType = in_array($ext, ['jpg','jpeg','png','webp','svg']) ? 'image' : 'raw';
                    $response     = Http::attach(
                        'file',
                        file_get_contents($file->getPathname()),
                        $file->getClientOriginalName()
                    )->post("https://api.cloudinary.com/v1_1/{$cloudName}/{$resourceType}/upload", [
                        'upload_preset' => $uploadPreset,
                        'folder'        => 'pmp-customer-designs',
                    ]);
                    if ($response->successful()) {
                        $designFilePath = $response->json()['secure_url'];
                    }
                } catch (\Exception $fileErr) {
                    Log::warning('reuploadDesign: file upload failed', ['error' => $fileErr->getMessage()]);
                }
            }

            // Per-item re-upload (mixed cart): replace this line's artwork and send it back to review,
            // clearing its own rejection reason, then re-sync the aggregate.
            $itemIndex = $request->input('itemIndex');
            if (!$this->applyItemDesignStatus($order, $itemIndex, 'pending_review', [
                    'designUrl'             => $designFilePath,
                    'designRejectionReason' => null,
                ])) {
                return $this->errorResponse('Invalid item.', 422);
            }
            if ($itemIndex === null || !is_numeric($itemIndex)) {
                $order->designStatus = 'pending_review';
            }
            $order->designFilePath        = $designFilePath;
            $order->designRejectionReason = null;

            if (!empty(trim($validated['design_notes'] ?? ''))) {
                $order->designNotes = htmlspecialchars(
                    strip_tags(trim($validated['design_notes'])),
                    ENT_QUOTES | ENT_SUBSTITUTE,
                    'UTF-8'
                );
            }

            $order->updatedAt = now();
            $order->save();

            // Notify all admins/owners
            try {
                $admins = User::whereIn('role', ['admin', 'owner'])->get();
                $customerName = trim("{$user->firstName} {$user->lastName}");
                $orderShort   = strtoupper(substr((string) $order->_id, -8));
                foreach ($admins as $admin) {
                    Notification::create([
                        'user_id'    => (string) $admin->_id,
                        'type'       => 'design_resubmitted',
                        'title'      => 'Design Resubmitted',
                        'message'    => "{$customerName} resubmitted a design for order #{$orderShort}. Please review.",
                        'is_read'    => false,
                        'data'       => ['orderId' => (string) $order->_id],
                        'created_at' => now(),
                    ]);
                }
            } catch (\Exception $notifErr) {
                Log::warning('reuploadDesign: admin notification failed', ['error' => $notifErr->getMessage()]);
            }

            try {
                ActivityLog::create([
                    'action'           => 'design_resubmitted',
                    'entityType'       => 'order',
                    'entityId'         => (string) $order->_id,
                    'description'      => 'Customer resubmitted design for order #' .
                        strtoupper(substr((string) $order->_id, -8)),
                    'performedBy'      => trim("{$user->firstName} {$user->lastName}"),
                    'performedByEmail' => $user->email ?? null,
                    'metadata'         => ['orderId' => (string) $order->_id],
                    'createdAt'        => now(),
                ]);
            } catch (\Exception $logErr) {
                Log::warning('ActivityLog write failed (reuploadDesign)', ['error' => $logErr->getMessage()]);
            }

            return $this->successResponse('Design resubmitted for review.', $order);

        } catch (\Illuminate\Validation\ValidationException $e) {
            return $this->validationErrorResponse($e);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'Failed to resubmit design.');
        }
    }

    /**
     * POST /api/orders/my/{id}/approve-admin-design
     * Customer approves the admin's uploaded design draft.
     */
    public function approveAdminDesign(Request $request, $id)
    {
        try {
            $user = $this->getAuthUser($request);
            if (!$user) return $this->unauthorizedResponse();

            $order = Order::find($id);
            if (!$order || (string) $order->userId !== (string) $user->_id) {
                return $this->notFoundResponse('Order');
            }

            $itemIndex = $request->input('itemIndex');
            $perItem   = $itemIndex !== null && is_numeric($itemIndex);
            if (!$perItem && !$order->adminDesignUrl) {
                return $this->errorResponse('No design draft available for this order.', 422);
            }

            $history              = $order->statusHistory ?? [];
            $history[]            = ['status' => 'design_approved', 'at' => now()->toISOString()];
            // Per-item approve of a proof (mixed cart): approve this line, then re-sync. The order
            // only moves to design_approved once every custom item is approved.
            if (!$this->applyItemDesignStatus($order, $itemIndex, 'approved')) {
                return $this->errorResponse('Invalid item.', 422);
            }
            if (!$perItem) {
                $order->designStatus  = 'approved';
            }
            $awaitingPayment = false;
            if ($order->designStatus === 'approved') {
                // Only the design fee has been collected so far on a request-design order, so the
                // goods are still owed. Move to awaiting_payment - that is the state the customer's
                // "Pay Now" panel keys on - and give them a window to settle before the hold lapses.
                $awaitingPayment = ($order->paymentStatus ?? 'unpaid') === 'unpaid';
                $order->orderStatus = $awaitingPayment ? 'awaiting_payment' : 'design_approved';
                if ($awaitingPayment) {
                    $dueDays = (int) (User::where('role', 'owner')->first()->depositDueDays ?? 7);
                    $order->paymentDueAt = now()->addDays(max(1, $dueDays));
                }
            }
            $order->statusHistory = $history;
            $order->updatedAt     = now();
            $order->save();

            try { broadcast(new \App\Events\OrderStatusUpdated((string) $order->_id, $awaitingPayment ? 'awaiting_payment' : 'design_approved', null)); } catch (\Throwable) {}

            // The moment the goods fall due is the moment to say so, in the place the customer is
            // already looking. The card carries the figures but not the checkout: paying needs the
            // full breakdown, and "what was I shown when I paid" is what every payment dispute turns
            // on - so the button opens the order rather than reproducing it here.
            if ($awaitingPayment) {
                $paidSoFar = collect($order->paymentHistory ?? [])->sum('amount');
                $owed      = max(0, round((float) ($order->totalAmount ?? 0) - $paidSoFar, 2));
                $pct       = (int) ($order->downpaymentPercent ?? 0);
                $deposit   = $pct > 0 ? round($owed * $pct / 100, 2) : $owed;
                $peso      = fn($n) => 'P' . number_format((float) $n, 2);

                $this->postOrderCardToChat(
                    $order,
                    'deposit_due',
                    'Thanks for approving. The goods are due now - production starts once this clears.',
                    [
                        'dueNow'    => $pct > 0 ? $peso($deposit) . " ({$pct}%)" : $peso($owed),
                        'dueFull'   => $pct > 0 ? $peso($owed) : null,
                        'heldUntil' => $order->paymentDueAt
                            ? \Carbon\Carbon::parse($order->paymentDueAt)->format('M j, Y')
                            : null,
                    ]
                );
            }

            try {
                $admins = User::whereIn('role', ['admin', 'owner'])->get();
                foreach ($admins as $admin) {
                    Notification::create([
                        'user_id'    => (string) $admin->_id,
                        'type'       => 'design_approved_by_customer',
                        'title'      => 'Design Approved',
                        'message'    => 'Customer approved the design for order #' .
                            strtoupper(substr((string) $order->_id, -8)) . '. Set to Awaiting Payment so the customer can complete their order.',
                        'is_read'    => false,
                        'data'       => ['orderId' => (string) $order->_id],
                        'created_at' => now(),
                    ]);
                }
            } catch (\Exception $notifErr) {
                Log::warning('approveAdminDesign: notification failed', ['error' => $notifErr->getMessage()]);
            }

            return $this->successResponse('Design approved. We\'ll proceed to production.', $this->normalizeOrderForCustomer($order));

        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'Failed to approve design.');
        }
    }

    /**
     * POST /api/orders/my/{id}/request-revision
     * Customer requests a revision on the admin's design draft.
     */
    public function requestDesignRevision(Request $request, $id)
    {
        try {
            $user = $this->getAuthUser($request);
            if (!$user) return $this->unauthorizedResponse();

            $order = Order::find($id);
            if (!$order || (string) $order->userId !== (string) $user->_id) {
                return $this->notFoundResponse('Order');
            }

            if (!$order->adminDesignUrl) {
                return $this->errorResponse('No design draft available for this order.', 422);
            }

            // A revision request with no explanation tells the designer nothing - they would have to
            // guess what to change, or message the customer to ask. Require it.
            $validated = $request->validate([
                'notes'     => 'required|string|min:5|max:1000',
                'itemIndex' => 'nullable|integer|min:0',
            ], [
                'notes.required' => 'Please describe what you would like changed.',
                'notes.min'      => 'Please give a little more detail about what to change.',
            ]);

            $revNotes = isset($validated['notes'])
                ? htmlspecialchars(strip_tags(trim($validated['notes'])), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8')
                : null;

            // Revisions are what actually protect the designer's time - the design fee alone does not,
            // because without a cap one P100 order can be sent back forever. A couple of rounds come
            // with the fee; past that each round is billed onto the order, and a hard ceiling stops an
            // endless loop from ever forming.
            $owner            = User::where('role', 'owner')->first();
            $freeRevisions    = max(0, (int) ($owner->freeRevisions    ?? 3));
            $extraRevisionFee = max(0, (float) ($owner->extraRevisionFee ?? 50));
            $maxRevisions     = max($freeRevisions, (int) ($owner->maxRevisions ?? 5));

            $itemIndex = $request->input('itemIndex');
            $items     = $order->items ?? [];
            $isLine    = is_numeric($itemIndex) && isset($items[(int) $itemIndex]);
            $usedSoFar = $isLine
                ? (int) ($items[(int) $itemIndex]['revisionCount'] ?? 0)
                : (int) ($order->revisionCount ?? 0);

            if ($usedSoFar >= $maxRevisions) {
                return $this->errorResponse(
                    "This item has had {$usedSoFar} revisions, which is the most we can take online. Message us in chat and we will sort it out with you directly.",
                    422
                );
            }

            $thisRound  = $usedSoFar + 1;
            $chargeable = $thisRound > $freeRevisions ? $extraRevisionFee : 0.0;

            $history               = $order->statusHistory ?? [];
            $history[]             = ['status' => 'revision_requested', 'at' => now()->toISOString()];
            // Per-item revision (mixed cart): send just this line back for a new proof.
            if (!$this->applyItemDesignStatus($order, $itemIndex, 'revision_requested', [
                    'revisionNotes' => $revNotes,
                    'revisionCount' => $thisRound,
                ])) {
                return $this->errorResponse('Invalid item.', 422);
            }
            if (!$isLine) {
                $order->revisionCount = $thisRound;
            }

            // Billed onto the order rather than collected up front: a separate P50 checkout costs more
            // in gateway fees and friction than it recovers, and the goods are still unpaid anyway.
            if ($chargeable > 0) {
                $order->revisionFees  = round((float) ($order->revisionFees ?? 0) + $chargeable, 2);
                $order->totalAmount   = round((float) ($order->totalAmount ?? 0) + $chargeable, 2);
                if ($order->balance !== null && $order->balance !== '') {
                    $order->balance = round((float) $order->balance + $chargeable, 2);
                }
            }
            if ($itemIndex === null || !is_numeric($itemIndex)) {
                $order->designStatus   = 'revision_requested';
            }
            $order->orderStatus    = 'revision_requested';
            $order->statusHistory  = $history;
            $order->revisionNotes  = $revNotes;
            $order->updatedAt      = now();
            $order->save();

            try {
                $admins = User::whereIn('role', ['admin', 'owner'])->get();
                foreach ($admins as $admin) {
                    Notification::create([
                        'user_id'    => (string) $admin->_id,
                        'type'       => 'design_revision_requested',
                        'title'      => 'Design Revision Requested',
                        'message'    => 'Customer requested a revision for order #' .
                            strtoupper(substr((string) $order->_id, -8)) .
                            ($order->revisionNotes ? ': ' . substr($order->revisionNotes, 0, 100) : '.'),
                        'is_read'    => false,
                        'data'       => ['orderId' => (string) $order->_id],
                        'created_at' => now(),
                    ]);
                }
            } catch (\Exception $notifErr) {
                Log::warning('requestDesignRevision: notification failed', ['error' => $notifErr->getMessage()]);
            }

            return $this->successResponse('Revision request sent. We\'ll update the design and notify you.', $this->normalizeOrderForCustomer($order));

        } catch (\Illuminate\Validation\ValidationException $e) {
            return $this->validationErrorResponse($e);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'Failed to submit revision request.');
        }
    }



    /**
     * A display copy of a proof: watermarked and capped in size.
     *
     * The artwork is not handed over until the order is paid, and a proof good enough to print is a
     * proof good enough to take to a cheaper printer. The width cap is the real protection - 900px
     * looks fine on a phone and prints badly at any useful size - with the text there to make the
     * intent unambiguous. Non-Cloudinary URLs, and any already carrying a transformation, pass through
     * untouched rather than being guessed at.
     */
    private function watermarkedProof(?string $url): ?string
    {
        if (!$url || !str_contains($url, 'res.cloudinary.com') || !str_contains($url, '/upload/')) {
            return $url;
        }
        if (preg_match('#/upload/(w_|q_|l_text|f_|vc_)#', $url)) {
            return $url;
        }
        $isVideo = (bool) preg_match('/\.(mp4|webm|mov|m4v|ogg)(\?|$)/i', $url);
        $tx = $isVideo
            ? 'w_720,c_limit/q_auto:eco'
            : 'w_900,c_limit/q_auto:eco/l_text:Arial_52_bold:PROOF%20ONLY,co_rgb:9a9a9a,o_42,a_-30/fl_layer_apply,g_center';

        return str_replace('/upload/', "/upload/{$tx}/", $url);
    }

    /**
     * Post an order card into the customer's chat thread.
     *
     * Best-effort by design: a chat failure must never roll back the order write that triggered it.
     * The card carries only what it needs to render and to act - the order id, what it covers, and
     * the figures - because a chat message is a pointer to the order, never a second copy of it.
     */
    private function postOrderCardToChat(Order $order, string $kind, string $body, array $extra = []): void
    {
        try {
            $customerId = (string) ($order->userId ?? '');
            if ($customerId === '') return;

            $shop = User::whereIn('role', ['admin', 'owner'])->first();
            if (!$shop) return;
            $shopId = (string) $shop->_id;

            // Conversations are keyed by a `participants` array, so reuse the existing thread with
            // this customer rather than starting a parallel one they would have to notice.
            $conversation = Conversation::where('participants', $customerId)
                ->where('participants', $shopId)
                ->first();

            if (!$conversation) {
                $conversation = Conversation::create([
                    'participants'    => [$customerId, $shopId],
                    'last_message'    => $body,
                    'last_message_at' => now(),
                    'is_active'       => true,
                ]);
            }

            Message::create([
                'conversation_id' => (string) $conversation->_id,
                'sender_id'       => $shopId,
                'sender_name'     => trim(($shop->firstName ?? '') . ' ' . ($shop->lastName ?? '')) ?: 'Personalize Me Prints',
                'type'            => 'order_reference',
                'body'            => $body,
                'metadata'        => array_merge([
                    'kind'     => $kind,
                    'orderId'  => (string) $order->_id,
                    // Same shape the storefront shows everywhere else. Falling back to the bare word 'Order'
                    // is what put a card in the customer's chat with no reference on it at all.
                    'orderNo'  => $order->orderNumber ?? $order->orderNo ?? ('ORD-' . strtoupper(substr((string) $order->_id, -8))),
                    'products' => implode(', ', array_values(array_filter(array_map(
                        fn($i) => $i['productName'] ?? null,
                        $order->items ?? []
                    )))),
                ], $extra),
                'is_read'         => false,
            ]);

            $conversation->update([
                'last_message'    => $body,
                'last_message_at' => now(),
            ]);
        } catch (\Throwable $e) {
            Log::warning('postOrderCardToChat failed', ['kind' => $kind, 'error' => $e->getMessage()]);
        }
    }

    /**
     * POST /api/admin/orders/{id}/upload-design
     * Admin uploads a design draft for a design-service order.
     */
    public function adminUploadDesign(Request $request, $id)
    {
        try {
            $user = $request->user();
            if (!$this->hasPermission($request, 'orders.edit')) {
                return $this->unauthorizedResponse();
            }

            $order = Order::find($id);
            if (!$order) {
                return $this->notFoundResponse('Order');
            }

            if (!$request->hasFile('design')) {
                return response()->json(['message' => 'At least one design file is required.'], 422);
            }

            // Sending a mockup after approval is information - "here is what it will look like" -
            // not a request to approve again. Without the distinction this endpoint rewrote
            // designStatus and orderStatus unconditionally, and it had no Job Order guard at all,
            // so a proof sent late could knock an order the shop floor was already building from
            // back to proof_sent. revertDesignApproval has always refused that; this did not.
            $informational = $request->boolean('informational');
            if (!$informational && \App\Models\JobOrder::where('orderId', (string) $order->_id)
                    ->get()->contains(fn ($j) => $j->joStatus !== 'Cancelled')) {
                return $this->errorResponse(
                    'This order is already in production - a proof sent now would send it back for approval. '
                    . 'Send it as a mockup instead, or cancel the Job Order first.', 422);
            }

            // The design fee buys the designer's time, so nothing leaves the studio until it has
            // cleared. A part-paid or fully paid order has already covered it, whatever route the
            // money took. Orders with no design fee at all (the customer supplied artwork) are
            // unaffected - there is no designer time to protect.
            $feeDue = (float) ($order->designFee ?? 0);
            $goodsPaid = in_array($order->paymentStatus ?? 'unpaid', ['partial', 'paid'], true);
            if ($feeDue > 0 && !($order->designFeePaid ?? false) && !$goodsPaid) {
                return response()->json([
                    'message' => 'The design fee has not been paid yet. The customer pays it before we send a proof.',
                ], 422);
            }

            $cloudName    = config('services.cloudinary.cloud_name');
            $uploadPreset = config('services.cloudinary.upload_preset');

            if (!$cloudName || !$uploadPreset) {
                return response()->json(['message' => 'Cloudinary configuration missing.'], 500);
            }

            $rawFiles = $request->file('design');
            $files    = is_array($rawFiles) ? $rawFiles : [$rawFiles];

            $uploadedUrls = [];
            foreach ($files as $file) {
                // 50 MB to allow short proof videos (e.g. a 360 spin of a mug), not just images.
                if ($file->getSize() > 50 * 1024 * 1024) {
                    return response()->json(['message' => 'Each file must be under 50 MB.'], 422);
                }
                // The file travels twice: browser to here, then here to Cloudinary. A short proof
                // video easily outruns Laravel's default 30s HTTP timeout on that second hop.
                // 100s here sits deliberately UNDER the client's own timeout, so a slow upload comes
                // back as a real error instead of the browser giving up on a request that is still
                // running - which looked like the file "coming back" with nothing explained.
                // Timed so a slow upload can be diagnosed instead of guessed at: the log separates
                // reading the file off disk from the Cloudinary round trip, which tells us whether
                // the delay is ours or theirs. Cloudinary processes video on upload, so a short clip
                // can take far longer than an image many times its size.
                $tRead  = microtime(true);
                $bytes  = file_get_contents($file->getPathname());
                $readMs = round((microtime(true) - $tRead) * 1000);

                $tUp = microtime(true);
                $response = Http::timeout(100)
                    ->connectTimeout(15)
                    ->attach('file', $bytes, $file->getClientOriginalName())
                    ->post("https://api.cloudinary.com/v1_1/{$cloudName}/auto/upload", [
                        'upload_preset' => $uploadPreset,
                        'folder'        => 'pmp-admin-designs',
                    ]);
                $upMs = round((microtime(true) - $tUp) * 1000);

                // Deliberately warning level: this project runs LOG_LEVEL=warning, so info entries are
                // discarded and instrumentation written at info level never appears.
                Log::warning('adminUploadDesign result', [
                    'file'          => $file->getClientOriginalName(),
                    'mime'          => $file->getMimeType(),
                    'sizeKB'        => round($file->getSize() / 1024),
                    'cloudinaryHop' => $upMs . 'ms',
                    'ok'            => $response->successful(),
                    // The two fields that decide whether the clip can be transcoded on delivery.
                    'resource_type' => $response->json()['resource_type'] ?? null,
                    'format'        => $response->json()['format'] ?? null,
                    'secure_url'    => $response->json()['secure_url'] ?? null,
                ]);

                if (!$response->successful()) {
                    Log::warning('adminUploadDesign: Cloudinary error', ['body' => $response->body()]);
                    return response()->json(['message' => 'Failed to upload design to Cloudinary.'], 500);
                }

                $uploadedUrls[] = $response->json()['secure_url'];
            }

            $adminDesignUrl  = $uploadedUrls[0];
            $adminDesignUrls = $uploadedUrls;

            // Information only: record it, say so, and touch no status. Everything below this
            // point moves the order backwards through the approval flow, which is right for a
            // proof and wrong for a courtesy mockup.
            if ($informational) {
                $mockups = $order->mockups ?? [];
                foreach ($adminDesignUrls as $u) {
                    $mockups[] = [
                        'url'    => $u,
                        'sentAt' => now()->toISOString(),
                        'sentBy' => trim("{$user->firstName} {$user->lastName}"),
                    ];
                }
                $order->mockups   = $mockups;
                $order->updatedAt = now();
                $order->save();

                try {
                    Notification::create([
                        'user_id'    => (string) $order->userId,
                        'type'       => 'design_mockup_sent',
                        'title'      => 'A mockup of your order',
                        'message'    => 'We sent a mockup for order #' .
                            strtoupper(substr((string) $order->_id, -8)) .
                            ' showing how it will look. Nothing needs approving - your design is already confirmed.',
                        'is_read'    => false,
                        'data'       => ['orderId' => (string) $order->_id, 'mockups' => $adminDesignUrls],
                        'created_at' => now(),
                    ]);
                } catch (\Exception $notifErr) {
                    Log::warning('adminUploadDesign: mockup notification failed', ['error' => $notifErr->getMessage()]);
                }

                $this->postOrderCardToChat(
                    $order,
                    'mockup',
                    'Here is a mockup of your order so you can see how it will look. '
                        . 'Nothing needs approving - your design is already confirmed and we are '
                        . 'printing what you approved.',
                    ['mockups' => array_slice($adminDesignUrls, 0, 6)]
                );

                return $this->successResponse('Mockup sent to the customer.', $order);
            }

            $history                = $order->statusHistory ?? [];
            $history[]              = ['status' => 'proof_sent', 'at' => now()->toISOString()];
            // Per-item proof (mixed cart): attach the proof to this line and mark it draft_ready,
            // then re-sync the aggregate. Order-level adminDesignUrl is still mirrored so existing
            // single-design screens keep working.
            // One artwork can cover several products, so a single upload can land on several lines.
            // `itemIndexes` carries that set; `itemIndex` remains for a single line and for anything
            // still calling the old shape.
            $itemIndexes = $request->input('itemIndexes');
            $targets = is_array($itemIndexes) && count($itemIndexes)
                ? array_values(array_filter($itemIndexes, 'is_numeric'))
                : [$request->input('itemIndex')];

            foreach ($targets as $target) {
                if (!$this->applyItemDesignStatus($order, $target, 'draft_ready', [
                        'adminDesignUrl'  => $adminDesignUrl,
                        'adminDesignUrls' => $adminDesignUrls,
                    ])) {
                    return $this->errorResponse('Invalid item.', 422);
                }
            }
            $itemIndex = $targets[0] ?? null;
            if ($itemIndex === null || !is_numeric($itemIndex)) {
                $order->designStatus = 'draft_ready';
            }
            $order->adminDesignUrl  = $adminDesignUrl;
            $order->adminDesignUrls = $adminDesignUrls;
            $order->orderStatus    = 'proof_sent';
            $order->statusHistory  = $history;
            $order->updatedAt      = now();
            $order->save();

            try { broadcast(new \App\Events\OrderStatusUpdated((string) $order->_id, 'proof_sent', null)); } catch (\Throwable) {}

            try {
                Notification::create([
                    'user_id'    => (string) $order->userId,
                    'type'       => 'design_draft_ready',
                    'title'      => 'Your Design Draft is Ready!',
                    'message'    => 'Your custom design for order #' .
                        strtoupper(substr((string) $order->_id, -8)) .
                        ' is ready for review. Open your order to view it.',
                    'is_read'    => false,
                    'data'       => [
                        'orderId'         => (string) $order->_id,
                        'designStatus'    => 'draft_ready',
                        'adminDesignUrl'  => $adminDesignUrl,
                        'adminDesignUrls' => $adminDesignUrls,
                    ],
                    'created_at' => now(),
                ]);
            } catch (\Exception $notifErr) {
                Log::warning('adminUploadDesign: notification failed', ['error' => $notifErr->getMessage()]);
            }

            try {
                ActivityLog::create([
                    'action'           => 'design_draft_uploaded',
                    'entityType'       => 'order',
                    'entityId'         => (string) $order->_id,
                    'description'      => 'Design draft uploaded for order #' .
                        strtoupper(substr((string) $order->_id, -8)),
                    'performedBy'      => trim("{$user->firstName} {$user->lastName}"),
                    'performedByEmail' => $user->email ?? null,
                    'metadata'         => ['orderId' => (string) $order->_id],
                    'createdAt'        => now(),
                ]);
            } catch (\Exception $logErr) {
                Log::warning('ActivityLog write failed (adminUploadDesign)', ['error' => $logErr->getMessage()]);
            }

            $this->postOrderCardToChat(
                $order,
                'proof_ready',
                'Your proof is ready. Approve it here, or ask for changes.',
                [
                    'proofs'    => array_map(fn ($u) => $this->watermarkedProof($u), array_slice($adminDesignUrls, 0, 6)),
                    // EVERY line this proof covered, not just the first. One send can land on several
                    // products, and a card carrying a single index gave the customer one Approve button
                    // for a proof that spanned two - approving one and silently leaving the other.
                    'itemIndexes' => array_values(array_filter(array_map(
                        fn ($t) => is_numeric($t) ? (int) $t : null,
                        $targets
                    ), fn ($t) => $t !== null)),
                    'itemIndex' => is_numeric($itemIndex) ? (int) $itemIndex : null,
                ]
            );

            return $this->successResponse('Design draft uploaded. Customer has been notified.', $order);

        } catch (\Illuminate\Validation\ValidationException $e) {
            return $this->validationErrorResponse($e);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'Failed to upload design draft.');
        }
    }

    public function approveUploadDesign(Request $request, $id)
    {
        try {
            $user = $request->user();
            if (!$this->hasPermission($request, 'orders.edit')) {
                return $this->unauthorizedResponse();
            }

            $order = Order::find($id);
            if (!$order) return $this->notFoundResponse('Order');

            $history   = $order->statusHistory ?? [];
            $history[] = ['status' => 'awaiting_payment', 'at' => now()->toISOString(), 'by' => 'admin', 'note' => 'Upload approved — awaiting customer payment'];
            $order->orderStatus   = 'awaiting_payment';
            $order->statusHistory = $history;
            $order->updatedAt     = now();
            $order->save();

            try { broadcast(new \App\Events\OrderStatusUpdated((string) $order->_id, 'awaiting_payment', null)); } catch (\Throwable) {}

            try {
                Notification::create([
                    'user_id' => (string) $order->userId,
                    'type'    => 'upload_approved',
                    'title'   => 'Your Design Was Approved!',
                    'message' => 'Your uploaded design for order #' .
                        strtoupper(substr((string) $order->_id, -8)) .
                        ' has been approved. Please complete your payment to begin production.',
                    'is_read' => false,
                    'data'    => ['orderId' => (string) $order->_id],
                    'created_at' => now(),
                ]);
            } catch (\Exception $e) {
                Log::warning('approveUploadDesign: notification failed', ['error' => $e->getMessage()]);
            }

            return $this->successResponse('Upload approved. Customer notified to complete payment.', $order);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'Failed to approve upload.');
        }
    }
}