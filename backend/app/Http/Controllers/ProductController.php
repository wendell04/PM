<?php

namespace App\Http\Controllers;

use App\Models\Product;
use App\Models\Inventory;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Http;

class ProductController extends Controller
{
    // ─── Public ───────────────────────────────────────────────────────────────

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
                $query->where('tags', $request->tag);
            }

            if ($request->filled('search')) {
                $search = $request->search;
                $query->where(function($q) use ($search) {
                    $q->where('name', 'like', "%{$search}%")
                      ->orWhere('description', 'like', "%{$search}%");
                });
            }

            $products = $query->orderBy('created_at', 'desc')->get();

            return response()->json($products);
        } catch (\Exception $e) {
            Log::error('ProductController@index: Failed to fetch products', ['error' => $e->getMessage()]);
            return response()->json(['error' => 'An unexpected error occurred while fetching products.'], 500);
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
                return response()->json(['error' => 'Product not found.'], 404);
            }

            return response()->json($product);
        } catch (\Exception $e) {
            Log::error('ProductController@show: Failed to fetch product ' . $id, ['error' => $e->getMessage()]);
            return response()->json(['error' => 'An unexpected error occurred while fetching the product.'], 500);
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
            if (!$this->isAdmin($request)) return response()->json(['message' => 'unauthorized'], 403);
            
            $products = Product::with('inventory')->orderBy('created_at', 'desc')->get();
            return response()->json($products);
        } catch (\Exception $e) {
            Log::error('ProductController@adminIndex: Failed to fetch products', ['error' => $e->getMessage()]);
            return response()->json(['error' => 'An unexpected error occurred while fetching products.'], 500);
        }
    }

    /**
     * GET /api/admin/products/available-inventory
     * Returns inventory items NOT yet linked to products
     */
    public function availableInventory(Request $request)
    {
        try {
            if (!$this->isAdmin($request)) return response()->json(['message' => 'unauthorized'], 403);

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

            return response()->json($available);
        } catch (\Exception $e) {
            Log::error('ProductController@availableInventory: Failed to fetch available inventory', ['error' => $e->getMessage()]);
            return response()->json(['error' => 'An unexpected error occurred while fetching available inventory.'], 500);
        }
    }

    /**
     * POST /api/admin/products
     * Creates a new product
     */
    public function store(Request $request)
    {
        try {
            if (!$this->isAdmin($request)) return response()->json(['message' => 'unauthorized'], 403);

            $validated = $request->validate([
                'inventoryId'       => 'required|exists:inventory,_id',
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
                'isActive'          => 'boolean',
            ]);

            // Check for duplicate (same category + subCategoryName)
            $duplicate = Product::where('category', $validated['category'])
                                ->where('subCategoryName', $validated['subCategoryName'])
                                ->where('isActive', true)
                                ->first();

            if ($duplicate) {
                return response()->json(['error' => 'Duplicate product: A product with this category and sub-category already exists.'], 422);
            }

            // Validate inventory link (1:1 relationship)
            $existingProduct = Product::where('inventoryId', $validated['inventoryId'])
                                      ->where('isActive', true)
                                      ->first();
            if ($existingProduct) {
                return response()->json(['error' => 'This inventory item is already linked to another product.'], 422);
            }

            // Get inventory to auto-fill stock if trackInventory is enabled
            $inventory = Inventory::find($validated['inventoryId']);
            if (!$inventory) {
                return response()->json(['error' => 'Inventory item not found.'], 404);
            }

            // Auto-set stock from inventory if not provided
            if (!isset($validated['stock']) && $validated['trackInventory'] ?? false) {
                $validated['stock'] = $inventory->stockQty;
            }

            // Auto-set stock status
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

            $product = Product::create($validated);

            return response()->json($product, 201);
        } catch (\Illuminate\Validation\ValidationException $e) {
            Log::warning('ProductController@store: Validation failed', ['errors' => $e->errors()]);
            return response()->json(['errors' => $e->errors()], 422);
        } catch (\Exception $e) {
            Log::error('ProductController@store: Failed to create product', ['error' => $e->getMessage()]);
            return response()->json(['error' => 'An unexpected error occurred while creating the product.'], 500);
        }
    }

    /**
     * PUT /api/admin/products/{id}
     * Updates an existing product
     */
    public function update(Request $request, $id)
    {
        try {
            if (!$this->isAdmin($request)) return response()->json(['message' => 'unauthorized'], 403);

            $product = Product::find($id);

            if (!$product) {
                return response()->json(['error' => 'Product not found.'], 404);
            }

            $validated = $request->validate([
                'inventoryId'       => 'sometimes|required|exists:inventory,_id',
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
                'isActive'          => 'boolean',
            ]);

            // Check for duplicate if category/subCategory changed
            if (isset($validated['category']) || isset($validated['subCategoryName'])) {
                $duplicate = Product::where('category', $validated['category'] ?? $product->category)
                                    ->where('subCategoryName', $validated['subCategoryName'] ?? $product->subCategoryName)
                                    ->where('_id', '!=', $id)
                                    ->where('isActive', true)
                                    ->first();

                if ($duplicate) {
                    return response()->json(['error' => 'Duplicate product: A product with this category and sub-category already exists.'], 422);
                }
            }

            // Validate inventory link if changed
            if (isset($validated['inventoryId']) && $validated['inventoryId'] !== $product->inventoryId) {
                $existingProduct = Product::where('inventoryId', $validated['inventoryId'])
                                          ->where('_id', '!=', $id)
                                          ->where('isActive', true)
                                          ->first();
                if ($existingProduct) {
                    return response()->json(['error' => 'This inventory item is already linked to another product.'], 422);
                }

                // Update stock from new inventory
                $inventory = Inventory::find($validated['inventoryId']);
                if ($inventory && ($validated['trackInventory'] ?? $product->trackInventory)) {
                    $validated['stock'] = $inventory->stockQty;
                }
            }

            $validated['updatedAt'] = now();
            $product->update($validated);

            return response()->json($product);
        } catch (\Illuminate\Validation\ValidationException $e) {
            Log::warning('ProductController@update: Validation failed for product ' . $id, ['errors' => $e->errors()]);
            return response()->json(['errors' => $e->errors()], 422);
        } catch (\Exception $e) {
            Log::error('ProductController@update: Failed to update product ' . $id, ['error' => $e->getMessage()]);
            return response()->json(['error' => 'An unexpected error occurred while updating the product.'], 500);
        }
    }

    /**
     * DELETE /api/admin/products/{id}
     * Soft-deletes (deactivates) a product
     */
    public function destroy(Request $request, $id)
    {
        try {
            if (!$this->isAdmin($request)) return response()->json(['message' => 'unauthorized'], 403);

            $product = Product::find($id);

            if (!$product) {
                return response()->json(['error' => 'Product not found.'], 404);
            }

            // Soft delete — keep data, just hide from store
            $product->update(['isActive' => false, 'updatedAt' => now()]);

            return response()->json(['message' => 'Product deactivated successfully.']);
        } catch (\Exception $e) {
            Log::error('ProductController@destroy: Failed to delete product ' . $id, ['error' => $e->getMessage()]);
            return response()->json(['error' => 'An unexpected error occurred while deleting the product.'], 500);
        }
    }

    /**
     * POST /api/admin/products/{id}/toggle-publish
     * Toggle product publish status
     */
    public function togglePublish(Request $request, $id)
    {
        try {
            if (!$this->isAdmin($request)) return response()->json(['message' => 'unauthorized'], 403);

            $product = Product::find($id);

            if (!$product) {
                return response()->json(['error' => 'Product not found.'], 404);
            }

            $product->isPublished = !$product->isPublished;
            $product->updatedAt = now();
            $product->save();

            return response()->json([
                'message' => 'Product publish status updated.',
                'isPublished' => $product->isPublished
            ]);
        } catch (\Exception $e) {
            Log::error('ProductController@togglePublish: Failed for product ' . $id, ['error' => $e->getMessage()]);
            return response()->json(['error' => 'An unexpected error occurred while updating the publish status.'], 500);
        }
    }

    /**
     * POST /api/admin/upload-image
     * Upload image to Cloudinary
     */
    public function uploadImage(Request $request)
    {
        try {
            if (!$this->isAdmin($request)) return response()->json(['message' => 'unauthorized'], 403);

            $validated = $request->validate([
                'image' => 'required|image|max:5120', // 5MB max
                'folder' => 'nullable|string|max:100',
            ]);

            $cloudName = config('services.cloudinary.cloud_name');
            $uploadPreset = config('services.cloudinary.upload_preset');

            if (!$cloudName || !$uploadPreset) {
                return response()->json(['error' => 'Cloudinary configuration missing.'], 500);
            }

            $file = $request->file('image');
            $folder = $validated['folder'] ?? 'pmp-products';

            // Upload to Cloudinary
            $response = Http::attach(
                'file',
                file_get_contents($file->getRealPath()),
                $file->getClientOriginalName(),
                ['Content-Type' => $file->getMimeType()]
            )->post("https://api.cloudinary.com/v1_1/{$cloudName}/image/upload", [
                'upload_preset' => $uploadPreset,
                'folder' => $folder,
            ]);

            if ($response->successful()) {
                $data = $response->json();
                return response()->json([
                    'url' => $data['secure_url'],
                    'public_id' => $data['public_id'],
                    'width' => $data['width'],
                    'height' => $data['height'],
                ]);
            }

            return response()->json(['error' => 'Failed to upload image.'], 500);
        } catch (\Illuminate\Validation\ValidationException $e) {
            Log::warning('ProductController@uploadImage: Validation failed', ['errors' => $e->errors()]);
            return response()->json(['errors' => $e->errors()], 422);
        } catch (\Exception $e) {
            Log::error('ProductController@uploadImage: Failed to upload image', ['error' => $e->getMessage()]);
            return response()->json(['error' => 'An unexpected error occurred while uploading the image.'], 500);
        }
    }
}
