<?php

namespace App\Http\Controllers;

use App\Models\Order;
use Carbon\Carbon;
use Illuminate\Http\Request;

/**
 * GET /api/admin/home/money?months=6
 *
 * Home's money figures - collected this month, still owed, and cash in per month - worked out over
 * EVERY order, here. Home used to add them up in the browser from the latest 300 orders it happened
 * to have, so any month older than those 300 read low, and the page waited for all of them to load.
 *
 * The ledger rules are the ones Home used, with three corrections:
 *   - a voided line and its minus line are both left out (the money never came in);
 *   - a payment typed in by hand is dated when it was recorded, not when the order was placed;
 *   - an order archived before it was delivered is not "still owed" - nobody is chasing it.
 */
class HomeMoneyController extends Controller
{
    public function show(Request $request)
    {
        try {
            if (!$this->hasAnyPermission($request, ['sales.view', 'reports.view', 'payments.view'])) {
                return $this->unauthorizedResponse();
            }
            $months = min(24, max(1, (int) $request->query('months', 6)));
            $tz     = 'Asia/Manila';
            $now    = Carbon::now($tz);
            $monthStart = $now->copy()->startOfMonth();

            $buckets = [];
            for ($i = $months - 1; $i >= 0; $i--) {
                $d = $now->copy()->startOfMonth()->subMonthsNoOverflow($i);
                $buckets[$d->format('Y-m')] = ['key' => $d->format('Y-m'), 'total' => 0.0, 'count' => 0];
            }

            $collected = 0.0;
            $today = 0.0;
            $dayStart = $now->copy()->startOfDay();
            $outstanding = 0.0;
            $status = fn ($o) => strtolower(str_replace([' ', '-'], '_', (string) ($o->orderStatus ?? '')));

            Order::select(['orderStatus', 'paymentHistory', 'downPayment', 'totalAmount', 'createdAt', 'isArchived'])
                ->chunk(500, function ($orders) use (&$buckets, &$collected, &$today, &$outstanding, $status, $tz, $monthStart, $dayStart) {
                    foreach ($orders as $o) {
                        $st = $status($o);
                        $history = is_array($o->paymentHistory) ? $o->paymentHistory : [];

                        if ($st !== 'cancelled') {
                            $ledger = [];
                            if ($history) {
                                foreach ($history as $p) {
                                    $p = (array) $p;
                                    $amt = (float) ($p['amount'] ?? 0);
                                    if ($amt <= 0 || !empty($p['voided']) || ($p['type'] ?? null) === 'void') continue;
                                    $when = $p['paidAt'] ?? $p['recordedAt'] ?? $p['createdAt'] ?? $o->createdAt ?? null;
                                    if ($when) $ledger[] = [$amt, $when];
                                }
                            } elseif ((float) ($o->downPayment ?? 0) > 0 && $o->createdAt) {
                                $ledger[] = [(float) $o->downPayment, $o->createdAt];
                            }
                            foreach ($ledger as [$amt, $when]) {
                                try { $at = Carbon::parse($when)->setTimezone($tz); } catch (\Throwable $e) { continue; }
                                if ($at->gte($monthStart)) $collected += $amt;
                                if ($at->gte($dayStart)) $today += $amt;
                                $k = $at->format('Y-m');
                                if (isset($buckets[$k])) { $buckets[$k]['total'] += $amt; $buckets[$k]['count']++; }
                            }
                        }

                        // Owed: not cancelled or returned, and not abandoned (archived unfinished).
                        $delivered = in_array($st, ['delivered', 'completed'], true);
                        if (in_array($st, ['cancelled', 'returned'], true)) continue;
                        if (!empty($o->isArchived) && !$delivered) continue;
                        $paid = max((float) ($o->downPayment ?? 0),
                            array_sum(array_map(fn ($p) => (float) (((array) $p)['amount'] ?? 0), $history)));
                        $outstanding += max(0, (float) ($o->totalAmount ?? 0) - $paid);
                    }
                });

            return $this->successResponse('Home money fetched.', [
                'collectedThisMonth' => round($collected, 2),
                'collectedToday'     => round($today, 2),
                'outstanding'        => round($outstanding, 2),
                'months'             => array_values(array_map(fn ($b) => [
                    'key' => $b['key'], 'total' => round($b['total'], 2), 'count' => $b['count'],
                ], $buckets)),
            ]);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'Failed to work out the money figures.');
        }
    }
}
