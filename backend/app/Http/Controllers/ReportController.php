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
     * GET /api/admin/reports/{type}/pdf - the same report as a PDF file (sales, orders and
     * transactions take from/to; inventory is a snapshot).
     *
     * The page only had Print, which leaves it to the browser; this is a real download, laid out for
     * A4 by dompdf the way the receipt is.
     */
    public function pdf(Request $request, string $type)
    {
        $titles = ['sales' => 'Sales report', 'inventory' => 'Inventory report', 'orders' => 'Order records report', 'transactions' => 'Transaction report'];
        if (!isset($titles[$type])) return $this->notFoundResponse('Report');
        $res = $this->{$type}($request);
        if ($res->getStatusCode() !== 200) return $res;
        $d = json_decode($res->getContent(), true)['data'] ?? [];

        $user = $request->user();
        $view = [
            'd'           => $d,
            'title'       => $titles[$type],
            'subtitle'    => $type !== 'inventory' ? ($d['range']['label'] ?? '')
                : ('Stock as of ' . (!empty($d['asOf']) ? CarbonImmutable::parse($d['asOf'], self::TZ)->format('M j, Y g:i A') : 'now')),
            'filtered'    => collect((array) ($d['filters'] ?? []))->map(fn ($v, $k) => ($k === 'q' ? 'search' : $k) . ': ' . $v)->implode(', '),
            'generatedAt' => CarbonImmutable::now(self::TZ)->format('M j, Y g:i A'),
            'generatedBy' => trim(($user->firstName ?? '') . ' ' . ($user->lastName ?? '')) ?: 'staff',
        ];
        try {
            $options = new \Dompdf\Options();
            $options->set('isRemoteEnabled', false);
            $options->set('isHtml5ParserEnabled', true);
            $options->set('defaultFont', 'DejaVu Sans');   // has the peso sign
            $dompdf = new \Dompdf\Dompdf($options);
            $dompdf->loadHtml(view('reports.pdf-' . $type, $view)->render(), 'UTF-8');
            // The two record reports are wide tables (nine and seven columns); portrait wrapped every row.
            $dompdf->setPaper('A4', in_array($type, ['orders', 'transactions'], true) ? 'landscape' : 'portrait');
            $dompdf->render();
            // "Page 1 of 2" on every page, bottom right, so a printed copy can be put back in order.
            $canvas = $dompdf->getCanvas();
            $canvas->page_text($canvas->get_width() - 110, $canvas->get_height() - 30, 'Page {PAGE_NUM} of {PAGE_COUNT}',
                $dompdf->getFontMetrics()->getFont('DejaVu Sans'), 7.5, [0.54, 0.56, 0.63]);
        } catch (\Throwable $e) {
            return $this->serverErrorResponse($e, 'Could not make the PDF.');
        }
        $name = $type === 'inventory'
            ? 'Inventory-report-' . CarbonImmutable::now(self::TZ)->toDateString() . '.pdf'
            : str_replace(' ', '-', ucfirst($titles[$type])) . '-' . ($d['range']['from'] ?? '') . '-to-' . ($d['range']['to'] ?? '') . '.pdf';
        return response($dompdf->output(), 200, [
            'Content-Type'        => 'application/pdf',
            'Content-Disposition' => 'attachment; filename="' . $name . '"',
        ]);
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
                // A material has no unitCost field - that name is on stock movements, not on the
                // material - so this always fell through to baseCost, the price typed in when the
                // material was first created, and valued the shelf at May's prices. The running
                // average is what the stock on it actually cost.
                $cost = \App\Support\CostResolver::materialCost($inv);
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
            // "At cost" is what those units cost WHEN they went out. Every deduction records its own
            // unitCost and totalCost from the batch it came off; pricing the whole month at today's
            // figure - worse, at the material's original seed price - restated it at a cost nobody
            // paid. A row without a recorded cost falls back to the running average.
            $names = $items->keyBy(fn ($i) => (string) $i->_id);
            $used  = [];
            foreach (StockHistory::where('type', 'deduction')->where('createdAt', '>=', $since)->get(['inventoryId', 'quantity', 'unitCost', 'totalCost']) as $h) {
                $id  = (string) $h->inventoryId;
                $q   = abs((float) $h->quantity);
                $rowCost = (float) ($h->totalCost ?? 0);
                if ($rowCost <= 0 && (float) ($h->unitCost ?? 0) > 0) $rowCost = $q * (float) $h->unitCost;
                if ($rowCost <= 0) $rowCost = $q * \App\Support\CostResolver::materialCost($names[$id] ?? null);
                $used[$id] = [
                    'qty'  => ($used[$id]['qty'] ?? 0) + $q,
                    'cost' => ($used[$id]['cost'] ?? 0) + abs($rowCost),
                ];
            }
            $consumption = [];
            foreach ($used as $id => $u) {
                $inv = $names[$id] ?? null;
                if (!$inv) continue;
                $consumption[] = ['name' => $inv->name, 'uom' => $inv->uom, 'qty' => round($u['qty'], 2), 'cost' => round($u['cost'], 2)];
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

    /**
     * GET /api/admin/reports/orders?from=YYYY-MM-DD&to=YYYY-MM-DD
     *
     * Order records: every order PLACED in the range (Manila dates), whatever happened to it since.
     * A checkout that was never paid is not an order (checkoutPending / voidedCheckout) and is left
     * out, as everywhere else. Paid and balance are read the way Home reads them, so the two agree.
     */
    public function orders(Request $request)
    {
        try {
            if (!$this->hasPermission($request, 'reports')) {
                return $this->unauthorizedResponse();
            }
            [$from, $to] = $this->range($request);
            $filters = self::recordFilters($request);

            $rows = [];
            $totals = ['orders' => 0, 'value' => 0.0, 'paid' => 0.0, 'balance' => 0.0, 'open' => 0, 'delivered' => 0, 'cancelled' => 0];
            $byStatus = [];
            foreach (\App\Models\Order::where('checkoutPending', '!=', true)->where('voidedCheckout', '!=', true)->get() as $o) {
                $placed = self::when($o->createdAt ?? $o->created_at ?? null);
                if (!$placed || $placed < $from || $placed > $to) continue;

                $code   = \App\Support\OrderStatus::normalize((string) ($o->orderStatus ?? $o->status ?? 'pending')) ?: 'pending';
                $closed = in_array($code, ['cancelled', 'returned'], true);
                $total  = (float) ($o->totalAmount ?? 0);
                $paid   = self::orderPaid($o);
                $bal    = $closed ? 0.0 : max(0.0, $total - $paid);
                $items  = is_array($o->items) ? $o->items : [];
                $first  = $items[0] ?? [];
                $summary = trim(($first['productName'] ?? $first['name'] ?? 'Item') . ' x' . (int) ($first['quantity'] ?? $first['qty'] ?? 1))
                    . (count($items) > 1 ? ' +' . (count($items) - 1) . ' more' : '');

                $row = [
                    'id'       => (string) $o->_id,
                    'ref'      => self::orderRef($o),
                    'placed'   => $placed->format('M j, Y g:i A'),
                    'placedAt' => $placed->toIso8601String(),
                    'customer' => self::customerName($o),
                    'channel'  => self::channelLabel($o),
                    'items'    => $summary,
                    'total'    => round($total, 2),
                    'paid'     => round($paid, 2),
                    'balance'  => round($bal, 2),
                    // From what was actually paid: the stored paymentStatus tracks the goods only, so an
                    // order whose design fee is paid read "Unpaid" beside a paid amount.
                    'payment'  => $closed ? '-' : ($total > 0 && $paid >= $total - 0.005 ? 'Paid' : ($paid > 0 ? 'Partial' : 'Unpaid')),
                    'status'   => \App\Support\OrderStatus::label($code),
                ];
                // Filtered before anything is counted, so the totals describe the rows shown.
                if (!self::rowMatches($row, $filters, ['status', 'payment', 'channel'], ['ref', 'customer', 'items'])) continue;
                $rows[] = $row;

                $label = \App\Support\OrderStatus::label($code);
                $byStatus[$label] = $byStatus[$label] ?? ['status' => $label, 'orders' => 0, 'value' => 0.0];
                $byStatus[$label]['orders']++;
                $byStatus[$label]['value'] += $total;

                $totals['orders']++;
                if ($closed) { if ($code === 'cancelled') $totals['cancelled']++; continue; }
                $totals['value']   += $total;
                $totals['paid']    += $paid;
                $totals['balance'] += $bal;
                $code === 'delivered' ? $totals['delivered']++ : $totals['open']++;
            }
            usort($rows, fn ($a, $b) => strcmp($b['placedAt'], $a['placedAt']));
            $statusList = array_values($byStatus);
            usort($statusList, fn ($a, $b) => $b['orders'] <=> $a['orders']);

            return $this->successResponse('Order records report.', [
                'range'    => ['from' => $from->toDateString(), 'to' => $to->toDateString(), 'label' => $this->rangeLabel($from, $to)],
                'totals'   => array_merge($totals, [
                    'value' => round($totals['value'], 2), 'paid' => round($totals['paid'], 2), 'balance' => round($totals['balance'], 2),
                ]),
                'byStatus' => array_map(fn ($s) => array_merge($s, ['value' => round($s['value'], 2)]), $statusList),
                'filters'  => (object) $filters,
                'rows'     => $rows,
            ]);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'Could not build the order records report.');
        }
    }

    /**
     * GET /api/admin/reports/transactions?from=YYYY-MM-DD&to=YYYY-MM-DD
     *
     * Every peso that moved in the range, by the day it moved: payments on orders (downpayment,
     * balance, design fee), delivery fees, and refunds paid back. Unlike Home's "collected", payments
     * on orders that were later cancelled are listed - that money did come in - and the refund that
     * returned it is listed against it, so the net is what the shop actually kept.
     */
    public function transactions(Request $request)
    {
        try {
            if (!$this->hasPermission($request, 'reports')) {
                return $this->unauthorizedResponse();
            }
            [$from, $to] = $this->range($request);

            $rows = [];
            $add = function ($o, $when, string $kind, $method, float $amount, string $by, string $note = '') use (&$rows, $from, $to) {
                $at = self::when($when);
                if (!$at || $at < $from || $at > $to || abs($amount) < 0.005) return;
                $rows[] = [
                    'at'       => $at->toIso8601String(),
                    'date'     => $at->format('M j, Y g:i A'),
                    'ref'      => self::orderRef($o),
                    'orderId'  => (string) $o->_id,
                    'customer' => self::customerName($o),
                    'kind'     => $kind,
                    'method'   => self::methodLabel($method),
                    'by'       => $by,
                    'note'     => mb_substr(trim($note), 0, 80),
                    'amount'   => round($amount, 2),
                ];
            };
            $kinds = ['downpayment' => 'Downpayment', 'balance' => 'Balance', 'design_fee' => 'Design fee', 'payment' => 'Payment', '' => 'Payment'];

            foreach (\App\Models\Order::where('checkoutPending', '!=', true)->where('voidedCheckout', '!=', true)->get() as $o) {
                foreach ((is_array($o->paymentHistory) ? $o->paymentHistory : []) as $h) {
                    $amt = (float) ($h['amount'] ?? 0);
                    // Same rule as Home: a voided line and its minus line are money that never came in.
                    if ($amt <= 0 || !empty($h['voided']) || ($h['type'] ?? '') === 'void') continue;
                    $by = !empty($h['recordedBy']) ? 'Recorded by staff'
                        : (in_array(strtolower((string) ($h['method'] ?? '')), ['gcash', 'paymaya', 'maya', 'card'], true) ? 'Online (PayMongo)' : 'Recorded');
                    $add($o, $h['paidAt'] ?? $h['recordedAt'] ?? $h['createdAt'] ?? $o->createdAt, $kinds[(string) ($h['type'] ?? '')] ?? ucfirst(str_replace('_', ' ', (string) $h['type'])),
                        $h['method'] ?? null, $amt, $by, (string) ($h['note'] ?? ''));
                }
                // The delivery fee is paid on its own and kept in its own fields, not in the history.
                if ((float) ($o->courierFeePaidAmount ?? 0) > 0 && !empty($o->courierFeePaidAt)) {
                    $add($o, $o->courierFeePaidAt, 'Delivery fee', $o->courierFeePaidMethod ?? null, (float) $o->courierFeePaidAmount,
                        $o->courierFeePaymentRef ? 'Online (PayMongo)' : 'Recorded by staff', $o->courierFeePaymentRef ? 'Ref ' . $o->courierFeePaymentRef : '');
                }
                // Only refunds actually paid back. An owed or waived refund moved no money.
                foreach ((is_array($o->refunds) ? $o->refunds : []) as $r) {
                    if (($r['status'] ?? 'owed') !== 'paid') continue;
                    $add($o, $r['paidAt'] ?? $r['recordedAt'] ?? null, 'Refund', $r['paidVia'] ?? null, -abs((float) ($r['amount'] ?? 0)),
                        'Recorded by staff', (string) ($r['reason'] ?? ''));
                }
            }
            $filters = self::recordFilters($request);
            $rows = array_values(array_filter($rows, fn ($r) => self::rowMatches($r, $filters, ['method', 'kind', 'by'], ['ref', 'customer', 'note'])));
            usort($rows, fn ($a, $b) => strcmp($b['at'], $a['at']));

            $in = 0.0; $out = 0.0; $byMethod = []; $byKind = [];
            foreach ($rows as $r) {
                $r['amount'] >= 0 ? $in += $r['amount'] : $out += -$r['amount'];
                $byMethod[$r['method']] = $byMethod[$r['method']] ?? ['method' => $r['method'], 'count' => 0, 'amount' => 0.0];
                $byMethod[$r['method']]['count']++;
                $byMethod[$r['method']]['amount'] += $r['amount'];
                $byKind[$r['kind']] = $byKind[$r['kind']] ?? ['kind' => $r['kind'], 'count' => 0, 'amount' => 0.0];
                $byKind[$r['kind']]['count']++;
                $byKind[$r['kind']]['amount'] += $r['amount'];
            }
            $sortAmt = function (array $list) { $l = array_values($list); usort($l, fn ($a, $b) => abs($b['amount']) <=> abs($a['amount']));
                return array_map(fn ($x) => array_merge($x, ['amount' => round($x['amount'], 2)]), $l); };

            return $this->successResponse('Transaction report.', [
                'range'    => ['from' => $from->toDateString(), 'to' => $to->toDateString(), 'label' => $this->rangeLabel($from, $to)],
                'totals'   => ['count' => count($rows), 'received' => round($in, 2), 'refunded' => round($out, 2), 'net' => round($in - $out, 2)],
                'byMethod' => $sortAmt($byMethod),
                'byKind'   => $sortAmt($byKind),
                'filters'  => (object) $filters,
                'rows'     => $rows,
            ]);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'Could not build the transaction report.');
        }
    }

    // ── helpers ────────────────────────────────────────────────────────────────

    /**
     * The table filters on the record reports, as sent by the page and by its PDF link: exact
     * matches on the listed columns plus a free-text search (q). Each capped, like every input.
     */
    private static function recordFilters(Request $request): array
    {
        $out = [];
        foreach (['status', 'payment', 'channel', 'method', 'kind', 'by', 'q'] as $k) {
            $v = trim(mb_substr((string) $request->query($k, ''), 0, 80));
            if ($v !== '') $out[$k] = $v;
        }
        return $out;
    }

    private static function rowMatches(array $row, array $filters, array $exact, array $searchIn): bool
    {
        foreach ($exact as $k) {
            if (isset($filters[$k]) && strcasecmp((string) ($row[$k] ?? ''), $filters[$k]) !== 0) return false;
        }
        if (isset($filters['q'])) {
            $hay = mb_strtolower(implode(' ', array_map(fn ($k) => (string) ($row[$k] ?? ''), $searchIn)));
            if (!str_contains($hay, mb_strtolower($filters['q']))) return false;
        }
        return true;
    }

    /** A stored date (BSON date, ISO string or Carbon) as a Manila moment, or null. */
    private static function when($v): ?CarbonImmutable
    {
        if (!$v) return null;
        try {
            if ($v instanceof \MongoDB\BSON\UTCDateTime) $v = $v->toDateTime();
            return CarbonImmutable::parse($v)->setTimezone(self::TZ);
        } catch (\Throwable $e) {
            return null;
        }
    }

    /** The reference the shop and the customer see, e.g. ORD-96079BA6. */
    private static function orderRef($o): string
    {
        return 'ORD-' . strtoupper(substr((string) $o->_id, -8));
    }

    private static function customerName($o): string
    {
        $snap = is_array($o->userSnapshot) ? $o->userSnapshot : [];
        $addr = is_array($o->deliveryAddress) ? $o->deliveryAddress : [];
        return trim((string) ($snap['name'] ?? $addr['name'] ?? $addr['fullName'] ?? '')) ?: 'Walk-in customer';
    }

    private static function channelLabel($o): string
    {
        return match (strtolower((string) ($o->orderSource ?? ''))) {
            'pos', 'walk-in', 'walkin', 'counter' => 'Counter',
            'quote', 'quotation'                  => 'Quotation',
            default                               => 'Online',
        };
    }

    private static function methodLabel($m): string
    {
        return match (strtolower((string) $m)) {
            'gcash'           => 'GCash',
            'paymaya', 'maya' => 'Maya',
            'card'            => 'Card',
            'cash'            => 'Cash',
            'bank', 'bank_transfer' => 'Bank transfer',
            ''                => 'Not recorded',
            default           => ucfirst((string) $m),
        };
    }

    /** What the customer has paid toward the order, read the way Home reads it. */
    private static function orderPaid($o): float
    {
        $sum = 0.0;
        foreach ((is_array($o->paymentHistory) ? $o->paymentHistory : []) as $h) {
            $a = (float) ($h['amount'] ?? 0);
            if ($a <= 0 || !empty($h['voided']) || ($h['type'] ?? '') === 'void') continue;
            $sum += $a;
        }
        return max((float) ($o->downPayment ?? 0), $sum);
    }

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

    /**
     * Which ORDER a sale line belongs to.
     *
     * A sale row is one LINE - the id is generated per item - so counting distinct sale ids counted
     * a two-item order as two orders and put Avg order at half what it was. Lines of one order are
     * tied together by orderRef (written from 2026-09-26) or by the "From Order: ..." note every
     * earlier row carries. A line with neither was entered on its own and is its own order.
     */
    private static function orderKey($s): string
    {
        $ref = trim((string) ($s->orderRef ?? ''));
        if ($ref !== '') return 'o:' . $ref;
        if (preg_match('/From (?:Walk-in )?Order:\s*(\S+)/i', (string) ($s->notes ?? ''), $m)) return 'o:' . $m[1];
        return 's:' . (string) ($s->saleId ?: $s->_id);
    }

    private function salesSlice(CarbonImmutable $from, CarbonImmutable $to, string $bucket): array
    {
        $rows = Sale::where('status', 'completed')
            ->where('saleDate', '>=', $from->utc())
            ->where('saleDate', '<=', $to->utc())
            ->get(['saleId', 'saleDate', 'totalPrice', 'cost', 'totalCost', 'costPerUnit', 'profit', 'quantity', 'productName', 'category', 'source', 'notes', 'orderRef']);

        $buckets = $this->emptyBuckets($from, $to, $bucket);
        $totals  = ['revenue' => 0.0, 'cost' => 0.0, 'profit' => 0.0, 'lines' => 0, 'units' => 0, 'costMissing' => 0];
        $orders  = [];
        // Three ways a sale reaches the books. The screen had two, and labelled the second one
        // Counter while filling it with 'manual' rows - sales typed into the Sales module by hand,
        // which is how the whole imported history came in - so P305k of history read as counter
        // sales, while the counter's own sales ('walk-in') fell through to Online.
        $source  = [
            'online'  => ['revenue' => 0.0, 'orders' => []],
            'counter' => ['revenue' => 0.0, 'orders' => []],
            'manual'  => ['revenue' => 0.0, 'orders' => []],
        ];
        $products = [];
        $cats     = [];

        foreach ($rows as $s) {
            $when = CarbonImmutable::parse($s->saleDate)->setTimezone(self::TZ);
            [$key] = $this->bucketOf($when, $bucket);
            if (!isset($buckets[$key])) continue;   // a week/month bucket that starts before the range
            $rev  = (float) ($s->totalPrice ?? 0);
            $cost = \App\Models\Sale::costOf($s);
            $oid  = self::orderKey($s);

            $b = &$buckets[$key];
            $b['revenue'] += $rev; $b['cost'] += $cost; $b['profit'] += $rev - $cost; $b['lines']++;
            $b['_orders'][$oid] = true;
            unset($b);

            $totals['revenue'] += $rev; $totals['cost'] += $cost; $totals['profit'] += $rev - $cost; $totals['lines']++;
            $totals['units'] += (int) ($s->quantity ?? 0);
            if ($cost <= 0) $totals['costMissing']++;
            $orders[$oid] = true;

            $src = match ((string) ($s->source ?? '')) {
                'walk-in', 'pos', 'counter' => 'counter',
                'manual'                    => 'manual',
                default                     => 'online',
            };
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
                'online'  => ['revenue' => round($source['online']['revenue'], 2),  'orders' => count($source['online']['orders'])],
                'counter' => ['revenue' => round($source['counter']['revenue'], 2), 'orders' => count($source['counter']['orders'])],
                'manual'  => ['revenue' => round($source['manual']['revenue'], 2),  'orders' => count($source['manual']['orders'])],
            ],
            'topProducts' => array_slice(array_map(fn ($p) => array_merge($p, ['revenue' => round($p['revenue'], 2), 'profit' => round($p['profit'], 2)]), $top), 0, 10),
            'byCategory'  => array_map(fn ($c) => array_merge($c, ['revenue' => round($c['revenue'], 2)]), $catList),
        ];
    }
}
