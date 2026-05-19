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
        if (!empty($product->bomGroupName)) {
            try {
                $boms = \App\Models\BillOfMaterial::where('productGroupName', $product->bomGroupName)->get();
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
                        $min = min($min, (int) floor(($inv->stockQty ?? 0) / $qpu));
                    }
                    $cp = $min === PHP_INT_MAX ? 0 : $min;
                    $variantCanProduce[$bomId] = $cp;

                    $backorder = (bool) ($product->variantBackorder[$bomId] ?? false);
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
                            $min = min($min, (int) floor(($inv->stockQty ?? 0) / $qpu));
                        }
                        $cp = $min === PHP_INT_MAX ? 0 : $min;
                        $variantCanProduce[$comboId] = $cp;
                        $backorder = (bool) ($product->variantBackorder[$comboId] ?? false);
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
                        $min = min($min, (int) floor(($inv->stockQty ?? 0) / $qpu));
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

            $data = $products->map(fn($p) => array_merge($p->toArray(), $this->computeAvailability($p)))->values();

            return $this->successResponse('Products fetched successfully.', $data);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'An unexpected error occurred while fetching products.');
        }
    }

    /**
     * GET /api/products/{id}
     * Returns a single active product by ID
     */
    public function show($id)
    {
        try {
            $product = Product::where('_id', $id)
                              ->where('isActive', true)
                              ->where('isPublished', true)
                              ->first();

            if (!$product) {
                return $this->notFoundResponse('Product');
            }

            $data = array_merge($product->toArray(), $this->computeAvailability($product));

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
                'flatPrice'         => 'nullable|numeric|min:0',
                'priceTiers'        => 'nullable|array',
                'priceTiers.*.id'   => 'required',
                'priceTiers.*.minQty' => 'required|integer|min:1',
                'priceTiers.*.maxQty' => 'nullable|integer|min:1',
                'priceTiers.*.prices' => 'required|array',
                'variantPrices'     => 'nullable|array',
                'variantGroups'     => 'nullable|array',
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
                'isActive'          => 'boolean',
                'bomId'             => 'nullable|string|max:24',
                'bomGroupName'      => 'nullable|string|max:200',
                'variantStock'      => 'nullable|array',
                'variantImageUrls'  => 'nullable|array',
                'isMadeToOrder'       => 'nullable|boolean',
                'minOrderQty'         => 'nullable|integer|min:1',
                'designFee'           => 'nullable|numeric|min:0',
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
                'flatPrice'         => 'nullable|numeric|min:0',
                'priceTiers'        => 'nullable|array',
                'priceTiers.*.id'   => 'required',
                'priceTiers.*.minQty' => 'required|integer|min:1',
                'priceTiers.*.maxQty' => 'nullable|integer|min:1',
                'priceTiers.*.prices' => 'required|array',
                'variantPrices'     => 'nullable|array',
                'variantGroups'     => 'nullable|array',
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
                'isActive'          => 'boolean',
                'bomId'             => 'nullable|string|max:24',
                'bomGroupName'      => 'nullable|string|max:200',
                'variantStock'        => 'nullable|array',
                'variantImageUrls'    => 'nullable|array',
                'isMadeToOrder'       => 'nullable|boolean',
                'minOrderQty'         => 'nullable|integer|min:1',
                'designFee'           => 'nullable|numeric|min:0',
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
