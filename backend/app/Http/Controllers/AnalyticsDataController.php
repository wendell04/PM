<?php

namespace App\Http\Controllers;

use App\Models\Sale;
use App\Models\Order;
use Illuminate\Http\Request;

class AnalyticsDataController extends Controller
{
    // GET /api/admin/analytics/rfm-data
    // Returns sales rows needed for Python RFM segmentation endpoint.
    public function rfmData(Request $request)
    {
        if (!$this->hasPermission($request, 'reports')) return $this->unauthorizedResponse();
        try {
            $query = Sale::where('status', '!=', 'refunded')
                ->whereNotNull('customerEmail')
                ->where('customerEmail', '!=', '');

            if ($request->filled('startDate')) {
                $query->where('saleDate', '>=', $request->startDate);
            }
            if ($request->filled('endDate')) {
                $query->where('saleDate', '<=', $request->endDate);
            }

            $sales = $query->get(['customerEmail', 'totalPrice', 'saleDate']);

            $rows = $sales->map(fn($s) => [
                'customerEmail' => $s->customerEmail,
                'totalPrice'    => (float) ($s->totalPrice ?? 0),
                'saleDate'      => $s->saleDate,
            ])->values();

            return response()->json(['data' => $rows, 'total' => $rows->count()]);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'Failed to fetch RFM data.');
        }
    }

    // GET /api/admin/analytics/basket-data
    // Returns order line items needed for market basket analysis.
    // Two sources combined:
    //   1. Order collection (completed + Delivered walk-in orders) — items array = one transaction.
    //   2. Walk-in Sale records — each Sale stores notes="From Walk-in Order: {orderId}";
    //      items from the same parent order are grouped by that orderId so they form a
    //      proper multi-item transaction (not individual single-item rows).
    //      Non-walk-in Sale records are included individually as single-item transactions.
    public function basketData(Request $request)
    {
        if (!$this->hasPermission($request, 'reports')) return $this->unauthorizedResponse();
        try {
            $query = Order::whereIn('orderStatus', ['completed', 'Delivered'])
                ->whereNotNull('items');

            if ($request->filled('startDate')) {
                $query->where('createdAt', '>=', $request->startDate);
            }
            if ($request->filled('endDate')) {
                $query->where('createdAt', '<=', $request->endDate);
            }

            $orders = $query->get(['_id', 'items']);

            $rows         = [];
            $capturedOrderIds = [];

            foreach ($orders as $order) {
                $orderId = (string) $order->_id;
                $capturedOrderIds[$orderId] = true;
                foreach ($order->items ?? [] as $item) {
                    $name = $item['productName'] ?? ($item['name'] ?? null);
                    if ($name) {
                        $rows[] = ['orderId' => $orderId, 'productName' => $name];
                    }
                }
            }

            // Supplement with Sale records.
            // Walk-in sales store the parent Order ID in the notes field so we can
            // group their line items into proper multi-item transactions.
            $sales = Sale::where('status', '!=', 'refunded')
                ->whereNotNull('productName')
                ->get(['saleId', 'productName', 'source', 'notes']);

            foreach ($sales as $s) {
                $txnId = null;

                if ($s->source === 'walk-in' && $s->notes) {
                    if (preg_match('/From Walk-in Order:\s*(.+)$/i', $s->notes, $m)) {
                        $parentId = trim($m[1]);
                        // Skip if the parent Order was already captured above (avoid duplicates)
                        if (isset($capturedOrderIds[$parentId])) continue;
                        $txnId = 'walkin_' . $parentId;
                    }
                }

                if (!$txnId) {
                    $txnId = 'sale_' . ($s->saleId ?? uniqid());
                }

                $rows[] = ['orderId' => $txnId, 'productName' => $s->productName];
            }

            return response()->json(['data' => $rows, 'total' => count($rows)]);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'Failed to fetch basket data.');
        }
    }

    // GET /api/admin/analytics/service-data
    // Returns sales rows needed for service segmentation.
    public function serviceData(Request $request)
    {
        if (!$this->hasPermission($request, 'reports')) return $this->unauthorizedResponse();
        try {
            $query = Sale::where('status', '!=', 'refunded')
                ->whereNotNull('productName');

            if ($request->filled('startDate')) {
                $query->where('saleDate', '>=', $request->startDate);
            }
            if ($request->filled('endDate')) {
                $query->where('saleDate', '<=', $request->endDate);
            }

            $sales = $query->get(['productName', 'totalPrice', 'quantity', 'saleDate', 'category']);

            $rows = $sales->map(fn($s) => [
                'productName' => $s->productName,
                'totalPrice'  => (float) ($s->totalPrice ?? 0),
                'quantity'    => (int)   ($s->quantity   ?? 1),
                'saleDate'    => $s->saleDate,
                'category'    => $s->category,
            ])->values();

            return response()->json(['data' => $rows, 'total' => $rows->count()]);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'Failed to fetch service data.');
        }
    }
}
