<?php

namespace App\Http\Controllers;

use App\Models\Product;
use App\Models\Inventory;
use MongoDB\BSON\Regex;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;
use App\Models\ActivityLog;
use Illuminate\Support\Facades\Http;

class ProductController extends Controller
{
    // ─── Public ───────────────────────────────────────────────────────────────

    /**
     * Calculate live availability for a product.
     * BOM products: min producible across all components, capped by storeStockCap.
     * Non-BOM products: product.stock capped by storeStockCap.
     */
    private function computeAvailability(Product $product): array
    {
        $canProduce       = null;
        $variantCanProduce  = null;
        $variantAvailableQty = null;

        // ── Multi-variant BOM product (bomGroupName) ──────────────────────────
        // This branch finds BOMs by NAME, and a name is editable. Renaming a BOM in Master Data
        // therefore used to orphan every product still holding the old one: the query returned
        // nothing, this branch still claimed the product, and availability quietly became zero -
        // in-stock goods showing as sold out with nothing on any screen to say why.
        // Matching nothing now means "not this branch", so the per-combination bomId lookup below
        // takes over, and that one is keyed on an id no rename can change.
        // One decision, taken on the product, for every variant of it. A shared material
        // could not carry this: Mug Box White 11oz sits in all three mug recipes, so a promise
        // made there would silently promise mugs the owner never had in mind.
        $preorder = (bool) ($product->allowPreorder ?? false);

        $groupBoms = !empty($product->bomGroupName)
            ? \App\Models\BillOfMaterial::where('productGroupName', $product->bomGroupName)->get()
            : collect();

        if ($groupBoms->count() > 0) {
            try {
                $boms = $groupBoms;
                $variantCanProduce  = [];
                $variantAvailableQty = [];

                foreach ($boms as $bom) {
                    $bomId = (string) $bom->_id;
                    $min   = PHP_INT_MAX;
                    foreach ($bom->components ?? [] as $component) {
                        $inv = Inventory::find($component['inventoryId'] ?? null);
                        if (!$inv || $inv->isOnDemand) continue;
                        $qpu = (float) ($component['qty'] ?? 0);
                        if ($qpu <= 0) continue;
                        $min = min($min, (int) floor(max(0, (int) ($inv->stockQty ?? 0) - (int) ($inv->reservedQty ?? 0)) / $qpu));
                    }
                    $cp = $min === PHP_INT_MAX ? 0 : $min;
                    $variantCanProduce[$bomId] = $cp;

                    // Product-level override first, then what the materials themselves allow.
                    $backorder = $preorder || (bool) ($product->variantBackorder[$bomId] ?? false);
                    if ($backorder) {
                        $variantAvailableQty[$bomId] = 9999;
                    } else {
                        $manualCap = isset($product->variantStock[$bomId]) && (int) $product->variantStock[$bomId] > 0
                            ? (int) $product->variantStock[$bomId]
                            : null;
                        $variantAvailableQty[$bomId] = $manualCap !== null ? min($cp, $manualCap) : $cp;
                    }
                }
            } catch (\Exception $e) {
                Log::warning('computeAvailability variant BOM failed', ['productId' => (string) $product->_id, 'error' => $e->getMessage()]);
            }
        }
        // ── Multi-variant BOM product (per-combination bomId) ─────────────────
        elseif (!empty($product->combinations)) {
            $combinations = is_array($product->combinations) ? $product->combinations : [];
            $hasBomCombos = collect($combinations)->contains(fn($c) => !empty($c['bomId'] ?? null));
            if ($hasBomCombos) {
                $variantCanProduce  = [];
                $variantAvailableQty = [];
                foreach ($combinations as $combo) {
                    $comboId = $combo['id'] ?? null;
                    $bomId   = $combo['bomId'] ?? null;
                    if (!$comboId) continue;
                    if (!$bomId) {
                        $variantCanProduce[$comboId]  = 9999;
                        $variantAvailableQty[$comboId] = 9999;
                        continue;
                    }
                    try {
                        $bom = \App\Models\BillOfMaterial::find($bomId);
                        $min = PHP_INT_MAX;
                        foreach ($bom?->components ?? [] as $component) {
                            $inv = Inventory::find($component['inventoryId'] ?? null);
                            if (!$inv || $inv->isOnDemand) continue;
                            $qpu = (float) ($component['qty'] ?? 0);
                            if ($qpu <= 0) continue;
                            $min = min($min, (int) floor(max(0, (int) ($inv->stockQty ?? 0) - (int) ($inv->reservedQty ?? 0)) / $qpu));
                        }
                        $cp = $min === PHP_INT_MAX ? 0 : $min;
                        $variantCanProduce[$comboId] = $cp;
                        $backorder = $preorder || (bool) ($product->variantBackorder[$comboId] ?? false);
                        if ($backorder) {
                            $variantAvailableQty[$comboId] = 9999;
                        } else {
                            $manualCap = isset($product->variantStock[$comboId]) && (int) $product->variantStock[$comboId] > 0
                                ? (int) $product->variantStock[$comboId]
                                : null;
                            $variantAvailableQty[$comboId] = $manualCap !== null ? min($cp, $manualCap) : $cp;
                        }
                    } catch (\Exception $e) {
                        $variantCanProduce[$comboId]  = 0;
                        $variantAvailableQty[$comboId] = 0;
                    }
                }
            }
        }
        // ── Single BOM product ────────────────────────────────────────────────
        elseif (!empty($product->bomId)) {
            try {
                $bom = \App\Models\BillOfMaterial::find($product->bomId);
                if ($bom && !empty($bom->components)) {
                    $min = PHP_INT_MAX;
                    foreach ($bom->components as $component) {
                        $inv = Inventory::find($component['inventoryId'] ?? null);
                        if (!$inv || $inv->isOnDemand) continue;
                        $qpu = (float) ($component['qty'] ?? 0);
                        if ($qpu <= 0) continue;
                        $min = min($min, (int) floor(max(0, (int) ($inv->stockQty ?? 0) - (int) ($inv->reservedQty ?? 0)) / $qpu));
                    }
                    $canProduce = $min === PHP_INT_MAX ? 0 : $min;
                }
            } catch (\Exception $e) {
                Log::warning('computeAvailability single BOM failed', ['productId' => (string) $product->_id, 'error' => $e->getMessage()]);
            }
        }

        $cap = $product->storeStockCap !== null ? (int) $product->storeStockCap : null;

        if ($canProduce !== null) {
            $availableQty = $cap !== null ? min($canProduce, $cap) : $canProduce;
        } else {
            $base = (int) ($product->stock ?? 0);
            $availableQty = $cap !== null ? min($base, $cap) : $base;
        }

        return [
            'canProduce'          => $canProduce,
            'availableQty'        => $availableQty,
            'variantCanProduce'   => $variantCanProduce,
            'variantAvailableQty' => $variantAvailableQty,
        ];
    }

