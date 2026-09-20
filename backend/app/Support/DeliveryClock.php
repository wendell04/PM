<?php

namespace App\Support;

use App\Models\Order;

/**
 * When does the shop owe the customer a date?
 *
 * Not at checkout. A made-to-order job cannot begin until the artwork is settled AND the money
 * asked for up front has arrived, and the customer holds both of those. Counting the promise from
 * checkout hands the shop a deadline the customer can spend and then be late for.
 *
 * Two gates; the clock starts on whichever lands SECOND.
 *
 *   ARTWORK   upload design   the shop approves the file (a technical check)
 *             request design  the customer approves the proof (a creative agreement)
 *   MONEY     paid in full    clear at checkout
 *             50% deposit     clear when the deposit lands
 *
 * The BALANCE is deliberately not a gate. It is due before delivery, not before work - otherwise
 * a customer pays in full for something that does not exist yet.
 */
class DeliveryClock
{
    /** Anything still stopping the bench from starting? */
    public static function unblocked(Order $order): bool
    {
        $design = (string) ($order->designStatus ?? '');
        if ($design !== '' && $design !== 'approved') return false;

        foreach (($order->items ?? []) as $item) {
            $d = (string) ($item['designStatus'] ?? '');
            if ($d !== '' && $d !== 'approved') return false;
        }

        // Collected at the door, so it was never going to hold up the bench.
        if (PaymentMethod::isCod($order->paymentMethod ?? null)) return true;

        $paid = 0.0;
        foreach (($order->paymentHistory ?? []) as $p) $paid += (float) ($p['amount'] ?? 0);
        $paid = max($paid, (float) ($order->downPayment ?? 0));

        return $paid > 0;
    }

    /**
     * Re-count the promise from today. Returns true when it actually moved.
     *
     * Only ever moves the date FORWARD - a customer who approves the same day keeps the date they
     * were given, because pulling it in would be a new promise nobody asked for.
     */
    public static function restart(Order $order, string $because): bool
    {
        $clock = $order->deliveryClock ?? null;
        if (!is_array($clock) || empty($clock['needsProduction'])) return false;
        if (!self::unblocked($order)) return false;

        $lead = (int) ($clock['leadDays'] ?? 0);
        $min  = (int) ($clock['shipMin'] ?? 0);
        $max  = (int) ($clock['shipMax'] ?? 0);
        if ($lead <= 0 && $min <= 0 && $max <= 0) return false;

        // Same working-day rule as the original estimate - Sundays and holidays out,
        // Saturday in - so a re-counted promise cannot disagree with the first one.
        $add = fn (int $days) => WorkingDays::add(now(), $days);

        $newMin = $add($lead + $min);
        $newMax = $add($lead + $max);

        $oldMax = $order->estimatedDeliveryMax ? \Carbon\Carbon::parse($order->estimatedDeliveryMax) : null;
        if ($oldMax && $newMax->lessThanOrEqualTo($oldMax)) return false;

        $order->estimatedDeliveryMin = $newMin->toIso8601String();
        $order->estimatedDeliveryMax = $newMax->toIso8601String();
        $clock['startedAt']        = now()->toIso8601String();
        $clock['restartedBecause'] = $because;
        $order->deliveryClock      = $clock;

        $history   = $order->statusHistory ?? [];
        $history[] = [
            'status' => (string) $order->orderStatus,
            'at'     => now()->toISOString(),
            'by'     => 'system',
            'note'   => 'Delivery estimate re-counted from ' . $because . ': '
                        . $newMin->toDateString() . ' to ' . $newMax->toDateString() . '.',
        ];
        $order->statusHistory = $history;

        self::rescheduleJobOrders($order, $newMax);

        return true;
    }

    /**
     * Move any job order that was scheduled off the old promise.
     *
     * A job schedules backwards: finish before the courier collects, leaving room to QC and pack.
     * When the promise moves and the job does not, the bench works to a deadline that no longer
     * exists - and since the promise only ever moves LATER, the stale target is always an earlier
     * one. A queue full of false urgency is a queue where real urgency stops being believed.
     *
     * Anything already finished is left alone; its date is a record of what was asked at the time.
     */
    private static function rescheduleJobOrders(Order $order, \Carbon\Carbon $newMax): void
    {
        try {
            $clock   = $order->deliveryClock ?? [];
            $transit = (int) ($clock['shipMax'] ?? 2);
            $qcPack  = 1;   // QC and packing slack before hand-off
            $target  = WorkingDays::subtract($newMax, $transit + $qcPack);

            $jobs = \App\Models\JobOrder::where('orderId', (string) $order->_id)->get();
            foreach ($jobs as $jo) {
                if (in_array($jo->joStatus, ['QC_Passed', 'Completed', 'Cancelled'], true)) continue;
                $jo->targetCompletion = $target->toDateString();
                $jo->updatedAt        = now();
                $jo->save();
            }
        } catch (\Throwable $e) {
            // A rescheduling failure must never take the approval down with it.
            \Illuminate\Support\Facades\Log::warning('DeliveryClock: could not reschedule job orders', [
                'orderId' => (string) $order->_id,
                'error'   => $e->getMessage(),
            ]);
        }
    }
}
