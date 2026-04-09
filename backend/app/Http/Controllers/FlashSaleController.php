<?php

namespace App\Http\Controllers;

use App\Models\FlashSale;
use App\Models\Product;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;

class FlashSaleController extends Controller
{
    /**
     * GET /admin/flash-sales
     */
    public function index(Request $request)
    {
        $limit = min((int) $request->query('limit', 50), 100);
        $sales = FlashSale::orderBy('createdAt', 'desc')
            ->limit($limit)
            ->get();

        $now = now();

        $sales = $sales->map(function ($sale) use ($now) {
            $sale->isLive = $sale->isActive
                && $sale->startDate <= $now
                && $sale->endDate >= $now;

            $product = Product::find($sale->productId);
            $originalPrice = $product
                ? ($product->flatPrice ?? $product->price ?? null)
                : null;

            if ($originalPrice !== null && $sale->discountType === 'percentage') {
                $sale->originalPrice = $originalPrice;
                $sale->discountedPrice = $originalPrice - ($originalPrice * $sale->discountValue / 100);
            } elseif ($originalPrice !== null && $sale->discountType === 'fixed') {
                $sale->originalPrice = $originalPrice;
                $sale->discountedPrice = max(0, $originalPrice - $sale->discountValue);
            } else {
                $sale->originalPrice = null;
                $sale->discountedPrice = null;
            }

            return $sale;
        });

        return response()->json([
            'data'  => $sales,
            'total' => $sales->count(),
        ]);
    }

    /**
     * POST /admin/flash-sales
     */
    public function store(Request $request)
    {
        $user = $request->user();
        if (!$user) {
            return response()->json(['message' => 'Unauthenticated.'], 401);
        }
        $validated = Validator::make($request->all(), [
            'productId'     => 'required|string',
            'discountType'  => 'required|in:percentage,fixed',
            'discountValue' => 'required|numeric|min:0.01',
            'startDate'     => 'required|date',
            'endDate'       => 'required|date|after:startDate',
            'isActive'      => 'boolean',
        ])->validate();

        // Extra validation: product exists
        $product = Product::find($validated['productId']);
        if (!$product) {
            return response()->json([
                'message' => 'Product not found.',
            ], 422);
        }

        $basePrice = $product->flatPrice ?? $product->price ?? 0;

        if ($validated['discountType'] === 'percentage' && $validated['discountValue'] >= 100) {
            return response()->json([
                'message' => 'Percentage discount must be less than 100%.',
            ], 422);
        }

        if ($validated['discountType'] === 'fixed' && $validated['discountValue'] >= $basePrice) {
            return response()->json([
                'message' => 'Fixed discount must be less than the product price.',
            ], 422);
        }

        // Overlap check
        $start = new \DateTime($validated['startDate']);
        $end = new \DateTime($validated['endDate']);
        $overlap = FlashSale::where('productId', $validated['productId'])
            ->where('isActive', true)
            ->where('startDate', '<', $end)
            ->where('endDate', '>', $start)
            ->exists();

        if ($overlap) {
            return response()->json([
                'message' => 'An active flash sale already exists for this product during the selected period.',
            ], 422);
        }

        $sale = FlashSale::create([
            'productId'        => $validated['productId'],
            'productName'      => $product->name ?? $product->subCategoryName ?? '',
            'productThumbnail' => $product->thumbnail ?? null,
            'discountType'     => $validated['discountType'],
            'discountValue'    => $validated['discountValue'],
            'startDate'        => $validated['startDate'],
            'endDate'          => $validated['endDate'],
            'isActive'         => $validated['isActive'] ?? true,
            'createdBy'        => $user?->name ?? $user?->email ?? 'admin',
        ]);

        return response()->json($sale, 201);
    }