    private function computeAvailabilityBatched(
        Product $product,
        array $bomsByGroup,
        array $bomsById,
        array $inventoryMap
    ): array {
        $canProduce          = null;
        $variantCanProduce   = null;
        $variantAvailableQty = null;

        // Must match computeAvailability exactly - the grid and the product page describing the
        // same item differently is the fault that produced "100 can build" in the CMS beside
        // "Only 10 left" on the shop.
        $preorder = (bool) ($product->allowPreorder ?? false);

        $calcMin = function (array $components) use ($inventoryMap): int {
            $min = PHP_INT_MAX;
            foreach ($components as $component) {
                $invId = (string) ($component['inventoryId'] ?? '');
                $inv   = $inventoryMap[$invId] ?? null;
                if (!$inv || $inv->isOnDemand) continue;
                $qpu = (float) ($component['qty'] ?? 0);
                if ($qpu <= 0) continue;
                $min = min($min, (int) floor(max(0, (int) ($inv->stockQty ?? 0) - (int) ($inv->reservedQty ?? 0)) / $qpu));
            }
            return $min === PHP_INT_MAX ? 0 : $min;
        };

        if (!empty($product->bomGroupName)) {
            $boms = $bomsByGroup[$product->bomGroupName] ?? [];
            $variantCanProduce   = [];
            $variantAvailableQty = [];
            foreach ($boms as $bom) {
                $bomId = (string) $bom->_id;
                $cp    = $calcMin($bom->components ?? []);
                $variantCanProduce[$bomId] = $cp;
                $backorder = $preorder || (bool) ($product->variantBackorder[$bomId] ?? false);
                if ($backorder) {
                    $variantAvailableQty[$bomId] = 9999;
                } else {
                    $manualCap = isset($product->variantStock[$bomId]) && (int) $product->variantStock[$bomId] > 0
                        ? (int) $product->variantStock[$bomId]
                        : null;
                    $variantAvailableQty[$bomId] = $manualCap !== null ? min($cp, $manualCap) : $cp;
                }
            }
        } elseif (!empty($product->combinations)) {
            $combinations = is_array($product->combinations) ? $product->combinations : [];
            $hasBomCombos = collect($combinations)->contains(fn($c) => !empty($c['bomId'] ?? null));
            if ($hasBomCombos) {
                $variantCanProduce   = [];
                $variantAvailableQty = [];
                foreach ($combinations as $combo) {
                    $comboId = $combo['id'] ?? null;
                    $bomId   = $combo['bomId'] ?? null;
                    if (!$comboId) continue;
                    if (!$bomId) {
                        $variantCanProduce[$comboId]   = 9999;
                        $variantAvailableQty[$comboId] = 9999;
                        continue;
                    }
                    $bom = $bomsById[(string) $bomId] ?? null;
                    $cp  = $bom ? $calcMin($bom->components ?? []) : 0;
                    $variantCanProduce[$comboId] = $cp;
                    $backorder = $preorder || (bool) ($product->variantBackorder[$comboId] ?? false);
                    if ($backorder) {
                        $variantAvailableQty[$comboId] = 9999;
                    } else {
                        $manualCap = isset($product->variantStock[$comboId]) && (int) $product->variantStock[$comboId] > 0
                            ? (int) $product->variantStock[$comboId]
                            : null;
                        $variantAvailableQty[$comboId] = $manualCap !== null ? min($cp, $manualCap) : $cp;
                    }
                }
            }
        } elseif (!empty($product->bomId)) {
            $bom = $bomsById[(string) $product->bomId] ?? null;
            if ($bom) {
                $canProduce = $calcMin($bom->components ?? []);
            }
        }

        $cap = $product->storeStockCap !== null ? (int) $product->storeStockCap : null;

        if ($canProduce !== null) {
            $availableQty = $cap !== null ? min($canProduce, $cap) : $canProduce;
        } else {
            $base         = (int) ($product->stock ?? 0);
            $availableQty = $cap !== null ? min($base, $cap) : $base;
        }

        return [
            'canProduce'          => $canProduce,
            'availableQty'        => $availableQty,
            'variantCanProduce'   => $variantCanProduce,
            'variantAvailableQty' => $variantAvailableQty,
        ];
    }

