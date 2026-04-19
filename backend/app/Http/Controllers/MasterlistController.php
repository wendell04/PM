<?php

namespace App\Http\Controllers;

use App\Models\Masterlist;
use App\Models\UnitOfMeasurement;
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

    /**
     * GET /api/admin/units
     */
    public function units(Request $request)
    {
        try {
            if (!$this->isAdmin($request)) {
                return $this->unauthorizedResponse();
            }

            $this->seedDefaultUnitsIfEmpty();

            $list = UnitOfMeasurement::where('isActive', true)
                ->orderBy('name')
                ->get();

            $data = $list->map(function ($u) {
                return [
                    '_id'           => (string) $u->_id,
                    'name'          => $u->name,
                    'abbreviation'  => $u->abbreviation ?? '',
                    'isActive'      => (bool) ($u->isActive ?? true),
                ];
            })->values()->all();

            return $this->successResponse('Units fetched successfully.', $data);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'Failed to fetch units.');
        }
    }

    /**
     * POST /api/admin/units — create or update unit of measure
     */
    public function saveUnit(Request $request)
    {
        try {
            if (!$this->isAdmin($request)) {
                return $this->unauthorizedResponse();
            }

            $validated = $request->validate([
                'name'           => 'required|string|max:120',
                'abbreviation'   => 'nullable|string|max:32',
                'id'             => 'nullable|string',
                'isActive'       => 'sometimes|boolean',
            ]);

            $now = now();

            if (!empty($validated['id'])) {
                $unit = UnitOfMeasurement::find($validated['id']);
                if (!$unit) {
                    return $this->notFoundResponse('Unit');
                }
                $unit->name         = $validated['name'];
                $unit->abbreviation = $validated['abbreviation'] ?? $unit->abbreviation ?? '';
                if (array_key_exists('isActive', $validated)) {
                    $unit->isActive = (bool) $validated['isActive'];
                }
                $unit->updatedAt = $now;
                $unit->save();
            } else {
                $unit = UnitOfMeasurement::updateOrCreate(
                    ['name' => $validated['name']],
                    [
                        'abbreviation' => $validated['abbreviation'] ?? '',
                        'isActive'     => $validated['isActive'] ?? true,
                        'updatedAt'    => $now,
                    ]
                );
                if (!$unit->createdAt) {
                    $unit->createdAt = $now;
                    $unit->save();
                }
            }

            return $this->successResponse('Unit saved successfully.', [
                '_id'          => (string) $unit->_id,
                'name'         => $unit->name,
                'abbreviation' => $unit->abbreviation ?? '',
                'isActive'     => (bool) ($unit->isActive ?? true),
            ]);
        } catch (\Illuminate\Validation\ValidationException $e) {
            return $this->validationErrorResponse($e);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'Failed to save unit.');
        }
    }

    private function seedDefaultUnitsIfEmpty(): void
    {
        if (UnitOfMeasurement::count() > 0) {
            return;
        }

        $defaults = [
            ['name' => 'Pieces', 'abbreviation' => 'pcs'],
            ['name' => 'Bottle', 'abbreviation' => 'bottle'],
            ['name' => 'Liter', 'abbreviation' => 'liter'],
            ['name' => 'Kilogram', 'abbreviation' => 'kg'],
            ['name' => 'Gram', 'abbreviation' => 'gram'],
            ['name' => 'Meter', 'abbreviation' => 'meter'],
            ['name' => 'Roll', 'abbreviation' => 'roll'],
            ['name' => 'Box', 'abbreviation' => 'box'],
            ['name' => 'Pack', 'abbreviation' => 'pack'],
            ['name' => 'Set', 'abbreviation' => 'set'],
            ['name' => 'Sheet', 'abbreviation' => 'sheet'],
        ];

        $now = now();
        foreach ($defaults as $row) {
            UnitOfMeasurement::firstOrCreate(
                ['name' => $row['name']],
                [
                    'abbreviation' => $row['abbreviation'],
                    'isActive'     => true,
                    'createdAt'    => $now,
                    'updatedAt'    => $now,
                ]
            );
        }
    }
}
