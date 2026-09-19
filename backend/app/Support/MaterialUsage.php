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
 * Usage comes from the stock ledger, every `deduction` row (production, sales, quotes, scrap) over
 * the last 90 days, or since the material's first movement if it is younger than that - with a
 * floor of 14 days so a material three days old does not report a wild rate off one busy morning.
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
            ->get(['inventoryId', 'type', 'quantity', 'createdAt']);

        foreach ($rows as $r) {
            $id = (string) $r->inventoryId;
            if ($id === '' || !$r->createdAt) continue;
            if (!isset($first[$id]) || $r->createdAt < $first[$id]) $first[$id] = $r->createdAt;
            if ($r->type === 'deduction' && $r->createdAt >= $since) {
                $used[$id] = ($used[$id] ?? 0) + abs((float) $r->quantity);
            }
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
