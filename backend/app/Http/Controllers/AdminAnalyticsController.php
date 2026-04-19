<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;

/**
 * Placeholder analytics endpoints until a unified reporting pipeline exists.
 */
class AdminAnalyticsController extends Controller
{
    public function dashboardStats(Request $request)
    {
        // TODO: aggregate KPIs from orders, sales, and inventory collections
        return response()->json([
            'data'    => [],
            'message' => 'Not implemented',
        ], 200);
    }

    public function reportsSales(Request $request)
    {
        // TODO: dedicated sales report aggregation
        return response()->json([
            'data'    => [],
            'message' => 'Not implemented',
        ], 200);
    }

    public function reportsInventory(Request $request)
    {
        // TODO: dedicated inventory report aggregation
        return response()->json([
            'data'    => [],
            'message' => 'Not implemented',
        ], 200);
    }
}
