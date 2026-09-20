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
    /**
     * The promise for a new order, from what is in it and where it is going.
     *
     * Both order-creation paths call this - the COD/unpaid one in OrderController and the paid
     * one in PaymentController. They used to each have their own copy, and the paid one (which
     * is nearly every real order) counted Sundays only, used the national transit pair for every
     * province, charged the production lead to a cart of shelf goods, and never stored the clock
     * that lets the promise be re-counted at approval.
     *
     * @param array       $orderItems   the built order lines (reads isCustom / isMadeToOrder)
     * @param string|null $province     from the delivery address, for the transit zone
     * @param bool        $rushWanted   what the customer ticked; only honoured if there is a queue to jump
     * @return array{
     *   needsProduction: bool, isRush: bool, rushFee: float, leadDays: int,
     *   shipMin: int, shipMax: int, zone: string,
     *   estimatedDeliveryMin: string, estimatedDeliveryMax: string, deliveryClock: array
     * }
     */
    public static function plan(array $orderItems, ?string $province, bool $rushWanted): array
    {
        $owner    = ShopSettings::owner();
        $prodLead = (int)   ($owner->productionLeadDays ?? 3);
        $rushOn   = (bool)  ($owner->rushEnabled        ?? true);
        $rushLead = (int)   ($owner->rushLeadDays       ?? 1);
        // 150 to match SettingsController and the public settings endpoint. A different
        // fallback here billed a fee the customer was never shown.
        $rushFee  = (float) ($owner->rushFee            ?? 150);

        // Transit depends on where it is going. The flat pair remains the fallback when there is
        // no address to read - a pickup, or a legacy request with none.
        $province = is_string($province) ? trim($province) : null;
        $zone     = ShippingZones::transitFor($province ?: null);
        $shipMin  = $province ? $zone['min'] : (int) ($owner->shippingDaysMin ?? 1);
        $shipMax  = $province ? $zone['max'] : (int) ($owner->shippingDaysMax ?? 2);

        // Does anything on this order actually have to be MADE? A cart of stocked goods needs
        // picking and shipping, nothing more - charging it the production lead promised eleven
        // days for a bag already on the shelf.
        $needsProduction = collect($orderItems)->contains(
            fn ($oi) => !empty($oi['isCustom']) || !empty($oi['isMadeToOrder'])
        );

        // Rush buys priority in the production queue. With nothing to produce there is no queue
        // to jump, so it is neither offered nor charged.
        $isRush   = $needsProduction && $rushOn && $rushWanted;
        $leadDays = !$needsProduction ? 0 : ($isRush ? $rushLead : $prodLead);

        $min = WorkingDays::add(now(), $leadDays + $shipMin);
        $max = WorkingDays::add(now(), $leadDays + $shipMax);

        return [
            'needsProduction'      => $needsProduction,
            'isRush'               => $isRush,
            'rushFee'              => $isRush ? $rushFee : 0.0,
            'leadDays'             => $leadDays,
            'shipMin'              => $shipMin,
            'shipMax'              => $shipMax,
            'zone'                 => $zone['zone'],
            'estimatedDeliveryMin' => $min->toIso8601String(),
            'estimatedDeliveryMax' => $max->toIso8601String(),
            // Kept so the promise can be REMADE later. A custom order cannot start until the
            // artwork is settled and the money asked for has landed, and the customer holds both;
            // a date counted from checkout is a promise the shop cannot keep and did not break.
            'deliveryClock'        => [
                'leadDays'        => $leadDays,
                'shipMin'         => $shipMin,
                'shipMax'         => $shipMax,
                'needsProduction' => $needsProduction,
                'startedAt'       => now()->toIso8601String(),
            ],
        ];
    }

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
