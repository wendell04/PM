<?php

namespace App\Http\Controllers;

use App\Models\Banner;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;

class BannerController extends Controller
{
    /**
     * GET /api/admin/banners
     * Returns all banners ordered by 'order' ASC
     */
    public function index()
    {
        try {
            $banners = Cache::remember('admin_banners', 120, function () {
                return Banner::orderBy('order', 'asc')->get();
            });
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
                'name'                => 'nullable|string|max:100',
                'headline'            => 'nullable|string|max:255',
                'headlineAccent'      => 'nullable|string|max:255',
                'headlineAccentColor' => 'nullable|string|max:40',
                'headlineAccent2'     => 'nullable|string|max:255',
                'headlineAccent2Color'=> 'nullable|string|max:40',
                'headlineBreak1'      => 'nullable|boolean',
                'headlineBreak2'      => 'nullable|boolean',
                'titleParts'          => 'nullable|array',
                'tag'                 => 'nullable|string|max:80',
                'subtext'             => 'nullable|string',
                'ctaLabel'            => 'nullable|string',
                'ctaLink'             => 'nullable|string',
                'cta2Label'           => 'nullable|string',
                'cta2Link'            => 'nullable|string',
                'imagePosition'       => 'nullable|string|max:40',
                'imageScale'          => 'nullable|numeric|min:1|max:3',
                'imagePositionMobile' => 'nullable|string|max:40',
                'imageScaleMobile'    => 'nullable|numeric|min:1|max:3',
                'imageFit'            => 'nullable|in:contain,cover',
                'image'               => 'nullable|string',
                'isVisible'           => 'nullable|boolean',
                'status'              => 'nullable|in:draft,live,scheduled',
                'order'               => 'nullable|integer',
                'scheduleStart'       => 'nullable|date',
                'scheduleEnd'         => 'nullable|date',
                'showOn'              => 'nullable|in:both,shop,landing',
                'heroRole'            => 'nullable|in:tagline,image,gallery',
            ]);

            $banner = Banner::create([
                'name'                => $validated['name'] ?? null,
                'headline'            => $validated['headline'] ?? '',
                'headlineAccent'      => $validated['headlineAccent'] ?? null,
                'headlineAccentColor' => $validated['headlineAccentColor'] ?? 'gold',
                'headlineAccent2'     => $validated['headlineAccent2'] ?? null,
                'headlineAccent2Color'=> $validated['headlineAccent2Color'] ?? 'gold',
                'headlineBreak1'      => $validated['headlineBreak1'] ?? false,
                'headlineBreak2'      => $validated['headlineBreak2'] ?? false,
                'titleParts'          => $validated['titleParts'] ?? null,
                'tag'                 => $validated['tag'] ?? null,
                'subtext'             => $validated['subtext'] ?? '',
                'ctaLabel'            => $validated['ctaLabel'] ?? '',
                'ctaLink'             => $validated['ctaLink'] ?? '',
                'cta2Label'           => $validated['cta2Label'] ?? null,
                'cta2Link'            => $validated['cta2Link'] ?? null,
                'imagePosition'       => $validated['imagePosition'] ?? 'center center',
                'imageScale'          => $validated['imageScale'] ?? 1,
                'imagePositionMobile' => $validated['imagePositionMobile'] ?? null,
                'imageScaleMobile'    => $validated['imageScaleMobile'] ?? null,
                'imageFit'            => $validated['imageFit'] ?? 'cover',
                'image'               => $validated['image'] ?? null,
                'isVisible'           => $validated['isVisible'] ?? false,
                'status'              => $validated['status'] ?? 'draft',
                'order'               => $validated['order'] ?? 0,
                'scheduleStart'       => $validated['scheduleStart'] ?? null,
                'scheduleEnd'         => $validated['scheduleEnd'] ?? null,
                'showOn'              => $validated['showOn'] ?? 'both',
                'heroRole'            => $validated['heroRole'] ?? null,
            ]);

            Cache::forget('admin_banners');
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
                'name'                => 'nullable|string|max:100',
                'headline'            => 'nullable|string|max:255',
                'headlineAccent'      => 'nullable|string|max:255',
                'headlineAccentColor' => 'nullable|string|max:40',
                'headlineAccent2'     => 'nullable|string|max:255',
                'headlineAccent2Color'=> 'nullable|string|max:40',
                'headlineBreak1'      => 'nullable|boolean',
                'headlineBreak2'      => 'nullable|boolean',
                'titleParts'          => 'nullable|array',
                'tag'                 => 'nullable|string|max:80',
                'subtext'             => 'nullable|string',
                'ctaLabel'            => 'nullable|string',
                'ctaLink'             => 'nullable|string',
                'cta2Label'           => 'nullable|string',
                'cta2Link'            => 'nullable|string',
                'imagePosition'       => 'nullable|string|max:40',
                'imageScale'          => 'nullable|numeric|min:1|max:3',
                'imagePositionMobile' => 'nullable|string|max:40',
                'imageScaleMobile'    => 'nullable|numeric|min:1|max:3',
                'imageFit'            => 'nullable|in:contain,cover',
                'image'               => 'nullable|string',
                'isVisible'           => 'nullable|boolean',
                'status'              => 'nullable|in:draft,live,scheduled',
                'order'               => 'nullable|integer',
                'scheduleStart'       => 'nullable|date',
                'scheduleEnd'         => 'nullable|date',
                'showOn'              => 'nullable|in:both,shop,landing',
                'heroRole'            => 'nullable|in:tagline,image,gallery',
            ]);

            $banner->update($validated);

            Cache::forget('admin_banners');
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

            Cache::forget('admin_banners');
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

            Cache::forget('admin_banners');
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

            Cache::forget('admin_banners');
            return $this->successResponse('Banner unpublished.', $banner);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'An unexpected error occurred while unpublishing banner.');
        }
    }

    /**
     * GET /api/storefront/banners?context=shop|landing
     * Public endpoint - returns only live and visible banners, filtered by context.
     * context=shop    → showOn is 'both' or 'shop'
     * context=landing → showOn is 'both' or 'landing'
     * no context      → all live banners (backward compat)
     */
    public function storefront(Request $request)
    {
        try {
            $context = $request->query('context');

            $query = Banner::where('status', 'live')
                ->where('isVisible', true);

            if ($context === 'shop') {
                $query->whereIn('showOn', ['both', 'shop', null]);
            } elseif ($context === 'landing') {
                $query->whereIn('showOn', ['both', 'landing', null]);
            }

            $banners = $query->orderBy('order', 'asc')->get();

            return $this->successResponse('Banners retrieved.', $banners);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'An unexpected error occurred while fetching banners.');
        }
    }
}
