<?php

namespace App\Http\Controllers;

use App\Models\ActivityLog;
use App\Models\Order;
use App\Models\Review;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

class ReviewController extends Controller
{
    private function getAuthUser(Request $request): ?User
    {
        return $request->user();
    }

    private function serializeReview(Review $review): array
    {
        $raw = $review->getAttributes();
        return [
            'id'           => isset($raw['_id']) ? (string) $raw['_id'] : '',
            '_id'          => isset($raw['_id']) ? (string) $raw['_id'] : '',
            'userId'       => (string) ($raw['userId'] ?? ''),
            'orderId'      => (string) ($raw['orderId'] ?? ''),
            'productIds'   => isset($raw['productIds']) ? array_map('strval', (array) $raw['productIds']) : [],
            // Which single product this review is about; null on older order-level reviews.
            'productId'    => isset($raw['productId']) ? (string) $raw['productId'] : null,
            'rating'       => (int) ($raw['rating'] ?? 0),
            'comment'      => (string) ($raw['comment'] ?? ''),
            'customerName' => (string) ($raw['customerName'] ?? ''),
            'is_visible'   => (bool) ($raw['is_visible'] ?? true),
            'created_at'   => isset($raw['created_at']) ? (string) $raw['created_at'] : null,
        ];
    }

    // ─── Customer: GET /api/orders/my/{orderId}/review ────────────────────────

