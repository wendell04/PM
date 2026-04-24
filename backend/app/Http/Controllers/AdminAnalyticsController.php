<?php

namespace App\Http\Controllers;

use App\Models\Inventory;
use App\Models\Order;
use App\Models\Product;
use App\Models\Sale;
use App\Models\StockHistory;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;

class AdminAnalyticsController extends Controller
{
    public function dashboardStats(Request $request)
    {
        try {
            if (!$this->isAdmin($request)) {
                return $this->unauthorizedResponse();
            }

            $data = Cache::remember('admin_dashboard_stats', 30, function () {
                $totalOrders   = Order::count();
                $pendingOrders = Order::where('orderStatus', 'Pending')->count();
                $totalRevenue  = (float) Sale::where('status', 'completed')->sum('totalPrice');
                $totalProducts = Product::where('isPublished', true)->count();

                $invActive           = Inventory::where('isActive', true)->get();
                $totalInventoryItems = $invActive->count();

                $lowStockCount = $invActive->filter(function ($i) {
                    if ($i->isOnDemand) return false;
                    return (int) ($i->stockQty ?? 0) < (int) ($i->minStockLevel ?? 0)
                        && (int) ($i->stockQty ?? 0) > 0;
                })->count();

                $outOfStockCount = $invActive->filter(function ($i) {
                    if ($i->isOnDemand) return false;
                    return (int) ($i->stockQty ?? 0) <= 0;
                })->count();

                $recentOrders = Order::orderBy('createdAt', 'desc')
                    ->limit(5)
                    ->get()
                    ->map(function ($o) {
                        $name = $o->customerName
                            ?? data_get($o->userSnapshot, 'name')
                            ?? data_get($o->customer, 'name')
                            ?? '—';
                        return [
                            '_id'          => (string) $o->_id,
                            'orderId'      => $o->orderId ?? (string) $o->_id,
                            'customerName' => $name,
                            'totalAmount'  => (float) ($o->totalAmount ?? 0),
                            'orderStatus'  => $o->orderStatus ?? 'Pending',
                            'createdAt'    => $o->createdAt,
                        ];
                    })
                    ->values()
                    ->all();

                return [
                    'totalOrders'         => $totalOrders,
                    'pendingOrders'       => $pendingOrders,
                    'totalRevenue'        => $totalRevenue,
                    'totalProducts'       => $totalProducts,
                    'totalInventoryItems' => $totalInventoryItems,
                    'lowStockCount'       => $lowStockCount,
                    'outOfStockCount'     => $outOfStockCount,
                    'recentOrders'        => $recentOrders,
                ];
            });

            return $this->successResponse('Dashboard stats.', $data);
        } catch (\Exception $e) {
            Log::error('dashboardStats: '.$e->getMessage(), ['trace' => $e->getTraceAsString()]);

            return response()->json([
                'message' => 'Failed to load dashboard statistics.',
            ], 500);
        }
    }

