<?php

namespace App\Http\Controllers;

use App\Models\OrderRequest;
use App\Models\PersonalAccessToken;
use Illuminate\Http\Request;

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
}
