<?php

namespace App\Http\Controllers;

use App\Models\Collection;
use App\Models\Product;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

class CollectionController extends Controller
{
    // ─── Helpers ─────────────────────────────────────────────────────────────────

    private function makeSlug(string $title, ?string $excludeId = null): string
    {
        $slug = strtolower(trim(preg_replace('/[^A-Za-z0-9]+/', '-', $title), '-'));
        $base = $slug ?: 'collection';
        $i    = 1;
        $candidate = $base;
        while (true) {
            $q = Collection::where('slug', $candidate);
            if ($excludeId) $q->where('_id', '!=', $excludeId);
            if (!$q->exists()) break;
            $candidate = "$base-$i";
            $i++;
        }
        return $candidate;
    }

    private function resolveProductIds(Collection $col): array
    {
        return array_map('strval', $col->productIds ?? []);
    }

    private function serialize(Collection $col, bool $withCount = false): array
    {
        $raw = $col->getAttributes();
        $cid = isset($raw['id']) ? (string) $raw['id'] : (isset($raw['_id']) ? (string) $raw['_id'] : '');
        $out = [
            'id'                     => $cid,
            '_id'                    => $cid,
            'title'                  => (string) ($raw['title'] ?? ''),
            'slug'                   => (string) ($raw['slug'] ?? ''),
            'description'            => (string) ($raw['description'] ?? ''),
            'image'                  => $raw['image'] ?? null,
            'type'                   => 'manual',
            'productIds'             => isset($raw['productIds']) ? array_map('strval', (array) $raw['productIds']) : [],
            'isPublished'            => (bool) ($raw['isPublished'] ?? false),
            'sortOrder'              => (int) ($raw['sortOrder'] ?? 0),
            'landing_order'          => isset($raw['landing_order']) ? (int) $raw['landing_order'] : null,
            'landing_image_position' => $raw['landing_image_position'] ?? null,
            'created_at'             => $raw['created_at'] ?? null,
            'updated_at'             => $raw['updated_at'] ?? null,
        ];
        if ($withCount) {
            $out['productCount'] = count($this->resolveProductIds($col));
        }
        return $out;
    }

    // ─── Admin: GET /api/admin/collections ───────────────────────────────────────

