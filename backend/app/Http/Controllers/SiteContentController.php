<?php

namespace App\Http\Controllers;

use App\Models\SiteContent;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;

class SiteContentController extends Controller
{
    /**
     * GET /api/storefront/content/{key}
     * Public — returns the section's data, or null if not set (frontend falls
     * back to its hardcoded default).
     */
    public function show($key)
    {
        try {
            $row = SiteContent::where('key', $key)->first();
            return $this->successResponse('Content fetched.', $row ? $row->data : null);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'An unexpected error occurred while fetching content.');
        }
    }

    /**
     * PUT /api/admin/content/{key}
     * Admin — upserts the section's data (an arbitrary JSON object/array).
     */
    public function update(Request $request, $key)
    {
        try {
            $validated = $request->validate([
                'data' => 'required|array',
            ]);

            $row = SiteContent::where('key', $key)->first();
            if ($row) {
                $row->data = $validated['data'];
                $row->save();
            } else {
                $row = SiteContent::create(['key' => $key, 'data' => $validated['data']]);
            }

            return $this->successResponse('Content saved.', $row->data);
        } catch (\Illuminate\Validation\ValidationException $e) {
            return $this->validationErrorResponse($e);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'An unexpected error occurred while saving content.');
        }
    }
}
