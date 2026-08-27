<?php

namespace App\Http\Controllers;

use App\Models\BillOfMaterial;
use App\Models\Inventory;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

class BillOfMaterialController extends Controller
{
    /**
     * GET /api/admin/bom
     * Returns all active BOMs, optionally filtered by productGroupName.
     */
    public function index(Request $request)
    {
        try {
            if (!$this->isAdmin($request)) {
                return $this->unauthorizedResponse();
            }

            $query = BillOfMaterial::where('isActive', true)
                ->orderBy('productGroupName', 'asc');

            if ($request->filled('productGroupName')) {
                $query->where('productGroupName', $request->productGroupName);
            }

            $boms = $query->get();

            return $this->successResponse('BOMs fetched successfully.', $boms);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'Failed to fetch BOMs.');
        }
    }

    /**
     * GET /api/admin/bom/by-product/{name}
     * Returns all active BOMs for a given productGroupName.
     * Used by CreateJOModal and BOMVerification UI.
     */
    public function byProduct(Request $request, string $name)
    {
        try {
            if (!$this->isAdmin($request)) {
                return $this->unauthorizedResponse();
            }

            $boms = BillOfMaterial::where('productGroupName', $name)
                ->where('isActive', true)
                ->orderBy('variantName', 'asc')
                ->get();

            return $this->successResponse('BOMs fetched successfully.', $boms);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'Failed to fetch BOMs by product.');
        }
    }

    /**
     * GET /api/admin/bom/{id}
     * Returns a single BOM by ID.
     */
    public function show(Request $request, string $id)
    {
        try {
            if (!$this->isAdmin($request)) {
                return $this->unauthorizedResponse();
            }

            $bom = BillOfMaterial::find($id);

            if (!$bom) {
                return $this->notFoundResponse('BOM');
            }

            return $this->successResponse('BOM fetched successfully.', $bom);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'Failed to fetch BOM.');
        }
    }

    /**
     * POST /api/admin/bom
     * Creates a new BOM entry.
     * Calculates totalCost from components on creation.
     */
    public function store(Request $request)
    {
        try {
            if (!$this->isAdmin($request)) {
                return $this->unauthorizedResponse();
            }

            $validated = $request->validate([
                'productName'      => 'required|string|max:255',
                'productGroupName' => 'required|string|max:255',
                // A standalone product BOM has no variant. Laravel turns the '' the form sends into
                // null before validation, so 'required|string' rejected every save from the Product
                // Creation tab - create and edit alike.
                'variantName'      => 'nullable|string|max:255',
                'variantCombo'     => 'nullable|array',
                'components'       => 'required|array|min:1',
                'components.*.inventoryId'  => 'required|string',
                'components.*.materialName' => 'required|string',
                'components.*.qty'          => 'required|numeric|min:0.001',
                'components.*.unit'         => 'required|string',
                'components.*.unitCost'     => 'required|numeric|min:0',
            ]);

            // Generate SKU — BOM-XXXX sequential
            $last = BillOfMaterial::orderBy('createdAt', 'desc')->first();
            $lastNum = 0;
            if ($last && isset($last->sku) && str_starts_with($last->sku, 'BOM-')) {
                $lastNum = (int) substr($last->sku, 4);
            }
            $sku = 'BOM-' . str_pad($lastNum + 1, 4, '0', STR_PAD_LEFT);

            // Calculate totalCost from components
            $totalCost = collect($validated['components'])
                ->sum(fn($c) => (float) $c['qty'] * (float) $c['unitCost']);

            $bom = BillOfMaterial::create([
                'sku'              => $sku,
                'productName'      => $validated['productName'],
                'productGroupName' => $validated['productGroupName'],
                'variantName'      => $validated['variantName'] ?? '',
                'variantCombo'     => $validated['variantCombo'] ?? [],
                'components'       => $validated['components'],
                'totalCost'        => round($totalCost, 4),
                'isActive'         => true,
                'createdAt'        => now(),
                'updatedAt'        => now(),
            ]);

            return $this->successResponse('BOM created successfully.', $bom, 201);
        } catch (\Illuminate\Validation\ValidationException $e) {
            return $this->validationErrorResponse($e);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'Failed to create BOM.');
        }
    }

    /**
     * PUT /api/admin/bom/{id}
     * Updates an existing BOM. Recalculates totalCost if components change.
     */
    public function update(Request $request, string $id)
    {
        try {
            if (!$this->isAdmin($request)) {
                return $this->unauthorizedResponse();
            }

            $bom = BillOfMaterial::find($id);

            if (!$bom) {
                return $this->notFoundResponse('BOM');
            }

            $validated = $request->validate([
                'productName'      => 'sometimes|string|max:255',
                'productGroupName' => 'sometimes|string|max:255',
                'variantName'      => 'sometimes|nullable|string|max:255',
                'variantCombo'     => 'nullable|array',
                'components'       => 'sometimes|array|min:1',
                'components.*.inventoryId'  => 'required_with:components|string',
                'components.*.materialName' => 'required_with:components|string',
                'components.*.qty'          => 'required_with:components|numeric|min:0.001',
                'components.*.unit'         => 'required_with:components|string',
                'components.*.unitCost'     => 'required_with:components|numeric|min:0',
            ]);

            // Recalculate totalCost if components were updated
            if (isset($validated['components'])) {
                $validated['totalCost'] = round(
                    collect($validated['components'])
                        ->sum(fn($c) => (float) $c['qty'] * (float) $c['unitCost']),
                    4
                );
            }

            $validated['updatedAt'] = now();
            $bom->update($validated);

            return $this->successResponse('BOM updated successfully.', $bom);
        } catch (\Illuminate\Validation\ValidationException $e) {
            return $this->validationErrorResponse($e);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'Failed to update BOM.');
        }
    }

    /**
     * DELETE /api/admin/bom/{id}
     * Soft-deletes a BOM by setting isActive = false.
     * Never hard-deletes — historical JO records reference BOM data.
     */
    public function destroy(Request $request, string $id)
    {
        try {
            if (!$this->isAdmin($request)) {
                return $this->unauthorizedResponse();
            }

            $bom = BillOfMaterial::find($id);

            if (!$bom) {
                return $this->notFoundResponse('BOM');
            }

            $bom->isActive  = false;
            $bom->updatedAt = now();
            $bom->save();

            return $this->successResponse('BOM deactivated successfully.');
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'Failed to deactivate BOM.');
        }
    }
}
