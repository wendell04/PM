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

        // Saturday is a working day here; Sunday is not. Same rule the original estimate used.
        $add = function (int $days) {
            $d = now();
            while ($days > 0) { $d = $d->addDay(); if (!$d->isSunday()) { $days--; } }
            return $d;
        };

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

        return true;
    }
}
