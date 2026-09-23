<?php

namespace App\Support;

use App\Models\StockHistory;

/**
 * How fast a material actually leaves the shelf, and therefore how long what is left will last.
 *
 * "Days of cover" is the number the shop was missing. Everything the system said about stock was
 * present-tense - on hand, held, below minimum - and none of it answered the only question the
 * owner asks in front of a shelf: is this going to run out before the next delivery?
 *
 *     cover = free stock / usage per day
 *
 * Usage comes from the stock ledger over the last 90 days, or since the material's first movement
 * if it is younger than that - with a floor of 14 days so a material three days old does not
 * report a wild rate off one busy morning.
 *
 * Only deductions that were actually consumed count: production always, and a sale's hold when the
 * order stood. Scrap, damage and holds against cancelled orders are excluded - the last of those
 * comes back on the shelf as its own addition row, so counting it made stock look like it was
 * emptying faster than it is. The rule lives in MaterialDemand::countsAsConsumption, shared so
 * this figure and the forecast's demand cannot disagree about what left the shelf.
 *
 * Deliberately NOT a forecast. This is what has happened, divided by the days it happened over.
 * A forecast belongs in the SSA service, and when it lands it replaces the rate here, not the
 * arithmetic around it.
 */
class MaterialUsage
{
    /** Days of ledger to read. */
    private const WINDOW = 90;

    /** Shortest window we will divide by, so a new material does not report a wild rate. */
    private const MIN_DAYS = 14;

    /**
     * Usage per day and first-seen date for every material, in one pass over the ledger.
     *
     * @return array<string, array{perDay: float, days: int, used: float}>
     */
    public static function perDay(): array
    {
        $since = now()->subDays(self::WINDOW);
        $used  = [];
        $first = [];

        $rows = StockHistory::where('createdAt', '>=', now()->subDays(400))
            ->get(['inventoryId', 'type', 'quantity', 'createdAt', 'reason', 'orderId']);

        // Not every deduction is usage. Scrap and damage are shrinkage, and a
        // hold placed against an order that was then cancelled comes straight
        // back as an addition row - counting it made the shelf look like it was
        // emptying faster than it is. On the current ledger that was 56 of 500
        // units, an eleven per cent over-statement of every days-of-cover
        // figure on the To Buy screen. Same rule the forecast uses.
        $statusByOrder = self::orderStatuses($rows);

        foreach ($rows as $r) {
            $id = (string) $r->inventoryId;
            if ($id === '' || !$r->createdAt) continue;
            if (!isset($first[$id]) || $r->createdAt < $first[$id]) $first[$id] = $r->createdAt;
            if ($r->type !== 'deduction' || $r->createdAt < $since) continue;

            $oid = (string) ($r->orderId ?? '');
            if (! MaterialDemand::countsAsConsumption($r->reason ?? null, $oid !== '' ? ($statusByOrder[$oid] ?? null) : null)) {
                continue;
            }
            $used[$id] = ($used[$id] ?? 0) + abs((float) $r->quantity);
        }

        $out = [];
        foreach ($first as $id => $seen) {
            $days = max(self::MIN_DAYS, min(self::WINDOW, (int) ceil($seen->diffInDays(now())) ?: 1));
            $qty  = (float) ($used[$id] ?? 0);
            $out[$id] = [
                'perDay' => $qty > 0 ? round($qty / $days, 4) : 0.0,
                'days'   => $days,
                'used'   => $qty,
            ];
        }

        return $out;
    }

    /**
     * Normalised status for every order the given ledger rows point at, in one
     * query. Returns an empty map when there are no order ids to look up.
     *
     * @param  iterable  $rows  stock-history rows carrying an orderId
     * @return array<string, string>
     */
    private static function orderStatuses(iterable $rows): array
    {
        $ids = [];
        foreach ($rows as $r) {
            $oid = (string) ($r->orderId ?? '');
            if ($oid !== '') {
                $ids[$oid] = true;
            }
        }
        if (! $ids) {
            return [];
        }

        $objectIds = [];
        foreach (array_keys($ids) as $oid) {
            try { $objectIds[] = new \MongoDB\BSON\ObjectId($oid); } catch (\Throwable $e) {}
        }
        if (! $objectIds) {
            return [];
        }

        $out = [];
        foreach (\App\Models\Order::whereIn('_id', $objectIds)->get(['_id', 'orderStatus']) as $o) {
            $out[(string) $o->_id] = (string) OrderStatus::normalize($o->orderStatus);
        }

        return $out;
    }

    /**
     * The cover figures for one material, ready to attach to an API row.
     *
     * `daysOfCover` is null when nothing has been used yet - that is "we cannot say", which is a
     * different answer from "it will last forever" and must not be drawn as a comfortable number.
     *
     * @param  array{perDay: float, days: int, used: float}|null  $usage
     * @return array{usagePerDay: float|null, daysOfCover: int|null, coverBasisDays: int|null, runsOutOn: string|null, urgency: string}
     */
    public static function coverFor(int $free, ?array $usage, ?int $leadTimeDays = null): array
    {
        $perDay = $usage['perDay'] ?? 0.0;

        // An empty shelf is urgent whether or not the ledger has ever seen this material move.
        // Without this, a material sitting at 0 with no usage history read "no usage yet" and
        // sorted BELOW everything with a number - the emptiest row, last on the list.
        if ($free <= 0) {
            return [
                'usagePerDay'    => $perDay > 0 ? $perDay : ($usage ? 0.0 : null),
                'daysOfCover'    => 0,
                'coverBasisDays' => $usage['days'] ?? null,
                'runsOutOn'      => now()->toDateString(),
                'urgency'        => 'out',
            ];
        }

        if ($perDay <= 0) {
            return [
                'usagePerDay'    => $usage ? 0.0 : null,
                'daysOfCover'    => null,
                'coverBasisDays' => $usage['days'] ?? null,
                'runsOutOn'      => null,
                'urgency'        => 'unknown',
            ];
        }

        $days = (int) floor($free / $perDay);
        $lead = $leadTimeDays && $leadTimeDays > 0 ? $leadTimeDays : null;

        // Urgency is measured against the WAIT, not against a round number of days. Seven days of
        // cover is comfortable for a same-day supplier and already late for a two-week one.
        $wait = $lead ?? 7;
        $urgency = match (true) {
            $days <= 0        => 'out',
            $days <  $wait    => 'critical',   // it runs out before a new order could arrive
            $days <  $wait * 2 => 'soon',      // order on the next buying trip
            default           => 'ok',
        };

        return [
            'usagePerDay'    => $perDay,
            'daysOfCover'    => $days,
            'coverBasisDays' => $usage['days'] ?? null,
            'runsOutOn'      => now()->addDays($days)->toDateString(),
            'urgency'        => $urgency,
        ];
    }
}
