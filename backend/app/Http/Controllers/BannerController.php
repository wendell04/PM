<?php

namespace App\Http\Controllers;

use App\Models\Banner;
use Illuminate\Http\Request;

class BannerController extends Controller
{
    /**
     * GET /api/admin/banners
     * Returns all banners ordered by 'order' ASC
     */
    public function index()
    {
        try {
            $banners = Banner::orderBy('order', 'asc')->get();
            return $this->successResponse('Banners retrieved.', $banners);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'An unexpected error occurred while fetching banners.');
        }
    }

    /**
     * POST /api/admin/banners
     * Creates a new banner
     */
    public function store(Request $request)
    {
        try {
            $validated = $request->validate([
                'headline' => 'required|string|max:255',
                'subtext' => 'nullable|string',
                'ctaLabel' => 'nullable|string',
                'ctaLink' => 'nullable|string',
                'image' => 'nullable|string',
                'isVisible' => 'nullable|boolean',
                'status' => 'nullable|in:draft,live,scheduled',
                'order' => 'nullable|integer',
                'scheduleStart' => 'nullable|date',
                'scheduleEnd' => 'nullable|date',
            ]);

            $banner = Banner::create([
                'headline' => $validated['headline'] ?? '',
                'subtext' => $validated['subtext'] ?? '',
                'ctaLabel' => $validated['ctaLabel'] ?? '',
                'ctaLink' => $validated['ctaLink'] ?? '',
                'image' => $validated['image'] ?? null,
                'isVisible' => $validated['isVisible'] ?? false,
                'status' => $validated['status'] ?? 'draft',
                'order' => $validated['order'] ?? 0,
                'scheduleStart' => $validated['scheduleStart'] ?? null,
                'scheduleEnd' => $validated['scheduleEnd'] ?? null,
            ]);

            return $this->successResponse('Banner created.', $banner, 201);
        } catch (\Illuminate\Validation\ValidationException $e) {
            return $this->validationErrorResponse($e);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'An unexpected error occurred while creating banner.');
        }
    }

    /**
     * PUT /api/admin/banners/{id}
     * Updates an existing banner
     */
    public function update(Request $request, $id)
    {
        try {
            $banner = Banner::find($id);

            if (!$banner) {
                return $this->errorResponse('Banner not found.', 404);
            }

            $validated = $request->validate([
                'headline' => 'nullable|string|max:255',
                'subtext' => 'nullable|string',
                'ctaLabel' => 'nullable|string',
                'ctaLink' => 'nullable|string',
                'image' => 'nullable|string',
                'isVisible' => 'nullable|boolean',
                'status' => 'nullable|in:draft,live,scheduled',
                'order' => 'nullable|integer',
                'scheduleStart' => 'nullable|date',
                'scheduleEnd' => 'nullable|date',
            ]);

            $banner->update($validated);

            return $this->successResponse('Banner updated.', $banner);
        } catch (\Illuminate\Validation\ValidationException $e) {
            return $this->validationErrorResponse($e);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'An unexpected error occurred while updating banner.');
        }
    }

    /**
     * DELETE /api/admin/banners/{id}
     * Deletes a banner
     */
    public function destroy($id)
    {
        try {
            $banner = Banner::find($id);

            if (!$banner) {
                return $this->errorResponse('Banner not found.', 404);
            }

            $banner->delete();

            return $this->successResponse('Banner deleted.');
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'An unexpected error occurred while deleting banner.');
        }
    }

    /**
     * PUT /api/admin/banners/{id}/publish
     * Publishes a banner (status=live, isVisible=true)
     */
    public function publish($id)
    {
        try {
            $banner = Banner::find($id);

            if (!$banner) {
                return $this->errorResponse('Banner not found.', 404);
            }

            $banner->update([
                'status' => 'live',
                'isVisible' => true,
            ]);

            return $this->successResponse('Banner published.', $banner);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'An unexpected error occurred while publishing banner.');
        }
    }

    /**
     * PUT /api/admin/banners/{id}/unpublish
     * Unpublishes a banner (status=draft, isVisible=false)
     */
    public function unpublish($id)
    {
        try {
            $banner = Banner::find($id);

            if (!$banner) {
                return $this->errorResponse('Banner not found.', 404);
            }

            $banner->update([
                'status' => 'draft',
                'isVisible' => false,
            ]);

            return $this->successResponse('Banner unpublished.', $banner);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'An unexpected error occurred while unpublishing banner.');
        }
    }

    /**
     * GET /api/storefront/banners
     * Public endpoint - returns only live and visible banners
     */
    public function storefront()
    {
        try {
            $banners = Banner::where('status', 'live')
                ->where('isVisible', true)
                ->orderBy('order', 'asc')
                ->get();

            return $this->successResponse('Banners retrieved.', $banners);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'An unexpected error occurred while fetching banners.');
        }
    }
}
