<?php

namespace App\Http\Controllers;

use App\Models\Sale;
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

            $sales = $query->get(['customerEmail', 'totalPrice', 'saleDate', 'orderRequestId', 'jobOrderId']);

            // A stable "purchase occasion" key so RFM Frequency counts distinct orders,
            // not line-item rows. Line items of one order share orderRequestId/jobOrderId;
            // sales without either fall back to a per-day key (same customer + same day = 1 visit).
            $rows = $sales->map(fn($s) => [
                'customerEmail' => $s->customerEmail,
                'totalPrice'    => (float) ($s->totalPrice ?? 0),
                'saleDate'      => $s->saleDate,
                'orderKey'      => (string) ($s->orderRequestId
                    ?: ($s->jobOrderId ?: ('day_' . substr((string) $s->saleDate, 0, 10)))),
            ])->values();

            return response()->json(['data' => $rows, 'total' => $rows->count()]);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'Failed to fetch RFM data.');
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
