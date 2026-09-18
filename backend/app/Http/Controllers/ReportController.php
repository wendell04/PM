<?php

namespace App\Http\Controllers;

use App\Models\Inventory;
use App\Models\Sale;
use App\Models\StockHistory;
use Carbon\Carbon;
use Carbon\CarbonImmutable;
use Illuminate\Http\Request;

/**
 * The numbers behind the Reports module, shaped so a chart, the table under it and the CSV all
 * say the same thing for the same dates.
 *
 * Three things the old summary got wrong and this does not:
 *  - Buckets follow the range. Seven days are shown by day, a quarter by week, a year by month.
 *    A daily line over a year of a small shop's sales is noise with a few spikes.
 *  - Buckets are continuous. A day with no sales is a zero, not a missing point, so the chart's
 *    shape is the shop's shape.
 *  - Everything is in Asia/Manila. A sale at 11pm Manila is that day's sale, not tomorrow's.
 */
class ReportController extends Controller
{
    private const TZ = 'Asia/Manila';

    /**
     * GET /api/admin/reports/sales?from=YYYY-MM-DD&to=YYYY-MM-DD&bucket=auto|day|week|month
     *
     * Sales = what was sold, by sale date, from the sales ledger (one row per order line; a
     * cancelled order never reaches it). Cash received is a different question, answered on Home.
     */
    public function sales(Request $request)
    {
        try {
            if (!$this->hasPermission($request, 'reports')) {
                return $this->unauthorizedResponse();
            }

            [$from, $to] = $this->range($request);
            $days   = (int) $from->startOfDay()->diffInDays($to->startOfDay()) + 1;
            $bucket = $request->input('bucket', 'auto');
            if (!in_array($bucket, ['day', 'week', 'month'], true)) {
                $bucket = $days <= 45 ? 'day' : ($days <= 200 ? 'week' : 'month');
            }

            $current  = $this->salesSlice($from, $to, $bucket);
            $prevTo   = $from->subDay()->endOfDay();
            $prevFrom = $prevTo->subDays($days - 1)->startOfDay();
            $previous = $this->salesSlice($prevFrom, $prevTo, $bucket);

            return $this->successResponse('Sales report.', [
                'range' => [
                    'from'   => $from->toDateString(),
                    'to'     => $to->toDateString(),
                    'days'   => $days,
                    'bucket' => $bucket,
                    'label'  => $this->rangeLabel($from, $to),
                ],
                'previousRange' => [
                    'from'  => $prevFrom->toDateString(),
                    'to'    => $prevTo->toDateString(),
                    'label' => $this->rangeLabel($prevFrom, $prevTo),
                ],
                'totals'      => $current['totals'],
                'previous'    => $previous['totals'],
                'series'      => $current['series'],
                'prevSeries'  => $previous['series'],
                'bySource'    => $current['bySource'],
                'topProducts' => $current['topProducts'],
                'byCategory'  => $current['byCategory'],
            ]);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'Could not build the sales report.');
        }
    }

    /**
     * GET /api/admin/reports/inventory
     *
     * What the shelf is worth, what is below its line, what is out, and what left the shelf in the
     * last 30 days. No date range: stock is a snapshot; movement is the trailing month.
     */
    public function inventory(Request $request)
    {
        try {
            if (!$this->hasPermission($request, 'reports')) {
                return $this->unauthorizedResponse();
            }

            $items = Inventory::where('isActive', '!=', false)->get();
            $byCat = [];
            $attention = [];
            $value = 0.0;
            $counts = ['materials' => 0, 'stocked' => 0, 'belowMin' => 0, 'out' => 0, 'onDemand' => 0];

            foreach ($items as $inv) {
                $counts['materials']++;
                $qty  = (float) ($inv->stockQty ?? 0);
                $cost = (float) ($inv->unitCost ?? $inv->baseCost ?? 0);
                $val  = $qty * $cost;
                $value += $val;
                $cat = $inv->category ?: 'Uncategorized';
                $byCat[$cat] = $byCat[$cat] ?? ['category' => $cat, 'value' => 0.0, 'items' => 0, 'units' => 0.0];
                $byCat[$cat]['value'] += $val;
                $byCat[$cat]['items']++;
                $byCat[$cat]['units'] += $qty;

                if ($inv->isOnDemand) { $counts['onDemand']++; continue; }
                $counts['stocked']++;
                $min = (float) ($inv->minStockLevel ?? 0);
                $free = $qty - (float) ($inv->reservedQty ?? 0);
                $status = $free <= 0 ? 'out' : ($min > 0 && $free <= $min ? 'low' : 'ok');
                if ($status === 'out') $counts['out']++;
                if ($status === 'low') $counts['belowMin']++;
                if ($status !== 'ok') {
                    $attention[] = [
                        'inventoryId' => (string) $inv->_id,
                        'name'        => $inv->name,
                        'sku'         => $inv->sku,
                        'uom'         => $inv->uom,
                        'onHand'      => $qty,
                        'reserved'    => (float) ($inv->reservedQty ?? 0),
                        'minimum'     => $min,
                        'status'      => $status,
                    ];
                }
            }
            usort($attention, fn ($a, $b) => [$a['status'] === 'out' ? 0 : 1, $a['onHand'] - $a['minimum']] <=> [$b['status'] === 'out' ? 0 : 1, $b['onHand'] - $b['minimum']]);
            $cats = array_values($byCat);
            usort($cats, fn ($a, $b) => $b['value'] <=> $a['value']);

            // What left the shelf in the last 30 days, by material.
            $since = CarbonImmutable::now(self::TZ)->subDays(30)->startOfDay()->utc();
            $used  = [];
            foreach (StockHistory::where('type', 'deduction')->where('createdAt', '>=', $since)->get(['inventoryId', 'quantity']) as $h) {
                $id = (string) $h->inventoryId;
                $used[$id] = ($used[$id] ?? 0) + abs((float) $h->quantity);
            }
            $names = $items->keyBy(fn ($i) => (string) $i->_id);
            $consumption = [];
            foreach ($used as $id => $q) {
                $inv = $names[$id] ?? null;
                if (!$inv) continue;
                $consumption[] = ['name' => $inv->name, 'uom' => $inv->uom, 'qty' => round($q, 2), 'cost' => round($q * (float) ($inv->unitCost ?? $inv->baseCost ?? 0), 2)];
            }
            usort($consumption, fn ($a, $b) => $b['qty'] <=> $a['qty']);

            return $this->successResponse('Inventory report.', [
                'asOf'        => CarbonImmutable::now(self::TZ)->toDateTimeString(),
                'totals'      => array_merge($counts, ['stockValue' => round($value, 2)]),
                'byCategory'  => array_map(fn ($c) => array_merge($c, ['value' => round($c['value'], 2)]), $cats),
                'attention'   => $attention,
                'consumption' => array_slice($consumption, 0, 12),
            ]);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'Could not build the inventory report.');
        }
    }

    // ── helpers ────────────────────────────────────────────────────────────────

    /** The requested range as Manila-local day bounds; defaults to this month. */
    private function range(Request $request): array
    {
        $now  = CarbonImmutable::now(self::TZ);
        $from = $request->filled('from') ? CarbonImmutable::parse($request->from, self::TZ)->startOfDay() : $now->startOfMonth();
        $to   = $request->filled('to')   ? CarbonImmutable::parse($request->to, self::TZ)->endOfDay()   : $now->endOfDay();
        if ($to < $from) [$from, $to] = [$to->startOfDay(), $from->endOfDay()];
        return [$from, $to];
    }

    private function rangeLabel(CarbonImmutable $from, CarbonImmutable $to): string
    {
        if ($from->isSameDay($to)) return $from->format('M j, Y');
        if ($from->year === $to->year) {
            return $from->month === $to->month
                ? $from->format('M j') . '-' . $to->format('j, Y')
                : $from->format('M j') . ' - ' . $to->format('M j, Y');
        }
        return $from->format('M j, Y') . ' - ' . $to->format('M j, Y');
    }

    /** The bucket a Manila-local moment falls in, and its label. */
    private function bucketOf(CarbonImmutable $d, string $bucket): array
    {
        return match ($bucket) {
            'day'   => [$d->toDateString(), $d->format('M j')],
            'week'  => (function () use ($d) {
                $start = $d->startOfWeek(Carbon::MONDAY); $end = $start->addDays(6);
                $label = $start->month === $end->month ? $start->format('M j') . '-' . $end->format('j') : $start->format('M j') . '-' . $end->format('M j');
                return [$start->toDateString(), $label];
            })(),
            default => [$d->format('Y-m'), $d->format('M Y')],
        };
    }

    /** Every bucket in the range, in order, zero-filled. */
    private function emptyBuckets(CarbonImmutable $from, CarbonImmutable $to, string $bucket): array
    {
        $out = [];
        $cursor = $bucket === 'week' ? $from->startOfWeek(Carbon::MONDAY) : ($bucket === 'month' ? $from->startOfMonth() : $from->startOfDay());
        while ($cursor <= $to) {
            [$key, $label] = $this->bucketOf($cursor, $bucket);
            $out[$key] = ['key' => $key, 'label' => $label, 'revenue' => 0.0, 'cost' => 0.0, 'profit' => 0.0, 'lines' => 0, 'orders' => 0, '_orders' => []];
            $cursor = match ($bucket) { 'day' => $cursor->addDay(), 'week' => $cursor->addWeek(), default => $cursor->addMonth() };
        }
        return $out;
    }

    private function salesSlice(CarbonImmutable $from, CarbonImmutable $to, string $bucket): array
    {
        $rows = Sale::where('status', 'completed')
            ->where('saleDate', '>=', $from->utc())
            ->where('saleDate', '<=', $to->utc())
            ->get(['saleId', 'saleDate', 'totalPrice', 'cost', 'profit', 'quantity', 'productName', 'category', 'source']);

        $buckets = $this->emptyBuckets($from, $to, $bucket);
        $totals  = ['revenue' => 0.0, 'cost' => 0.0, 'profit' => 0.0, 'lines' => 0, 'units' => 0, 'costMissing' => 0];
        $orders  = [];
        $source  = ['online' => ['revenue' => 0.0, 'orders' => []], 'manual' => ['revenue' => 0.0, 'orders' => []]];
        $products = [];
        $cats     = [];

        foreach ($rows as $s) {
            $when = CarbonImmutable::parse($s->saleDate)->setTimezone(self::TZ);
            [$key] = $this->bucketOf($when, $bucket);
            if (!isset($buckets[$key])) continue;   // a week/month bucket that starts before the range
            $rev  = (float) ($s->totalPrice ?? 0);
            $cost = (float) ($s->cost ?? 0);
            $oid  = (string) ($s->saleId ?: $s->_id);

            $b = &$buckets[$key];
            $b['revenue'] += $rev; $b['cost'] += $cost; $b['profit'] += $rev - $cost; $b['lines']++;
            $b['_orders'][$oid] = true;
            unset($b);

            $totals['revenue'] += $rev; $totals['cost'] += $cost; $totals['profit'] += $rev - $cost; $totals['lines']++;
            $totals['units'] += (int) ($s->quantity ?? 0);
            if ($cost <= 0) $totals['costMissing']++;
            $orders[$oid] = true;

            $src = ($s->source ?? '') === 'manual' ? 'manual' : 'online';
            $source[$src]['revenue'] += $rev;
            $source[$src]['orders'][$oid] = true;

            $pn = (string) ($s->productName ?: 'Unnamed');
            $products[$pn] = $products[$pn] ?? ['name' => $pn, 'qty' => 0, 'revenue' => 0.0, 'profit' => 0.0];
            $products[$pn]['qty'] += (int) ($s->quantity ?? 0);
            $products[$pn]['revenue'] += $rev;
            $products[$pn]['profit'] += $rev - $cost;

            $cn = (string) ($s->category ?: 'Uncategorized');
            $cats[$cn] = $cats[$cn] ?? ['category' => $cn, 'revenue' => 0.0, 'lines' => 0];
            $cats[$cn]['revenue'] += $rev; $cats[$cn]['lines']++;
        }

        $series = array_values(array_map(function ($b) {
            $b['orders'] = count($b['_orders']); unset($b['_orders']);
            $b['revenue'] = round($b['revenue'], 2); $b['cost'] = round($b['cost'], 2); $b['profit'] = round($b['profit'], 2);
            return $b;
        }, $buckets));

        $top = array_values($products);
        usort($top, fn ($a, $b) => $b['revenue'] <=> $a['revenue']);
        $catList = array_values($cats);
        usort($catList, fn ($a, $b) => $b['revenue'] <=> $a['revenue']);

        $orderCount = count($orders);
        return [
            'totals' => array_merge($totals, [
                'revenue' => round($totals['revenue'], 2), 'cost' => round($totals['cost'], 2), 'profit' => round($totals['profit'], 2),
                'orders'  => $orderCount,
                'avgOrder' => $orderCount ? round($totals['revenue'] / $orderCount, 2) : 0,
            ]),
            'series'   => $series,
            'bySource' => [
                'online' => ['revenue' => round($source['online']['revenue'], 2), 'orders' => count($source['online']['orders'])],
                'manual' => ['revenue' => round($source['manual']['revenue'], 2), 'orders' => count($source['manual']['orders'])],
            ],
            'topProducts' => array_slice(array_map(fn ($p) => array_merge($p, ['revenue' => round($p['revenue'], 2), 'profit' => round($p['profit'], 2)]), $top), 0, 10),
            'byCategory'  => array_map(fn ($c) => array_merge($c, ['revenue' => round($c['revenue'], 2)]), $catList),
        ];
    }
}