    /**
     * PUT /admin/flash-sales/{id}
     */
    public function update(Request $request, $id)
    {
        $sale = FlashSale::find($id);
        if (!$sale) {
            return response()->json(['message' => 'Flash sale not found.'], 404);
        }

        $validated = Validator::make($request->all(), [
            'productId'     => 'required|string',
            'discountType'  => 'required|in:percentage,fixed',
            'discountValue' => 'required|numeric|min:0.01',
            'startDate'     => 'required|date',
            'endDate'       => 'required|date|after:startDate',
            'isActive'      => 'boolean',
        ])->validate();

        // Extra validation: product exists
        $product = Product::find($validated['productId']);
        if (!$product) {
            return response()->json([
                'message' => 'Product not found.',
            ], 422);
        }

        $basePrice = $product->flatPrice ?? $product->price ?? 0;

        if ($validated['discountType'] === 'percentage' && $validated['discountValue'] >= 100) {
            return response()->json([
                'message' => 'Percentage discount must be less than 100%.',
            ], 422);
        }

        if ($validated['discountType'] === 'fixed' && $validated['discountValue'] >= $basePrice) {
            return response()->json([
                'message' => 'Fixed discount must be less than the product price.',
            ], 422);
        }

        // Overlap check (exclude current sale)
        $start = new \DateTime($validated['startDate']);
        $end = new \DateTime($validated['endDate']);
        $overlap = FlashSale::where('productId', $validated['productId'])
            ->where('_id', '!=', $id)
            ->where('isActive', true)
            ->where('startDate', '<', $end)
            ->where('endDate', '>', $start)
            ->exists();

        if ($overlap) {
            return response()->json([
                'message' => 'An active flash sale already exists for this product during the selected period.',
            ], 422);
        }

        // Denormalize product fields
        $sale->update([
            'productId'        => $validated['productId'],
            'productName'      => $product->name ?? $product->subCategoryName ?? '',
            'productThumbnail' => $product->thumbnail ?? null,
            'discountType'     => $validated['discountType'],
            'discountValue'    => $validated['discountValue'],
            'startDate'        => $validated['startDate'],
            'endDate'          => $validated['endDate'],
            'isActive'         => $validated['isActive'] ?? $sale->isActive,
        ]);

        return response()->json($sale);
    }

    /**
     * DELETE /admin/flash-sales/{id}
     */
    public function destroy($id)
    {
        $sale = FlashSale::find($id);
        if (!$sale) {
            return response()->json(['message' => 'Flash sale not found.'], 404);
        }

        $sale->delete();

        return response()->noContent(); // 204
    }

    /**
     * PATCH /admin/flash-sales/{id}/toggle
     */
    public function toggle($id)
    {
        $sale = FlashSale::find($id);
        if (!$sale) {
            return response()->json(['message' => 'Flash sale not found.'], 404);
        }

        $sale->isActive = !$sale->isActive;
        $sale->save();

        return response()->json($sale);
    }

    /**
     * GET /storefront/flash-sales
     */
    public function storefront()
    {
        $now = now();
        $sales = FlashSale::where('isActive', true)
            ->where('startDate', '<=', $now)
            ->where('endDate', '>=', $now)
            ->orderBy('endDate', 'asc')
            ->get();

        $mapped = $sales->map(function ($sale) {
            $product = Product::find($sale->productId);
            $originalPrice = $product
                ? ($product->flatPrice ?? $product->price ?? null)
                : null;

            if ($originalPrice !== null && $sale->discountType === 'percentage') {
                $discountedPrice = $originalPrice - ($originalPrice * $sale->discountValue / 100);
            } elseif ($originalPrice !== null && $sale->discountType === 'fixed') {
                $discountedPrice = max(0, $originalPrice - $sale->discountValue);
            } else {
                $originalPrice = null;
                $discountedPrice = null;
            }

            return [
                'productId'        => $sale->productId,
                'productName'      => $sale->productName,
                'productThumbnail' => $sale->productThumbnail,
                'discountType'     => $sale->discountType,
                'discountValue'    => $sale->discountValue,
                'originalPrice'    => $originalPrice,
                'discountedPrice'  => $discountedPrice,
                'endDate'          => $sale->endDate,
            ];
        });

        return response()->json(['data' => $mapped]);
    }
}
