<?php

namespace App\Http\Controllers;

use App\Models\OrderRequest;
use App\Models\PersonalAccessToken;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use App\Models\Notification;
use App\Models\ActivityLog;

class ShopOrderRequestController extends Controller
{
    /**
     * GET /shop/order-requests
     * List all order requests for the authenticated customer.
     */
    public function index(Request $request)
    {
        $bearerToken = $request->bearerToken();
        $user = PersonalAccessToken::findToken($bearerToken)?->tokenable;

        if (!$user) {
            return response()->json(['message' => 'Unauthenticated.'], 401);
        }

        $orders = OrderRequest::where('customerId', (string) $user->id)
            ->orderBy('createdAt', 'desc')
            ->get();

        return response()->json([
            'data'  => $orders,
            'total' => $orders->count(),
        ]);
    }

    /**
     * GET /shop/order-requests/{id}
     * Show a single order request owned by the authenticated customer.
     */
    public function show(Request $request, $id)
    {
        $bearerToken = $request->bearerToken();
        $user = PersonalAccessToken::findToken($bearerToken)?->tokenable;

        if (!$user) {
            return response()->json(['message' => 'Unauthenticated.'], 401);
        }

        $order = OrderRequest::where('_id', $id)
            ->where('customerId', (string) $user->id)
            ->first();

        if (!$order) {
            return response()->json(['message' => 'Order request not found.'], 404);
        }

        return response()->json(['data' => $order]);
    }

    /**
     * POST /order-requests/my/{id}/cancel
     * Customer cancels their own order request — only pending_review allowed.
     */
    public function cancel(Request $request, $id)
    {
        $bearerToken = $request->bearerToken();
        $user = PersonalAccessToken::findToken($bearerToken)?->tokenable;

        if (!$user) {
            return response()->json(['message' => 'Unauthenticated.'], 401);
        }

        $order = OrderRequest::where('_id', $id)
            ->where('customerId', (string) $user->id)
            ->first();

        if (!$order) {
            return response()->json(['message' => 'Order request not found.'], 404);
        }

        if ($order->status !== 'pending_review') {
            return response()->json([
                'message' => 'This order request can no longer be cancelled. Only pending requests can be cancelled.',
            ], 422);
        }

        // Append to statusHistory
        $history   = $order->statusHistory ?? [];
        $history[] = [
            'status'     => 'cancelled',
            'changed_at' => now()->toISOString(),
            'note'       => 'Cancelled by customer.',
            'updatedBy'  => trim(($user->firstName ?? '') . ' ' . ($user->lastName ?? '')),
        ];

        $order->status        = 'cancelled';
        $order->statusHistory = $history;
        $order->updatedAt     = now();
        $order->save();

        // In-app notification
        try {
            Notification::create([
                'user_id'    => (string) $user->id,
                'type'       => 'order_request_cancelled',
                'title'      => 'Order Request Cancelled',
                'message'    => 'Your order request #' .
                    strtoupper(substr((string) $order->_id, -8)) .
                    ' has been cancelled.',
                'is_read'    => false,
                'data'       => ['orderId' => (string) $order->_id],
                'created_at' => now(),
            ]);
        } catch (\Exception $e) {
            Log::warning('cancel order request: notification failed', [
                'error' => $e->getMessage(),
            ]);
        }

        // Activity log
        try {
            ActivityLog::create([
                'action'           => 'order_request_cancelled_by_customer',
                'entityType'       => 'order_request',
                'entityId'         => (string) $order->_id,
                'description'      => 'Order request cancelled by customer.',
                'performedBy'      => trim(($user->firstName ?? '') . ' ' . ($user->lastName ?? '')),
                'performedByEmail' => $user->email ?? null,
                'metadata'         => ['orderId' => (string) $order->_id],
                'createdAt'        => now(),
            ]);
        } catch (\Exception $logErr) {
            Log::warning('ActivityLog write failed (cancel order request)', [
                'error' => $logErr->getMessage(),
            ]);
        }

        return response()->json([
            'message' => 'Order request cancelled successfully.',
            'data'    => $order,
        ]);
    }
}
