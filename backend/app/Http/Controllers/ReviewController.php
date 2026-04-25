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

    // ─── Customer: GET /api/orders/my/{orderId}/review ────────────────────────

    public function myOrderReview(Request $request, $orderId)
    {
        try {
            $user = $this->getAuthUser($request);
            if (!$user) return $this->unauthorizedResponse();

            $order = Order::where('_id', $orderId)->where('userId', (string) $user->_id)->first();
            if (!$order) return $this->notFoundResponse('Order');

            $review = Review::where('orderId', $orderId)->first();
            if (!$review) {
                return response()->json(['success' => true, 'data' => null], 200);
            }

            return $this->successResponse('Review fetched', $review->toArray());
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

            if ($order->orderStatus !== 'Delivered') {
                return $this->errorResponse('You can only review delivered orders.', 422);
            }

            $existing = Review::where('orderId', $orderId)->first();
            if ($existing) {
                return $this->errorResponse('You have already reviewed this order.', 422);
            }

            $validated = $request->validate([
                'rating'  => 'required|integer|min:1|max:5',
                'comment' => 'required|string|min:5|max:2000',
            ]);

            $productIds = collect($order->items ?? [])
                ->pluck('productId')
                ->filter()
                ->unique()
                ->values()
                ->toArray();

            $comment = htmlspecialchars(strip_tags(trim($validated['comment'])), ENT_QUOTES, 'UTF-8');

            $review = Review::create([
                'userId'       => (string) $user->_id,
                'orderId'      => $orderId,
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

            return $this->successResponse('Review submitted successfully.', $review->toArray(), 201);
        } catch (ValidationException $e) {
            return $this->validationErrorResponse($e);
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
                ->get(['rating', 'comment', 'customerName', 'created_at'])
                ->toArray();

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
                ->toArray();

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