    public function reportsSales(Request $request)
    {
        try {
            if (!$this->isAdmin($request)) {
                return $this->unauthorizedResponse();
            }

            $start = $request->filled('startDate')
                ? Carbon::parse($request->startDate)->startOfDay()
                : now()->subDays(30)->startOfDay();
            $end = $request->filled('endDate')
                ? Carbon::parse($request->endDate)->endOfDay()
                : now()->endOfDay();

            $groupBy = $request->input('groupBy', 'month');
            if (!in_array($groupBy, ['day', 'week', 'month'], true)) {
                $groupBy = 'month';
            }

            $sales = Sale::query()
                ->whereBetween('saleDate', [$start, $end])
                ->where('status', 'completed')
                ->get();

            $totalRevenue   = (float) $sales->sum('totalPrice');
            $totalOrders    = $sales->count();
            $avgOrderValue  = $totalOrders > 0 ? $totalRevenue / $totalOrders : 0.0;
            $totalItemsSold = (int) $sales->sum('quantity');

            $byPeriodMap = [];
            foreach ($sales as $s) {
                $d = $s->saleDate ? Carbon::parse($s->saleDate) : null;
                if (!$d) {
                    continue;
                }
                if ($groupBy === 'day') {
                    $key = $d->format('Y-m-d');
                } elseif ($groupBy === 'week') {
                    $key = $d->copy()->startOfWeek()->format('Y-m-d').' week';
                } else {
                    $key = $d->format('Y-m');
                }
                if (!isset($byPeriodMap[$key])) {
                    $byPeriodMap[$key] = ['period' => $key, 'revenue' => 0.0, 'orders' => 0];
                }
                $byPeriodMap[$key]['revenue'] += (float) ($s->totalPrice ?? 0);
                $byPeriodMap[$key]['orders']++;
            }
            $byPeriod = array_values($byPeriodMap);

            $topProducts = $sales->groupBy('productName')->map(function ($group, $name) {
                return [
                    'name'       => $name ?: 'Unknown',
                    'revenue'    => (float) $group->sum('totalPrice'),
                    'unitsSold'  => (int) $group->sum('quantity'),
                ];
            })->sortByDesc('revenue')->values()->take(10)->all();

            $ordersInRange = Order::query()
                ->whereBetween('createdAt', [$start, $end])
                ->get();

            $paymentMap = [];
            foreach ($ordersInRange as $o) {
                $method = $o->paymentMethod ?? 'unknown';
                if (!isset($paymentMap[$method])) {
                    $paymentMap[$method] = ['method' => $method, 'count' => 0, 'total' => 0.0];
                }
                $paymentMap[$method]['count']++;
                $paymentMap[$method]['total'] += (float) ($o->totalAmount ?? 0);
            }
            $paymentMethods = array_values($paymentMap);

            return $this->successResponse('Sales report.', [
                'summary' => [
                    'totalRevenue'    => $totalRevenue,
                    'totalOrders'     => $totalOrders,
                    'avgOrderValue'   => round($avgOrderValue, 2),
                    'totalItemsSold'  => $totalItemsSold,
                ],
                'byPeriod'        => $byPeriod,
                'topProducts'     => $topProducts,
                'paymentMethods'  => $paymentMethods,
            ]);
        } catch (\Exception $e) {
            Log::error('reportsSales: '.$e->getMessage(), ['trace' => $e->getTraceAsString()]);

            return response()->json([
                'message' => 'Failed to build sales report.',
            ], 500);
        }
    }

    public function reportsInventory(Request $request)
    {
        try {
            if (!$this->isAdmin($request)) {
                return $this->unauthorizedResponse();
            }

            $items = Inventory::where('isActive', true)->get();

            $totalValue = 0.0;
            foreach ($items as $inv) {
                $bc = (float) ($inv->baseCost ?? $inv->averageCost ?? 0);
                $totalValue += ((int) ($inv->stockQty ?? 0)) * $bc;
            }

            $lowStock = $items->filter(function ($inv) {
                if ($inv->isOnDemand) {
                    return false;
                }

                return (int) ($inv->stockQty ?? 0) < (int) ($inv->minStockLevel ?? 0)
                    && (int) ($inv->stockQty ?? 0) > 0;
            })->map(function ($inv) {
                return [
                    'name'          => $inv->name,
                    'stockQty'      => (int) ($inv->stockQty ?? 0),
                    'minStockLevel' => (int) ($inv->minStockLevel ?? 0),
                    'category'      => $inv->category ?? '',
                ];
            })->values()->all();

            $outOfStock = $items->filter(function ($inv) {
                if ($inv->isOnDemand) {
                    return false;
                }

                return (int) ($inv->stockQty ?? 0) <= 0;
            })->map(function ($inv) {
                return [
                    'name'     => $inv->name,
                    'stockQty' => (int) ($inv->stockQty ?? 0),
                    'category' => $inv->category ?? '',
                ];
            })->values()->all();

            $since = now()->subDays(30);
            $hist = StockHistory::where('createdAt', '>=', $since)->get();
            $byInv = $hist->groupBy('inventoryId');
            $topMovers = [];
            foreach ($byInv as $invId => $rows) {
                if (!$invId) {
                    continue;
                }
                $inv = Inventory::find($invId);
                $topMovers[] = [
                    'name'            => $inv->name ?? 'Unknown',
                    'totalMovements'  => $rows->count(),
                ];
            }
            usort($topMovers, fn ($a, $b) => $b['totalMovements'] <=> $a['totalMovements']);
            $topMovers = array_slice($topMovers, 0, 10);

            return $this->successResponse('Inventory report.', [
                'totalValue'  => round($totalValue, 2),
                'lowStock'    => $lowStock,
                'outOfStock'  => $outOfStock,
                'topMovers'   => $topMovers,
            ]);
        } catch (\Exception $e) {
            Log::error('reportsInventory: '.$e->getMessage(), ['trace' => $e->getTraceAsString()]);

            return response()->json([
                'message' => 'Failed to build inventory report.',
            ], 500);
        }
    }
}
