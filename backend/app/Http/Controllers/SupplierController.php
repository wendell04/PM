<?php

namespace App\Http\Controllers;

use App\Models\Supplier;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;

class SupplierController extends Controller
{
    /**
     * Get authenticated user by Bearer token
     */
    private function getAuthUser(Request $request): ?User
    {
        return $request->user();
    }

    /**
     * GET /api/admin/suppliers
     * Returns all active suppliers
     */
    public function index(Request $request)
    {
        try {
            if (!$this->isAdmin($request)) {
                return $this->unauthorizedResponse();
            }

            $hasSearch = $request->filled('search');

            if ($hasSearch) {
                // Search requests: never cache — build and run directly
                $search = $request->search;
                $suppliers = Supplier::where('isActive', true)
                    ->where(function ($q) use ($search) {
                        $q->where('name', 'like', "%{$search}%")
                          ->orWhere('contactPerson', 'like', "%{$search}%")
                          ->orWhere('email', 'like', "%{$search}%")
                          ->orWhere('phone', 'like', "%{$search}%");
                    })
                    ->orderBy('name', 'asc')
                    ->get();
            } else {
                // Full list: cache for 120 seconds
                $cacheKey = 'suppliers_list_' . (auth()->id() ?? 'guest');
                $suppliers = Cache::remember($cacheKey, 120, function () {
                    return Supplier::where('isActive', true)
                        ->orderBy('name', 'asc')
                        ->get();
                });
            }

            return $this->successResponse('Suppliers fetched successfully.', $suppliers);
        } catch (\Exception $e) {
            return $this->serverErrorResponse(
                $e,
                'An unexpected error occurred while fetching suppliers.'
            );
        }
    }

    public function store(Request $request)
    {
        try {
            if (!$this->isAdmin($request)) {
                return $this->unauthorizedResponse();
            }

            $validated = $request->validate([
                'name'          => 'required|string|max:255',
                'contactPerson' => 'nullable|string|max:255',
                'phone'         => 'nullable|string|max:20',
                'email'         => 'nullable|email|max:255',
                'address'       => 'nullable|string|max:500',
                'notes'         => 'nullable|string',
                'itemsSupplied' => 'nullable|array',
                'itemsSupplied.*.name' => 'nullable|string|max:255',
                'itemsSupplied.*.uom'  => 'nullable|string|max:50',
            ]);

            // Check for duplicate supplier name
            $duplicate = Supplier::where('name', $validated['name'])
                                 ->where('isActive', true)
                                 ->first();

            if ($duplicate) {
                return $this->errorResponse('Duplicate supplier: A supplier with this name already exists.', 422);
            }

            $supplier = Supplier::create([
                'name'          => $validated['name'],
                'contactPerson' => $validated['contactPerson'] ?? null,
                'phone'         => $validated['phone'] ?? null,
                'email'         => $validated['email'] ?? null,
                'address'       => $validated['address'] ?? null,
                'notes'         => $validated['notes'] ?? null,
                'itemsSupplied' => $validated['itemsSupplied'] ?? [],
                'isActive'      => true,
            ]);

            Cache::forget('suppliers_list_' . auth()->id());

            return $this->successResponse('Supplier created successfully.', $supplier, 201);
        } catch (\Illuminate\Validation\ValidationException $e) {
            return $this->validationErrorResponse($e);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'An unexpected error occurred while creating the supplier.');
        }
    }

    public function update(Request $request, $id)
    {
        try {
            if (!$this->isAdmin($request)) {
                return $this->unauthorizedResponse();
            }

            $supplier = Supplier::find($id);

            if (!$supplier) {
                return $this->notFoundResponse('Supplier');
            }

            $validated = $request->validate([
                'name'          => 'sometimes|required|string|max:255',
                'contactPerson' => 'nullable|string|max:255',
                'phone'         => 'nullable|string|max:20',
                'email'         => 'nullable|email|max:255',
                'address'       => 'nullable|string|max:500',
                'notes'         => 'nullable|string',
                'itemsSupplied' => 'nullable|array',
                'itemsSupplied.*.name' => 'nullable|string|max:255',
                'itemsSupplied.*.uom'  => 'nullable|string|max:50',
                'isActive'      => 'sometimes|boolean',
            ]);

            // Check for duplicate if name changed
            if (isset($validated['name']) && $validated['name'] !== $supplier->name) {
                $duplicate = Supplier::where('name', $validated['name'])
                                     ->where('_id', '!=', $id)
                                     ->where('isActive', true)
                                     ->first();

                if ($duplicate) {
                    return $this->errorResponse('Duplicate supplier: A supplier with this name already exists.', 422);
                }
            }

            $supplier->update($validated);

            Cache::forget('suppliers_list_' . auth()->id());

            return $this->successResponse('Supplier updated successfully.', $supplier);
        } catch (\Illuminate\Validation\ValidationException $e) {
            return $this->validationErrorResponse($e);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'An unexpected error occurred while updating the supplier.');
        }
    }

    public function destroy(Request $request, $id)
    {
        try {
            if (!$this->isAdmin($request)) {
                return $this->unauthorizedResponse();
            }

            $supplier = Supplier::find($id);

            if (!$supplier) {
                return $this->notFoundResponse('Supplier');
            }

            // Check if supplier is referenced by any inventory items
            $linkedInventory = \App\Models\Inventory::where('supplierId', $id)
                                                     ->where('isActive', true)
                                                     ->count();

            if ($linkedInventory > 0) {
                return $this->errorResponse('Cannot delete: Supplier is linked to ' . $linkedInventory . ' inventory item(s).', 422);
            }

            // Soft delete — keep data, just hide from list
            $supplier->update(['isActive' => false]);

            Cache::forget('suppliers_list_' . auth()->id());

            return $this->successResponse('Supplier deactivated successfully.');
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'An unexpected error occurred while deleting the supplier.');
        }
    }
}