    /**
     * GET /api/products
     * Returns all active published products for storefront
     */
    public function index(Request $request)
    {
        try {
            $query = Product::where('isActive', true)->where('isPublished', true);

            if ($request->filled('category')) {
                $query->where('category', $request->category);
            }

            if ($request->filled('tag')) {
                $query->whereIn('tags', [$request->tag]);
            }

            if ($request->filled('search')) {
                $search = $request->search;
                $query->where(function($q) use ($search) {
                    $q->where('name', 'like', "%{$search}%")
                      ->orWhere('description', 'like', "%{$search}%");
                });
            }

            if ($request->boolean('featured')) {
                $query->where('isFeatured', true);
            }

            $products = $query->orderBy('createdAt', 'desc')->get();

            // Batch-load all BOMs and Inventory (2-3 queries total)
            $bomGroupNames    = [];
            $individualBomIds = [];

            foreach ($products as $p) {
                if (!empty($p->bomGroupName)) {
                    $bomGroupNames[] = $p->bomGroupName;
                } elseif (!empty($p->combinations)) {
                    foreach ($p->combinations as $combo) {
                        if (!empty($combo['bomId'])) $individualBomIds[] = (string) $combo['bomId'];
                    }
                } elseif (!empty($p->bomId)) {
                    $individualBomIds[] = (string) $p->bomId;
                }
            }

            $toObjectId = function ($id) {
                try { return new \MongoDB\BSON\ObjectId((string) $id); } catch (\Exception $e) { return null; }
            };

            $bomsByGroup = [];
            $bomsById    = [];

            if (!empty($bomGroupNames)) {
                $groupBoms = \App\Models\BillOfMaterial::whereIn('productGroupName', array_unique($bomGroupNames))->get();
                foreach ($groupBoms as $bom) {
                    $bomsByGroup[$bom->productGroupName][] = $bom;
                    $bomsById[(string) $bom->_id] = $bom;
                }
            }

            if (!empty($individualBomIds)) {
                $oids = array_values(array_filter(array_map($toObjectId, array_unique($individualBomIds))));
                if (!empty($oids)) {
                    foreach (\App\Models\BillOfMaterial::whereIn('_id', $oids)->get() as $bom) {
                        $bomsById[(string) $bom->_id] = $bom;
                    }
                }
            }

            $inventoryIds = [];
            foreach ($bomsById as $bom) {
                foreach ($bom->components ?? [] as $component) {
                    if (!empty($component['inventoryId'])) $inventoryIds[] = (string) $component['inventoryId'];
                }
            }

            $inventoryMap = [];
            if (!empty($inventoryIds)) {
                $oids = array_values(array_filter(array_map($toObjectId, array_unique($inventoryIds))));
                if (!empty($oids)) {
                    foreach (Inventory::whereIn('_id', $oids)->get() as $inv) {
                        $inventoryMap[(string) $inv->_id] = $inv;
                    }
                }
            }

            $slugify = fn($name) => rtrim(preg_replace('/[^a-z0-9]+/', '-', strtolower($name ?? '')), '-');

            $slim = $request->boolean('slim');
            $data = $products->map(function ($p) use ($slim, $bomsByGroup, $bomsById, $inventoryMap, $slugify) {
                $arr = array_merge($p->toArray(), $this->computeAvailabilityBatched($p, $bomsByGroup, $bomsById, $inventoryMap));
                $arr['slug'] = $slugify($p->name ?? '');
                if ($slim) {
                    unset($arr['description'], $arr['bomId']);
                }
                return $arr;
            })->values();

            return $this->successResponse('Products fetched successfully.', $data);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'An unexpected error occurred while fetching products.');
        }
    }

    /**
     * GET /api/products/{id}
     * Returns a single active product by MongoDB ID or slug (derived from product name)
     */
    public function show($id)
    {
        try {
            $slugify = fn($name) => rtrim(preg_replace('/[^a-z0-9]+/', '-', strtolower($name ?? '')), '-');

            $product = null;

            if (preg_match('/^[0-9a-f]{24}$/', $id)) {
                $product = Product::where('_id', $id)
                                  ->where('isActive', true)
                                  ->where('isPublished', true)
                                  ->first();
            }

            if (!$product) {
                $all     = Product::where('isActive', true)->where('isPublished', true)->get();
                $product = $all->first(fn($p) => $slugify($p->name) === $id);
            }

            if (!$product) {
                return $this->notFoundResponse('Product');
            }

            $data          = array_merge($product->toArray(), $this->computeAvailability($product));
            $data['slug']  = $slugify($product->name ?? '');

            return $this->successResponse('Product fetched successfully.', $data);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'An unexpected error occurred while fetching the product.');
        }
    }

    // ─── Admin Only ───────────────────────────────────────────────────────────

    /**
     * GET /api/admin/products
     * Returns all products (including unpublished/inactive) for admin dashboard
     */
    public function adminIndex(Request $request)
    {
        try {
            if (!$this->hasPermission($request, 'products')) {
                return $this->unauthorizedResponse();
            }

            $cacheKey = 'admin_products_list';
            $products = Cache::remember($cacheKey, 120, function () {
                return Product::with('inventory')->orderBy('createdAt', 'desc')->get();
            });
            return $this->successResponse('Products fetched successfully.', $products);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'An unexpected error occurred while fetching products.');
        }
    }

    /**
     * GET /api/admin/products/{id}
     * Returns a single product by ID (admin view — includes variantImageUrls and all fields)
     */
    public function adminShow(Request $request, $id)
    {
        try {
            if (!$this->hasPermission($request, 'products')) {
                return $this->unauthorizedResponse();
            }

            $product = Product::find($id);

            if (!$product) {
                return $this->notFoundResponse('Product');
            }

            return $this->successResponse('Product fetched successfully.', $product);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'An unexpected error occurred while fetching the product.');
        }
    }

    /**
     * GET /api/admin/products/available-inventory
     * Returns inventory items NOT yet linked to products
     */
    /**
     * GET /api/admin/products/{id}/bom-components?variantId=…
     *
     * Resolved BOM for one product line, enriched with live stock and cost, so a
     * quotation can pre-fill the materials it will actually consume. Resolution goes
     * through Product::resolveBom() — the same path the payment flow deducts with — so
     * what the owner is quoted on cannot drift from what gets taken out of stock.
     */
    public function bomComponents(Request $request, $id)
    {
        try {
            if (!$this->hasPermission($request, 'products')) {
                return $this->unauthorizedResponse();
            }

            $product = Product::find($id);
            if (!$product) {
                return $this->errorResponse('Product not found.', 404);
            }

            // Every variant is returned with its own materials and buildable count, so the
            // quote can show the whole picture and switch variants without another round trip.
            $invCache      = [];
            $variants      = [];
            $variantPrices = is_array($product->variantPrices ?? null) ? $product->variantPrices : [];
            $basePrice     = (float) ($product->flatPrice ?: $product->price ?: 0);

            // Whatever the owner already configured for this variant — the quote should
            // start from it rather than making them retype a price they've already set.
            $priceOf = function ($vid) use ($variantPrices, $basePrice) {
                return (float) ($variantPrices[$vid] ?? $basePrice);
            };

            if (!empty($product->bomGroupName)) {
                foreach (\App\Models\BillOfMaterial::where('productGroupName', $product->bomGroupName)->get() as $b) {
                    $vid = (string) $b->_id;
                    $variants[] = array_merge(
                        ['variantId' => $vid, 'name' => $b->variantName ?: ($b->sku ?: 'Variant'), 'price' => $priceOf($vid)],
                        $this->describeBom($b, $invCache),
                    );
                }
            } elseif (!empty($product->combinations) && is_array($product->combinations)) {
                foreach ($product->combinations as $combo) {
                    $vid = (string) ($combo['id'] ?? $combo['_id'] ?? '');
                    if ($vid === '' || empty($combo['bomId'])) continue;
                    $b = \App\Models\BillOfMaterial::find($combo['bomId']);
                    if (!$b) continue;
                    $name = $combo['name'] ?? (implode(' / ', array_values($combo['options'] ?? [])) ?: 'Variant');
                    $variants[] = array_merge(
                        [
                            'variantId' => $vid,
                            'name'      => $name,
                            'price'     => (float) ($combo['price'] ?? $priceOf($vid)),
                        ],
                        $this->describeBom($b, $invCache),
                    );
                }
            }

            // A standalone product is just a product with exactly one BOM. Returning it as
            // a single "variant" keeps the quote UI to ONE shape — a product with one BOM
            // and a product with three should not look like different features.
            $single = $variants ? null : $product->resolveBom(null);
            if ($single) {
                $variants[] = array_merge(
                    ['variantId' => self::STANDALONE_VARIANT, 'name' => 'Standalone', 'price' => $basePrice],
                    $this->describeBom($single, $invCache),
                );
            }

            return $this->successResponse('BOM components fetched successfully.', [
                'hasBom'     => (bool) $variants,
                'variants'   => $variants,
                // Kept for a service with no BOM at all — nothing to pre-fill, the owner
                // searches Master Data by hand.
                'components' => [],
                // Quantity breaks the owner already set — the quote applies them as the
                // quantity changes instead of making them remember the price list.
                'priceTiers' => is_array($product->priceTiers ?? null) ? $product->priceTiers : [],
                'basePrice'  => $basePrice,
            ]);
        } catch (\Throwable $e) {
            return $this->errorResponse('Failed to load BOM components.', 500);
        }
    }

    /** Marks the implicit single "variant" of a standalone product. Not a real variant id. */
    private const STANDALONE_VARIANT = '__standalone__';

    /**
     * One BOM described for the quote UI: each component with live stock, lead time and
     * best-known cost, plus how many units the current stock could build.
     *
     * `canBuild` is null when nothing constrains it — every component is bought per order,
     * so capacity is a question of lead time, not of stock on hand.
     */
    private function describeBom($bom, array &$invCache = []): array
    {
        $components = [];
        $canBuild   = PHP_INT_MAX;

        foreach ($bom->components ?? [] as $component) {
            // Variants of the same product share most of their materials, so cache the
            // lookups — a 3-variant mug went from 9 round trips to 4, which matters a lot
            // when the Atlas connection is slow.
            $invId = (string) ($component['inventoryId'] ?? '');
            if ($invId === '') continue;
            if (!array_key_exists($invId, $invCache)) {
                $invCache[$invId] = \App\Models\Inventory::find($invId);
            }
            $inv = $invCache[$invId];
            if (!$inv) continue;

            $qtyPerUnit = (float) ($component['qty'] ?? 0);
            $onDemand   = (bool) ($inv->isOnDemand ?? false);
            $available  = max(0, (int) ($inv->stockQty ?? 0) - (int) ($inv->reservedQty ?? 0));

            if (!$onDemand && $qtyPerUnit > 0) {
                $canBuild = min($canBuild, (int) floor($available / $qtyPerUnit));
            }

            $components[] = [
                'inventoryId'  => (string) $inv->_id,
                'name'         => $inv->name,
                'sku'          => $inv->sku,
                'uom'          => $inv->uom,
                'category'     => $inv->category,
                'qtyPerUnit'   => $qtyPerUnit,
                'stockQty'     => (int) ($inv->stockQty ?? 0),
                'reservedQty'  => (int) ($inv->reservedQty ?? 0),
                'isOnDemand'   => $onDemand,
                'leadTimeDays' => (int) ($inv->leadTimeDays ?? 0),
                // What we last paid, else the running average, else the expected cost.
                // Zero here means any profit shown would be fiction.
                'unitCost'     => (float) ($inv->lastUnitCost ?: $inv->averageCost ?: $inv->baseCost ?: 0),
            ];
        }

        return [
            'components' => $components,
            'canBuild'   => $canBuild === PHP_INT_MAX ? null : $canBuild,
        ];
    }

    public function availableInventory(Request $request)
    {
        try {
            if (!$this->hasPermission($request, 'products')) {
                return $this->unauthorizedResponse();
            }

            // Get all inventory IDs that are already linked to products
            $linkedInventoryIds = Product::whereNotNull('inventoryId')
                                         ->pluck('inventoryId')
                                         ->toArray();

            // Get inventory items that are active and not linked
            $available = Inventory::where('isActive', true)
                                  ->whereNotIn('_id', $linkedInventoryIds)
                                  ->orderBy('category', 'asc')
                                  ->orderBy('name', 'asc')
                                  ->get();

            return $this->successResponse('Available inventory fetched successfully.', $available);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'An unexpected error occurred while fetching available inventory.');
        }
    }

    /**
     * POST /api/admin/products
     * Creates a new product
     */
    public function store(Request $request)
    {
        try {
            if (!$this->hasPermission($request, 'products')) {
                return $this->unauthorizedResponse();
            }

            $validated = $request->validate([
                'name'              => 'required|string|max:200',
                'inventoryId'       => [
                    'nullable',
                    'string',
                    function ($attribute, $value, $fail) {
                        if (!$value) return;
                        $found = Inventory::where('_id', $value)
                            ->where('isActive', true)
                            ->exists();
                        if (!$found) {
                            $fail('The selected inventory item does not exist or is inactive.');
                        }
                    },
                ],
                'category'          => 'required|string|max:100',
                'subCategoryCode'   => 'nullable|string|max:10',
                'subCategoryName'   => 'required|string|max:100',
                'description'       => 'nullable|string',
                'priceType'         => 'required|in:fixed,tiered,inquiry',
                'price'             => 'nullable|numeric|min:0',
                'cost'              => 'nullable|numeric|min:0',
                'flatPrice'         => 'nullable|numeric|min:0',
                'priceTiers'        => 'nullable|array',
                'priceTiers.*.id'   => 'required',
                'priceTiers.*.minQty' => 'required|integer|min:1',
                'priceTiers.*.maxQty' => 'nullable|integer|min:1',
                'priceTiers.*.prices' => 'required|array',
                'variantPrices'     => 'nullable|array',
                'variantGroups'     => 'nullable|array',
                'optionGroups'      => 'nullable|array|max:4',
                'optionGroups.*.name'              => 'required_with:optionGroups|string|max:60',
                'optionGroups.*.options'           => 'required_with:optionGroups|array|min:1|max:12',
                // Every nested key needs its own rule. validate() returns ONLY the paths it was
                // given rules for, so an unlisted key is silently dropped between the request and
                // the database - which looked like two options sharing an id, and therefore two
                // buttons both drawing themselves as selected.
                'optionGroups.*.id'                => 'nullable|string|max:40',
                'optionGroups.*.options.*.id'      => 'nullable|string|max:40',
                'optionGroups.*.options.*.label'   => 'required|string|max:60',
                'optionGroups.*.options.*.priceAdd'=> 'nullable|numeric|min:0|max:100000',
                'optionGroups.*.options.*.priceMode'=> 'nullable|string|in:unit,order',
                'optionGroups.*.options.*.imageUrl'=> 'nullable|string|max:600',
                'combinations'      => 'nullable|array',
                'trackInventory'    => 'boolean',
                'stock'             => 'nullable|integer|min:0',
                'stockStatus'       => 'nullable|string',
                'thumbnail'         => 'nullable|string|url',
                'images'            => 'nullable|array',
                'images.*'          => 'string|url',
                'tags'              => 'nullable|array',
                'tags.*'            => 'string',
                'isPublished'       => 'boolean',
                'isCustom'          => 'boolean',
                'allowPlainPurchase'=> 'boolean',
                'isActive'          => 'boolean',
                'bomId'             => 'nullable|string|max:24',
                'bomGroupName'      => 'nullable|string|max:200',
                'type'              => 'nullable|string|in:standalone,multi-variant',
                'variantStock'      => 'nullable|array',
                'variantImageUrls'  => 'nullable|array',
                'isMadeToOrder'       => 'nullable|boolean',
                'allowPreorder'       => 'nullable|boolean',
                'allowPreorder'       => 'nullable|boolean',
                'minOrderQty'         => 'nullable|integer|min:1',
                'designFee'           => 'nullable|numeric|min:0',
                // Print-ready templates the customer downloads before drawing anything -
                // a mug is curved, so guessing where the handle falls is how artwork gets
                // rejected. [{label, url}]
                'designTemplates'     => 'nullable|array|max:8',
                'designTemplates.*.label' => 'required_with:designTemplates|string|max:120',
                'designTemplates.*.url'   => 'required_with:designTemplates|string|max:600',
                'variantBackorder'    => 'nullable|array',
                'requiresDownpayment' => 'nullable|boolean',
                'downpaymentPercent'  => 'nullable|integer|min:1|max:100',
                'weightGrams'         => 'nullable|integer|min:1|max:99999',
                'storeStockCap'       => 'nullable|integer|min:0',
                'allowCOD'            => 'nullable|boolean',
                'hideWhenOutOfStock'  => 'nullable|boolean',
                'isFeatured'          => 'nullable|boolean',
            ]);

            // Check for duplicate (same category + subCategoryName)
            $duplicate = Product::where('category', $validated['category'])
                                ->where('subCategoryName', $validated['subCategoryName'])
                                ->where('isActive', true)
                                ->first();

            if ($duplicate) {
                return $this->errorResponse('Duplicate product: A product with this category and sub-category already exists.', 422);
            }

            // Inventory-linked product checks (only when inventoryId provided)
            if (!empty($validated['inventoryId'])) {
                $existingProduct = Product::where('inventoryId', $validated['inventoryId'])
                                          ->where('isActive', true)
                                          ->first();
                if ($existingProduct) {
                    return $this->errorResponse('This inventory item is already linked to another product.', 422);
                }

                $inventory = Inventory::find($validated['inventoryId']);
                if (!$inventory) {
                    return $this->notFoundResponse('Inventory item');
                }

                if (!isset($validated['stock']) && ($validated['trackInventory'] ?? false)) {
                    $validated['stock'] = $inventory->stockQty;
                }

                if (!isset($validated['stockStatus'])) {
                    if ($inventory->isOnDemand) {
                        $validated['stockStatus'] = 'upon-order';
                    } elseif (($validated['stock'] ?? 0) === 0) {
                        $validated['stockStatus'] = 'out-of-stock';
                    } elseif (($validated['stock'] ?? 0) <= 10) {
                        $validated['stockStatus'] = 'low-stock';
                    } else {
                        $validated['stockStatus'] = 'in-stock';
                    }
                }
            }

            // Compute stockStatus for non-inventory products
            if (empty($validated['inventoryId']) && !isset($validated['stockStatus'])) {
                if ($validated['isMadeToOrder'] ?? false) {
                    $validated['stockStatus'] = 'upon-order';
                } elseif (array_key_exists('stock', $validated)) {
                    if (($validated['stock'] ?? 0) === 0) {
                        $validated['stockStatus'] = 'out-of-stock';
                    } elseif (($validated['stock'] ?? 0) <= 10) {
                        $validated['stockStatus'] = 'low-stock';
                    } else {
                        $validated['stockStatus'] = 'in-stock';
                    }
                }
            }

            // Set defaults
            $validated['isActive'] = $validated['isActive'] ?? true;
            $validated['isPublished'] = $validated['isPublished'] ?? false;
            $validated['tags'] = $validated['tags'] ?? [];
            $validated['images'] = $validated['images'] ?? [];
            $validated['variantGroups'] = $validated['variantGroups'] ?? [];
            $validated['combinations'] = $validated['combinations'] ?? [];
            $validated['priceTiers'] = $validated['priceTiers'] ?? [];
            $validated['variantPrices'] = $validated['variantPrices'] ?? [];
            $validated['createdAt'] = now();
            // A deposit protects work started on something the shop cannot resell. Nothing is started
            // for an item that ships off the shelf, so a ready-made product cannot carry one - and
            // enforcing it here means a stale percentage on a product later switched to ready-made is
            // cleared rather than left to split a simple sale into two payments.
            $willBeCustom = array_key_exists('isCustom', $validated)
                ? (bool) $validated['isCustom']
                : (bool) ($product->isCustom ?? false);
            $willBeMTO = array_key_exists('isMadeToOrder', $validated)
                ? (bool) $validated['isMadeToOrder']
                : (bool) ($product->isMadeToOrder ?? false);
            if (!$willBeCustom && !$willBeMTO) {
                $validated['requiresDownpayment'] = false;
                $validated['downpaymentPercent']  = 0;
            }

            $validated['updatedAt'] = now();

            $validated['bomId'] = isset($validated['bomId']) && $validated['bomId'] !== ''
                ? new \MongoDB\BSON\ObjectId($validated['bomId'])
                : null;

            $product = Product::create($validated);

            Cache::forget('admin_products_list');

            return $this->successResponse('Product created successfully.', $product, 201);
        } catch (\Illuminate\Validation\ValidationException $e) {
            return $this->validationErrorResponse($e);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'An unexpected error occurred while creating the product.');
        }
    }

    /**
     * PUT /api/admin/products/{id}
     * Updates an existing product
     */
    public function update(Request $request, $id)
    {
        try {
            if (!$this->hasPermission($request, 'products')) {
                return $this->unauthorizedResponse();
            }

            $product = Product::find($id);

            if (!$product) {
                return $this->notFoundResponse('Product');
            }

            $validated = $request->validate([
                'name'              => 'sometimes|required|string|max:200',
                'inventoryId'       => [
                    'sometimes',
                    'required',
                    function ($attribute, $value, $fail) {
                        $found = Inventory::where('_id', $value)
                            ->where('isActive', true)
                            ->exists();
                        if (!$found) {
                            $fail('The selected inventory item does not exist or is inactive.');
                        }
                    },
                ],
                'category'          => 'sometimes|required|string|max:100',
                'subCategoryCode'   => 'nullable|string|max:10',
                'subCategoryName'   => 'sometimes|required|string|max:100',
                'description'       => 'nullable|string',
                'priceType'         => 'sometimes|required|in:fixed,tiered,inquiry',
                'price'             => 'nullable|numeric|min:0',
                'cost'              => 'nullable|numeric|min:0',
                'flatPrice'         => 'nullable|numeric|min:0',
                'priceTiers'        => 'nullable|array',
                'priceTiers.*.id'   => 'required',
                'priceTiers.*.minQty' => 'required|integer|min:1',
                'priceTiers.*.maxQty' => 'nullable|integer|min:1',
                'priceTiers.*.prices' => 'required|array',
                'variantPrices'     => 'nullable|array',
                'variantGroups'     => 'nullable|array',
                'optionGroups'      => 'nullable|array|max:4',
                'optionGroups.*.name'              => 'required_with:optionGroups|string|max:60',
                'optionGroups.*.options'           => 'required_with:optionGroups|array|min:1|max:12',
                // Every nested key needs its own rule. validate() returns ONLY the paths it was
                // given rules for, so an unlisted key is silently dropped between the request and
                // the database - which looked like two options sharing an id, and therefore two
                // buttons both drawing themselves as selected.
                'optionGroups.*.id'                => 'nullable|string|max:40',
                'optionGroups.*.options.*.id'      => 'nullable|string|max:40',
                'optionGroups.*.options.*.label'   => 'required|string|max:60',
                'optionGroups.*.options.*.priceAdd'=> 'nullable|numeric|min:0|max:100000',
                'optionGroups.*.options.*.priceMode'=> 'nullable|string|in:unit,order',
                'optionGroups.*.options.*.imageUrl'=> 'nullable|string|max:600',
                'combinations'      => 'nullable|array',
                'trackInventory'    => 'boolean',
                'stock'             => 'nullable|integer|min:0',
                'stockStatus'       => 'nullable|string',
                'thumbnail'         => 'nullable|string|url',
                'images'            => 'nullable|array',
                'images.*'          => 'string|url',
                'tags'              => 'nullable|array',
                'tags.*'            => 'string',
                'isPublished'       => 'boolean',
                'isCustom'          => 'boolean',
                'allowPlainPurchase'=> 'boolean',
                'isActive'          => 'boolean',
                'bomId'             => 'nullable|string|max:24',
                'bomGroupName'      => 'nullable|string|max:200',
                'type'              => 'nullable|string|in:standalone,multi-variant',
                'variantStock'        => 'nullable|array',
                'variantImageUrls'    => 'nullable|array',
                'isMadeToOrder'       => 'nullable|boolean',
                'minOrderQty'         => 'nullable|integer|min:1',
                'designFee'           => 'nullable|numeric|min:0',
                // Print-ready templates the customer downloads before drawing anything -
                // a mug is curved, so guessing where the handle falls is how artwork gets
                // rejected. [{label, url}]
                'designTemplates'     => 'nullable|array|max:8',
                'designTemplates.*.label' => 'required_with:designTemplates|string|max:120',
                'designTemplates.*.url'   => 'required_with:designTemplates|string|max:600',
                'variantBackorder'    => 'nullable|array',
                'requiresDownpayment' => 'nullable|boolean',
                'downpaymentPercent'  => 'nullable|integer|min:1|max:100',
                'weightGrams'         => 'nullable|integer|min:1|max:99999',
                'storeStockCap'       => 'nullable|integer|min:0',
                'allowCOD'            => 'nullable|boolean',
                'hideWhenOutOfStock'  => 'nullable|boolean',
                'isFeatured'          => 'nullable|boolean',
            ]);

            // Check for duplicate if category/subCategory changed
            if (isset($validated['category']) || isset($validated['subCategoryName'])) {
                $duplicate = Product::where('category', $validated['category'] ?? $product->category)
                                    ->where('subCategoryName', $validated['subCategoryName'] ?? $product->subCategoryName)
                                    ->where('_id', '!=', $id)
                                    ->where('isActive', true)
                                    ->first();

                if ($duplicate) {
                    return $this->errorResponse('Duplicate product: A product with this category and sub-category already exists.', 422);
                }
            }

            // Validate inventory link if changed
            if (isset($validated['inventoryId']) && $validated['inventoryId'] !== $product->inventoryId) {
                $existingProduct = Product::where('inventoryId', $validated['inventoryId'])
                                          ->where('_id', '!=', $id)
                                          ->where('isActive', true)
                                          ->first();
                if ($existingProduct) {
                    return $this->errorResponse('This inventory item is already linked to another product.', 422);
                }

                // Update stock from new inventory
                $inventory = Inventory::find($validated['inventoryId']);
                if ($inventory && ($validated['trackInventory'] ?? $product->trackInventory)) {
                    $validated['stock'] = $inventory->stockQty;
                }
            }

            // Recompute stockStatus when isMadeToOrder or stock changes
            if (!isset($validated['stockStatus'])) {
                $isMTO = $validated['isMadeToOrder'] ?? $product->isMadeToOrder ?? false;
                if ($isMTO) {
                    $validated['stockStatus'] = 'upon-order';
                } elseif (array_key_exists('stock', $validated)) {
                    $stock = $validated['stock'] ?? 0;
                    if ($stock === 0) {
                        $validated['stockStatus'] = 'out-of-stock';
                    } elseif ($stock <= 10) {
                        $validated['stockStatus'] = 'low-stock';
                    } else {
                        $validated['stockStatus'] = 'in-stock';
                    }
                }
            }

            $validated['updatedAt'] = now();

            if (array_key_exists('bomId', $validated)) {
                $validated['bomId'] = isset($validated['bomId']) && $validated['bomId'] !== ''
                    ? new \MongoDB\BSON\ObjectId($validated['bomId'])
                    : null;
            }

            $product->update($validated);

            Cache::forget('admin_products_list');

            return $this->successResponse('Product updated successfully.', $product);
        } catch (\Illuminate\Validation\ValidationException $e) {
            return $this->validationErrorResponse($e);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'An unexpected error occurred while updating the product.');
        }
    }

    /**
     * DELETE /api/admin/products/{id}
     * Hard-deletes a product permanently from the database
     */
    public function destroy(Request $request, $id)
    {
        try {
            if (!$this->hasPermission($request, 'products')) {
                return $this->unauthorizedResponse();
            }

            $product = Product::find($id);

            if (!$product) {
                return $this->notFoundResponse('Product');
            }

            $product->delete();

            Cache::forget('admin_products_list');

            return $this->successResponse('Product deleted permanently.');
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'An unexpected error occurred while deleting the product.');
        }
    }

    /**
     * POST /api/admin/products/{id}/toggle-publish
     * Toggle product publish status
     */
    public function togglePublish(Request $request, $id)
    {
        try {
            if (!$this->hasPermission($request, 'products')) {
                return $this->unauthorizedResponse();
            }

            $product = Product::find($id);

            if (!$product) {
                return $this->notFoundResponse('Product');
            }

            $product->isPublished = !$product->isPublished;
            $product->updatedAt = now();
            $product->save();

            // Log activity
            try {
                $adminUser = $request->user();
                ActivityLog::create([
                    'action'           => 'product_publish_toggled',
                    'entityType'       => 'product',
                    'entityId'         => (string) $product->_id,
                    'description'      => "Product \"" . ($product->name ?? 'Unknown') . "\" " .
                        ($product->isPublished ? 'published' : 'unpublished'),
                    'performedBy'      => $adminUser
                        ? trim("{$adminUser->firstName} {$adminUser->lastName}")
                        : 'admin',
                    'performedByEmail' => $adminUser->email ?? null,
                    'metadata'         => [
                        'productId'   => (string) $product->_id,
                        'productName' => $product->name ?? null,
                        'isPublished' => $product->isPublished,
                    ],
                    'createdAt'        => now(),
                ]);
            } catch (\Exception $logErr) {
                Log::warning('ActivityLog write failed (togglePublish)', [
                    'error' => $logErr->getMessage(),
                ]);
            }

            Cache::forget('admin_products_list');

            return $this->successResponse('Product publish status updated.', [
                'isPublished' => $product->isPublished
            ]);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'An unexpected error occurred while updating the publish status.');
        }
    }

    /**
     * POST /api/admin/upload-image
     * Upload image to Cloudinary
     */
    public function uploadImage(Request $request)
    {
        try {
            if (!$this->hasPermission($request, 'products')) {
                return $this->unauthorizedResponse();
            }

            $validated = $request->validate([
                'image' => 'required|image|max:5120', // 5MB max
                'folder' => 'nullable|string|max:100',
            ]);

            $cloudName = config('services.cloudinary.cloud_name');
            $uploadPreset = config('services.cloudinary.upload_preset');

            if (!$cloudName || !$uploadPreset) {
                return $this->errorResponse('Cloudinary configuration missing.', 500);
            }

            $file = $request->file('image');
            $folder = $validated['folder'] ?? 'pmp-products';

            // Upload to Cloudinary
            $response = Http::timeout(55)->attach(
                'file',
                fopen($file->getRealPath(), 'r'),
                $file->getClientOriginalName(),
                ['Content-Type' => $file->getMimeType()]
            )->post("https://api.cloudinary.com/v1_1/{$cloudName}/image/upload", [
                'upload_preset' => $uploadPreset,
                'folder' => $folder,
            ]);

            if ($response->successful()) {
                $data = $response->json();
                return $this->successResponse('Image uploaded successfully.', [
                    'url' => $data['secure_url'],
                    'public_id' => $data['public_id'],
                    'width' => $data['width'],
                    'height' => $data['height'],
                ]);
            }

            return $this->errorResponse('Failed to upload image.', 500);
        } catch (\Illuminate\Validation\ValidationException $e) {
            return $this->validationErrorResponse($e);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'An unexpected error occurred while uploading the image.');
        }
    }

    /**
     * POST /api/admin/upload-file
     * Upload a design format file (AI, PSD, PDF, SVG, PNG) to Cloudinary raw
     */
    public function uploadFile(Request $request)
    {
        try {
            if (!$this->hasPermission($request, 'products')) {
                return $this->unauthorizedResponse();
            }

            $request->validate([
                'file'   => 'required|file|max:20480', // 20MB
                'folder' => 'nullable|string|max:100',
            ]);

            $cloudName    = config('services.cloudinary.cloud_name');
            $uploadPreset = config('services.cloudinary.upload_preset');

            if (!$cloudName || !$uploadPreset) {
                return $this->errorResponse('Cloudinary configuration missing.', 500);
            }

            $file   = $request->file('file');
            $folder = $request->input('folder', 'pmp-design-formats');
            $ext    = strtolower($file->getClientOriginalExtension());

            // Cloudinary raw upload for non-image types
            $resourceType = in_array($ext, ['jpg', 'jpeg', 'png', 'webp', 'svg']) ? 'image' : 'raw';
            $endpoint     = "https://api.cloudinary.com/v1_1/{$cloudName}/{$resourceType}/upload";

            $response = Http::timeout(60)->attach(
                'file',
                fopen($file->getRealPath(), 'r'),
                $file->getClientOriginalName(),
                ['Content-Type' => $file->getMimeType()]
            )->post($endpoint, [
                'upload_preset' => $uploadPreset,
                'folder'        => $folder,
            ]);

            if ($response->successful()) {
                $data = $response->json();
                return $this->successResponse('File uploaded successfully.', [
                    'url'      => $data['secure_url'],
                    'public_id'=> $data['public_id'],
                    'name'     => $file->getClientOriginalName(),
                    'ext'      => $ext,
                ]);
            }

            return $this->errorResponse('Failed to upload file.', 500);
        } catch (\Illuminate\Validation\ValidationException $e) {
            return $this->validationErrorResponse($e);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'An unexpected error occurred while uploading the file.');
        }
    }

    /**
     * GET /api/products/search
     * Search products by query string (public endpoint)
     */
    public function search(Request $request)
    {
        try {
            $q = trim(strtolower($request->query('q', '')));
            
            // Return empty array if query is too short
            if (strlen($q) < 2) {
                return response()->json([]);
            }

            $category = trim($request->query('category', ''));

            // Build MongoDB regex query
            $query = Product::where('isPublished', true)
                ->where('isActive', true)
                ->where(function($qBuilder) use ($q) {
                    $pattern = new Regex(preg_quote($q, '/'), 'i');
                    $qBuilder->where('name', 'regex', $pattern)
                             ->orWhere('description', 'regex', $pattern)
                             ->orWhere('category', 'regex', $pattern)
                             ->orWhere('tags', 'regex', $pattern);
                });

            // Add category filter if provided
            if ($category !== '') {
                $query->where('category', $category);
            }

            // Limit to 8 results
            $products = $query->limit(8)->get();

            // Return only needed fields
            $results = $products->map(function($product) {
                return [
                    'id' => (string) $product->_id,
                    'name' => $product->name,
                    'category' => $product->category,
                    'images' => isset($product->images[0])
                        ? [$product->images[0]]
                        : [],
                    'flatPrice' => $product->flatPrice,
                    'priceTiers' => $product->priceTiers,
                    'tags' => $product->tags,
                ];
            });

            return response()->json($results);
        } catch (\Exception $e) {
            return response()->json([], 500);
        }
    }
}
