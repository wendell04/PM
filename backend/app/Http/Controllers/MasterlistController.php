<?php

namespace App\Http\Controllers;

use App\Models\Masterlist;
use Illuminate\Http\Request;

class MasterlistController extends Controller
{
    /**
     * GET /api/admin/masterlist
     * Returns the masterlist categories array.
     */
    public function index(Request $request)
    {
        try {
            if (!$this->isAdmin($request)) {
                return $this->unauthorizedResponse();
            }

            $masterlist = Masterlist::first();
            $categories = $masterlist ? ($masterlist->categories ?? []) : [];

            return $this->successResponse('Masterlist fetched successfully.', [
                'categories' => $categories,
            ]);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'An unexpected error occurred while fetching masterlist.');
        }
    }

    /**
     * PUT /api/admin/masterlist
     * Replaces the entire masterlist categories array.
     */
    public function update(Request $request)
    {
        try {
            if (!$this->isAdmin($request)) {
                return $this->unauthorizedResponse();
            }

            $validated = $request->validate([
                'categories'             => 'required|array',
                'categories.*.id'        => 'required|string',
                'categories.*.name'      => 'required|string|max:100',
                'categories.*.products'  => 'nullable|array',
            ]);

            $masterlist = Masterlist::first();

            if ($masterlist) {
                $masterlist->categories = $validated['categories'];
                $masterlist->updatedAt  = now();
                $masterlist->save();
            } else {
                $masterlist = Masterlist::create([
                    'categories' => $validated['categories'],
                    'updatedAt'  => now(),
                ]);
            }

            return $this->successResponse('Masterlist saved successfully.', [
                'categories' => $masterlist->categories,
            ]);
        } catch (\Illuminate\Validation\ValidationException $e) {
            return $this->validationErrorResponse($e);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'An unexpected error occurred while saving masterlist.');
        }
    }
}
