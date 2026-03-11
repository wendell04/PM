<?php

namespace App\Http\Controllers;

use App\Models\Product;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

class ProductController extends Controller
{
    // ─── Public ───────────────────────────────────────────────────────────────

    /**
     * GET /api/products
     * Returns all active products. Optionally filter by category or tag.
     */
    public function index(Request $request)
    {
        try {
            $query = Product::where('isActive', true);

            if ($request->filled('category')) {
                $query->where('category', $request->category);
            }

            if ($request->filled('tag')) {
                $query->where('tags', $request->tag);
            }

            $products = $query->orderBy('created_at', 'desc')->get();

            return response()->json($products);
        } catch (\Exception $e) {
            Log::error('ProductController@index: ' . $e->getMessage());
            return response()->json(['error' => 'Failed to fetch products.'], 500);
        }
    }

    /**
     * GET /api/products/{id}
     * Returns a single active product by ID.
     */
    public function show($id)
    {
        try {
            $product = Product::where('_id', $id)->where('isActive', true)->first();

            if (!$product) {
                return response()->json(['error' => 'Product not found.'], 404);
            }

            return response()->json($product);
        } catch (\Exception $e) {
            Log::error('ProductController@show: ' . $e->getMessage());
            return response()->json(['error' => 'Failed to fetch product.'], 500);
        }
    }

    // ─── Admin Only ───────────────────────────────────────────────────────────

    /**
     * GET /api/admin/products
     * Returns all products (including inactive) for the admin dashboard.
     */
    public function adminIndex()
    {
        try {
            $products = Product::orderBy('created_at', 'desc')->get();
            return response()->json($products);
        } catch (\Exception $e) {
            Log::error('ProductController@adminIndex: ' . $e->getMessage());
            return response()->json(['error' => 'Failed to fetch products.'], 500);
        }
    }

    /**
     * POST /api/admin/products
     * Creates a new product.
     */
    public function store(Request $request)
    {
        try {
            $validated = $request->validate([
                'name'           => 'required|string|max:255',
                'description'    => 'required|string',
                'category'       => 'required|string|max:100',
                'tags'           => 'nullable|array',
                'tags.*'         => 'string|max:50',
                'images'         => 'nullable|array',
                'images.*'       => 'string|url',
                'variants'       => 'nullable|array',
                'variants.*.name'=> 'required|string|max:100',
                'variants.*.sku' => 'nullable|string|max:100',
                'priceTiers'              => 'nullable|array',
                'priceTiers.*.minQty'     => 'required|integer|min:1',
                'priceTiers.*.maxQty'     => 'nullable|integer|min:1',
                'priceTiers.*.price'      => 'required|numeric|min:0',
                'flatPrice'      => 'nullable|numeric|min:0',
                'isActive'       => 'boolean',
            ]);

            $product = Product::create($validated);

            return response()->json($product, 201);
        } catch (\Illuminate\Validation\ValidationException $e) {
            return response()->json(['errors' => $e->errors()], 422);
        } catch (\Exception $e) {
            Log::error('ProductController@store: ' . $e->getMessage());
            return response()->json(['error' => 'Failed to create product.'], 500);
        }
    }

    /**
     * PUT /api/admin/products/{id}
     * Updates an existing product.
     */
    public function update(Request $request, $id)
    {
        try {
            $product = Product::find($id);

            if (!$product) {
                return response()->json(['error' => 'Product not found.'], 404);
            }

            $validated = $request->validate([
                'name'           => 'sometimes|string|max:255',
                'description'    => 'sometimes|string',
                'category'       => 'sometimes|string|max:100',
                'tags'           => 'nullable|array',
                'tags.*'         => 'string|max:50',
                'images'         => 'nullable|array',
                'images.*'       => 'string|url',
                'variants'       => 'nullable|array',
                'variants.*.name'=> 'required|string|max:100',
                'variants.*.sku' => 'nullable|string|max:100',
                'priceTiers'              => 'nullable|array',
                'priceTiers.*.minQty'     => 'required|integer|min:1',
                'priceTiers.*.maxQty'     => 'nullable|integer|min:1',
                'priceTiers.*.price'      => 'required|numeric|min:0',
                'flatPrice'      => 'nullable|numeric|min:0',
                'isActive'       => 'boolean',
            ]);

            $product->update($validated);

            return response()->json($product);
        } catch (\Illuminate\Validation\ValidationException $e) {
            return response()->json(['errors' => $e->errors()], 422);
        } catch (\Exception $e) {
            Log::error('ProductController@update: ' . $e->getMessage());
            return response()->json(['error' => 'Failed to update product.'], 500);
        }
    }

    /**
     * DELETE /api/admin/products/{id}
     * Soft-deletes (deactivates) a product by setting isActive = false.
     */
    public function destroy($id)
    {
        try {
            $product = Product::find($id);

            if (!$product) {
                return response()->json(['error' => 'Product not found.'], 404);
            }

            // Soft delete — keep data, just hide from store
            $product->update(['isActive' => false]);

            return response()->json(['message' => 'Product deactivated successfully.']);
        } catch (\Exception $e) {
            Log::error('ProductController@destroy: ' . $e->getMessage());
            return response()->json(['error' => 'Failed to delete product.'], 500);
        }
    }
}