    public function myOrderReview(Request $request, $orderId)
    {
        try {
            $user = $this->getAuthUser($request);
            if (!$user) return $this->unauthorizedResponse();

            $order = Order::where('_id', $orderId)->where('userId', (string) $user->_id)->first();
            if (!$order) return $this->notFoundResponse('Order');

            // Every review on this order, because an order can now hold one per product. The page
            // needs the whole set to know which items are done and which are still waiting.
            $reviews = Review::where('orderId', $orderId)->get();
            if ($reviews->isEmpty()) {
                return response()->json(['success' => true, 'data' => null, 'reviews' => []], 200);
            }

            return response()->json([
                'success' => true,
                // `data` stays the first one so anything still expecting a single object works.
                'data'    => $this->serializeReview($reviews->first()),
                'reviews' => $reviews->map(fn ($r) => $this->serializeReview($r))->values(),
            ], 200);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e);
        }
    }

    // ─── Customer: POST /api/orders/my/{orderId}/review ───────────────────────

    public function store(Request $request, $orderId)
    {
        try {
            $user = $this->getAuthUser($request);
            if (!$user) return $this->unauthorizedResponse();

            $order = Order::where('_id', $orderId)->where('userId', (string) $user->_id)->first();
            if (!$order) return $this->notFoundResponse('Order');

            if (strtolower($order->orderStatus) !== 'delivered') {
                return $this->errorResponse('You can only review delivered orders.', 422);
            }

            $validated = $request->validate([
                'rating'    => 'required|integer|min:1|max:5',
                'comment'   => 'required|string|min:5|max:2000',
                // Which product this is about. One review used to cover the whole order and was
                // attached to EVERY product in it, so a bad totebag dragged down the mug's rating and
                // the product page showed a score that was partly about something else entirely.
                'productId' => 'nullable|string|max:64',
            ]);

            $orderProductIds = collect($order->items ?? [])
                ->pluck('productId')->filter()->unique()->values()->toArray();

            $productId = $validated['productId'] ?? null;
            if ($productId !== null && !in_array($productId, $orderProductIds, true)) {
                return $this->errorResponse('That product is not part of this order.', 422);
            }

            // One review per product per order. Older order-level reviews carry no productId, so they
            // still block a second order-level review and are left exactly as they are.
            $existing = Review::where('orderId', $orderId)
                ->where('productId', $productId)
                ->first();
            if ($existing) {
                return $this->errorResponse('You have already reviewed this item.', 422);
            }

            // Kept for anything still reading the old shape; a per-product review names one product.
            $productIds = $productId !== null ? [$productId] : $orderProductIds;

            $comment = htmlspecialchars(strip_tags(trim($validated['comment'])), ENT_QUOTES, 'UTF-8');

            $review = Review::create([
                'userId'       => (string) $user->_id,
                'orderId'      => $orderId,
                'productId'    => $productId,
                'productIds'   => $productIds,
                'rating'       => (int) $validated['rating'],
                'comment'      => $comment,
                'customerName' => trim(($user->firstName ?? '') . ' ' . ($user->lastName ?? '')) ?: ($user->name ?? 'Customer'),
                'is_visible'   => true,
            ]);

            ActivityLog::create([
                'performedBy'      => (string) $user->_id,
                'performedByEmail' => $user->email ?? '',
                'action'           => 'review_submitted',
                'entityType'       => 'review',
                'entityId'         => (string) $review->_id,
                'description'      => "Customer submitted a review for order #{$orderId}",
                'metadata'         => ['orderId' => $orderId, 'rating' => $review->rating],
                'createdAt'        => now(),
            ]);

            return $this->successResponse('Review submitted successfully.', $this->serializeReview($review), 201);
        } catch (ValidationException $e) {
            return $this->validationErrorResponse($e);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e);
        }
    }

    // ─── Public: GET /api/storefront/reviews ─────────────────────────────────

    public function storefrontReviews(Request $request)
    {
        try {
            $limit = min((int) ($request->query('limit', 10)), 50);

            $reviews = Review::where('is_visible', true)
                ->orderBy('created_at', 'desc')
                ->take($limit)
                ->get()
                ->map(function ($r) {
                    $raw = $r->getAttributes();
                    $createdAt = null;
                    if (isset($raw['created_at'])) {
                        try {
                            $createdAt = \Carbon\Carbon::parse($raw['created_at'])->toISOString();
                        } catch (\Exception $e) {
                            $createdAt = null;
                        }
                    }
                    return [
                        'rating'       => (int) ($raw['rating'] ?? 0),
                        'comment'      => (string) ($raw['comment'] ?? ''),
                        'customerName' => (string) ($raw['customerName'] ?? ''),
                        'created_at'   => $createdAt,
                    ];
                })
                ->values()
                ->all();

            $avgRating = Review::where('is_visible', true)->avg('rating');
            $total     = Review::where('is_visible', true)->count();

            return $this->successResponse('Reviews fetched', [
                'reviews'   => $reviews,
                'avgRating' => $avgRating ? round((float) $avgRating, 1) : null,
                'total'     => $total,
            ]);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e);
        }
    }

    // ─── Public: GET /api/storefront/stats ────────────────────────────────────
    // Real landing-page stats (replaces hardcoded numbers).
    public function storefrontStats(Request $request)
    {
        try {
            $orders    = Order::count();
            $customers = Order::pluck('userId')->filter()->unique()->count();
            $avgRating = Review::where('is_visible', true)->avg('rating');
            $reviews   = Review::where('is_visible', true)->count();

            return $this->successResponse('Stats fetched', [
                'orders'       => (int) $orders,
                'customers'    => (int) $customers,
                'avgRating'    => $avgRating ? round((float) $avgRating, 1) : null,
                'reviewsCount' => (int) $reviews,
            ]);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e);
        }
    }

    // ─── Public: GET /api/products/{productId}/reviews ────────────────────────

    public function productReviews(Request $request, $productId)
    {
        try {
            $perPage = min((int) ($request->query('per_page', 10)), 50);
            $page    = max((int) ($request->query('page', 1)), 1);

            $query = Review::where('productIds', $productId)->where('is_visible', true);

            $total   = $query->count();
            $reviews = $query->orderBy('created_at', 'desc')
                ->skip(($page - 1) * $perPage)
                ->take($perPage)
                ->get()
                ->map(function ($r) {
                    $raw = $r->getAttributes();
                    $createdAt = null;
                    if (isset($raw['created_at'])) {
                        try { $createdAt = \Carbon\Carbon::parse($raw['created_at'])->toISOString(); } catch (\Exception $e) {}
                    }
                    return [
                        'rating'       => (int) ($raw['rating'] ?? 0),
                        'comment'      => (string) ($raw['comment'] ?? ''),
                        'customerName' => (string) ($raw['customerName'] ?? ''),
                        'created_at'   => $createdAt,
                    ];
                })
                ->values()
                ->all();

            $avgRating = Review::where('productIds', $productId)
                ->where('is_visible', true)
                ->avg('rating');

            return $this->successResponse('Reviews fetched', [
                'reviews'    => $reviews,
                'avgRating'  => $avgRating ? round((float) $avgRating, 1) : null,
                'total'      => $total,
                'page'       => $page,
                'perPage'    => $perPage,
                'totalPages' => $perPage > 0 ? (int) ceil($total / $perPage) : 1,
            ]);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e);
        }
    }

    // ─── Admin: GET /api/admin/reviews ────────────────────────────────────────

    public function adminIndex(Request $request)
    {
        try {
            if (!$this->isAdmin($request)) return $this->unauthorizedResponse();

            $perPage   = min((int) ($request->query('per_page', 20)), 100);
            $page      = max((int) ($request->query('page', 1)), 1);
            $rating    = $request->query('rating');
            $visible   = $request->query('visible');

            $query = Review::query();

            if ($rating !== null && in_array((int) $rating, [1, 2, 3, 4, 5])) {
                $query->where('rating', (int) $rating);
            }
            if ($visible !== null) {
                $query->where('is_visible', filter_var($visible, FILTER_VALIDATE_BOOLEAN));
            }

            $total   = $query->count();
            $reviews = (clone $query)->orderBy('created_at', 'desc')
                ->skip(($page - 1) * $perPage)
                ->take($perPage)
                ->get()
                ->map(fn($r) => $this->serializeReview($r))
                ->values()
                ->all();

            // Name the product each review is about. The per-product split was made precisely so a
            // bad totebag would stop dragging down the mug's rating - but the admin screen was still
            // handed a bare productId, so the one person who has to judge whether a review is fair
            // could not tell WHICH product it was judging. Resolved in ONE query over the page's
            // ids rather than a lookup per row.
            $ids = collect($reviews)->pluck('productId')->filter()->unique()->values()->all();
            if ($ids) {
                $names = \App\Models\Product::whereIn('_id', $ids)->get()
                    ->mapWithKeys(fn($p) => [(string) $p->_id => (string) ($p->name ?? '')]);
                $reviews = array_map(function ($r) use ($names) {
                    $r['productName'] = $r['productId'] ? ($names[$r['productId']] ?? null) : null;
                    return $r;
                }, $reviews);
            }

            $allReviews = Review::query();
            $totalAll     = $allReviews->count();
            $totalVisible = Review::where('is_visible', true)->count();
            $totalHidden  = Review::where('is_visible', false)->count();
            $avgRating    = Review::avg('rating');

            return $this->successResponse('Reviews fetched', [
                'reviews'      => $reviews,
                'total'        => $total,
                'page'         => $page,
                'perPage'      => $perPage,
                'totalPages'   => $perPage > 0 ? (int) ceil($total / $perPage) : 1,
                'stats' => [
                    'total'     => $totalAll,
                    'visible'   => $totalVisible,
                    'hidden'    => $totalHidden,
                    'avgRating' => $avgRating ? round((float) $avgRating, 1) : null,
                ],
            ]);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e);
        }
    }

    // ─── Admin: PATCH /api/admin/reviews/{id}/visibility ─────────────────────

    public function toggleVisibility(Request $request, $id)
    {
        try {
            if (!$this->isAdmin($request)) return $this->unauthorizedResponse();

            $review = Review::find($id);
            if (!$review) return $this->notFoundResponse('Review');

            $review->is_visible = !$review->is_visible;
            $review->save();

            return $this->successResponse(
                $review->is_visible ? 'Review is now visible.' : 'Review is now hidden.',
                ['id' => $id, 'is_visible' => $review->is_visible]
            );
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e);
        }
    }

    // ─── Admin: DELETE /api/admin/reviews/{id} ────────────────────────────────

    public function destroy(Request $request, $id)
    {
        try {
            if (!$this->isAdmin($request)) return $this->unauthorizedResponse();

            $review = Review::find($id);
            if (!$review) return $this->notFoundResponse('Review');

            $review->delete();

            return $this->successResponse('Review deleted.');
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e);
        }
    }
}