    public function adminIndex(Request $request)
    {
        try {
            if (!$this->hasPermission($request, 'products')) return $this->unauthorizedResponse();

            $cols = Collection::orderBy('sortOrder', 'asc')
                ->orderBy('created_at', 'desc')
                ->get()
                ->map(fn($c) => $this->serialize($c, true))
                ->values()
                ->all();

            return $this->successResponse('Collections fetched.', $cols);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e);
        }
    }

    // ─── Admin: POST /api/admin/collections ──────────────────────────────────────

    public function store(Request $request)
    {
        try {
            if (!$this->hasPermission($request, 'products')) return $this->unauthorizedResponse();

            $validated = $request->validate([
                'title'                  => 'required|string|max:255',
                'description'            => 'nullable|string|max:5000',
                'image'                  => 'nullable|string',
                'productIds'             => 'nullable|array',
                'isPublished'            => 'nullable|boolean',
                'sortOrder'              => 'nullable|integer',
                'landing_order'          => 'nullable|integer|min:1',
                'landing_image_position' => 'nullable|string|max:40',
            ]);

            $slug = $this->makeSlug($validated['title']);

            $col = Collection::create([
                'title'                  => trim($validated['title']),
                'slug'                   => $slug,
                'description'            => $validated['description'] ?? '',
                'image'                  => $validated['image'] ?? null,
                'type'                   => 'manual',
                'productIds'             => $validated['productIds'] ?? [],
                'isPublished'            => $validated['isPublished'] ?? false,
                'sortOrder'              => $validated['sortOrder'] ?? 0,
                'landing_order'          => $validated['landing_order'] ?? null,
                'landing_image_position' => $validated['landing_image_position'] ?? null,
            ]);

            return $this->successResponse('Collection created.', $this->serialize($col, true), 201);
        } catch (ValidationException $e) {
            return $this->validationErrorResponse($e);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e);
        }
    }

    // ─── Admin: PUT /api/admin/collections/{id} ───────────────────────────────────

    public function update(Request $request, $id)
    {
        try {
            if (!$this->hasPermission($request, 'products')) return $this->unauthorizedResponse();

            $col = Collection::find($id);
            if (!$col) return $this->notFoundResponse('Collection');

            $validated = $request->validate([
                'title'                  => 'sometimes|string|max:255',
                'description'            => 'nullable|string|max:5000',
                'image'                  => 'nullable|string',
                'productIds'             => 'nullable|array',
                'isPublished'            => 'nullable|boolean',
                'sortOrder'              => 'nullable|integer',
                'landing_order'          => 'nullable|integer|min:1',
                'landing_image_position' => 'nullable|string|max:40',
            ]);

            if (isset($validated['title'])) {
                $col->title = trim($validated['title']);
                $col->slug  = $this->makeSlug($validated['title'], $id);
            }
            if (array_key_exists('description', $validated))            $col->description            = $validated['description'] ?? '';
            if (array_key_exists('image', $validated))                  $col->image                  = $validated['image'];
            if (array_key_exists('productIds', $validated))             $col->productIds             = $validated['productIds'] ?? [];
            if (isset($validated['isPublished']))                        $col->isPublished            = $validated['isPublished'];
            if (isset($validated['sortOrder']))                          $col->sortOrder              = $validated['sortOrder'];
            if (array_key_exists('landing_order', $validated))          $col->landing_order          = $validated['landing_order'];
            if (array_key_exists('landing_image_position', $validated)) $col->landing_image_position = $validated['landing_image_position'];

            $col->save();

            return $this->successResponse('Collection updated.', $this->serialize($col, true));
        } catch (ValidationException $e) {
            return $this->validationErrorResponse($e);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e);
        }
    }

    // ─── Admin: DELETE /api/admin/collections/{id} ────────────────────────────────

    public function destroy(Request $request, $id)
    {
        try {
            if (!$this->hasPermission($request, 'products')) return $this->unauthorizedResponse();

            $col = Collection::find($id);
            if (!$col) return $this->notFoundResponse('Collection');

            $col->delete();
            return $this->successResponse('Collection deleted.');
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e);
        }
    }

    // ─── Admin: PATCH /api/admin/collections/{id}/toggle-publish ─────────────────

    public function togglePublish(Request $request, $id)
    {
        try {
            if (!$this->hasPermission($request, 'products')) return $this->unauthorizedResponse();

            $col = Collection::find($id);
            if (!$col) return $this->notFoundResponse('Collection');

            $col->isPublished = !$col->isPublished;
            $col->save();

            return $this->successResponse(
                $col->isPublished ? 'Collection published.' : 'Collection unpublished.',
                ['id' => $id, 'isPublished' => $col->isPublished]
            );
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e);
        }
    }

    // ─── Admin: GET /api/admin/collections/{id}/products ─────────────────────────

    public function adminProducts(Request $request, $id)
    {
        try {
            if (!$this->hasPermission($request, 'products')) return $this->unauthorizedResponse();

            $col = Collection::find($id);
            if (!$col) return $this->notFoundResponse('Collection');

            $productIds = $this->resolveProductIds($col);

            $products = empty($productIds)
                ? []
                : Product::whereIn('_id', $productIds)
                    ->where('isActive', true)
                    ->get()
                    ->map(fn($p) => [
                        'id'        => (string) $p->_id,
                        '_id'       => (string) $p->_id,
                        'name'      => $p->name,
                        'category'  => $p->category,
                        'thumbnail' => $p->thumbnail,
                        'price'     => $p->price ?? $p->flatPrice,
                        'isPublished' => (bool) $p->isPublished,
                    ])
                    ->values()
                    ->all();

            return $this->successResponse('Products fetched.', [
                'products' => $products,
                'total'    => count($products),
            ]);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e);
        }
    }

    // ─── Storefront: GET /api/storefront/collections ──────────────────────────────

    public function storefrontIndex()
    {
        try {
            $cols = Collection::where('isPublished', true)
                ->orderBy('sortOrder', 'asc')
                ->get()
                ->map(function ($c) {
                    $raw        = $c->getAttributes();
                    $productIds = $this->resolveProductIds($c);
                    $count = empty($productIds) ? 0
                        : Product::whereIn('_id', $productIds)
                            ->where('isActive', true)
                            ->where('isPublished', true)
                            ->count();
                    return [
                        'id'                     => isset($raw['id']) ? (string) $raw['id'] : (isset($raw['_id']) ? (string) $raw['_id'] : ''),
                        'title'                  => (string) ($raw['title'] ?? ''),
                        'slug'                   => (string) ($raw['slug'] ?? ''),
                        'description'            => (string) ($raw['description'] ?? ''),
                        'image'                  => $raw['image'] ?? null,
                        'productCount'           => $count,
                        'landing_order'          => isset($raw['landing_order']) ? (int) $raw['landing_order'] : null,
                        'landing_image_position' => $raw['landing_image_position'] ?? null,
                    ];
                })
                // A collection with nothing published in it is a door onto an empty room: it shows up
                // in the shop filters and the landing carousel, invites a click, and lands the shopper
                // on a page with no products. Dropped here rather than in each storefront surface, so
                // the two consumers cannot drift apart on what counts as browsable.
                ->filter(fn ($c) => ($c['productCount'] ?? 0) > 0)
                ->values()
                ->all();

            return $this->successResponse('Collections fetched.', $cols);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e);
        }
    }

    // ─── Storefront: GET /api/storefront/collections/{slug} ──────────────────────

    public function storefrontShow(Request $request, $slug)
    {
        try {
            $col = Collection::where('slug', $slug)->where('isPublished', true)->first();
            if (!$col) return $this->notFoundResponse('Collection');

            $page    = max((int) $request->query('page', 1), 1);
            $perPage = min((int) $request->query('per_page', 20), 60);

            $productIds = $this->resolveProductIds($col);
            $total      = count($productIds);
            $sliced     = array_slice($productIds, ($page - 1) * $perPage, $perPage);

            $products = empty($sliced)
                ? []
                : Product::whereIn('_id', $sliced)
                    ->where('isActive', true)
                    ->where('isPublished', true)
                    ->get()
                    ->map(fn($p) => [
                        'id'          => (string) $p->_id,
                        'name'        => $p->name,
                        'category'    => $p->category,
                        'thumbnail'   => $p->thumbnail,
                        'price'       => $p->price ?? $p->flatPrice,
                        'priceType'   => $p->priceType,
                        'stockStatus' => $p->stockStatus,
                    ])
                    ->values()
                    ->all();

            $raw = $col->getAttributes();
            return $this->successResponse('Collection fetched.', [
                'id'          => isset($raw['id']) ? (string) $raw['id'] : (isset($raw['_id']) ? (string) $raw['_id'] : ''),
                'title'       => (string) ($raw['title'] ?? ''),
                'slug'        => (string) ($raw['slug'] ?? ''),
                'description' => (string) ($raw['description'] ?? ''),
                'image'       => $raw['image'] ?? null,
                'products'    => $products,
                'total'       => $total,
                'page'        => $page,
                'perPage'     => $perPage,
                'totalPages'  => $perPage > 0 ? (int) ceil($total / $perPage) : 1,
            ]);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e);
        }
    }
}
