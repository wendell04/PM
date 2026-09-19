<?php

namespace App\Console\Commands;

use App\Models\Inventory;
use App\Models\StockHistory;
use Illuminate\Console\Command;

/**
 * php artisan inventory:seed-minimums [--apply]
 *
 * First real minimums for every material. Each one was born at 10 (the model default) because
 * the owner had nothing to base a number on when he stocked the shop. This replaces the 10s
 * with the larger of two things:
 *
 *  - usage-based: daily usage x lead time + buffer, from the stock ledger (the same formula as
 *    the Suggest minimums review), which is honest but thin after three weeks of trading;
 *  - a category floor: what a small print shop keeps on the shelf regardless of history, so a
 *    quiet material is not left at 2 and a box supplier's 7-day lead does not stall an order.
 *
 * Packaging and consumables get a floor too: bought per order they may be, but a minimum is
 * what keeps a mug from waiting a week for its box. Dry run by default; --apply writes.
 */
class SeedMinimums extends Command
{
    protected $signature   = 'inventory:seed-minimums {--apply : Write the minimums}';
    protected $description = 'Set a first sensible minimum on every material (usage-based, with a per-category floor)';

    private const FLOORS = [
        'Mugs'              => 20,
        'Apparel'           => 5,
        'Bags'              => 10,
        'Stickers & Labels' => 20,
        'Souvenirs'         => 20,
        'Button Badges'     => 20,
        'Mousepads'         => 10,
        'Accessories'       => 20,
        'Consumables'       => 30,
        'Packaging'         => 30,
    ];

    public function handle(): int
    {
        $since = now()->subDays(90);
        $used = []; $first = [];
        foreach (StockHistory::where('createdAt', '>=', now()->subDays(400))->get(['inventoryId', 'type', 'quantity', 'createdAt']) as $r) {
            $id = (string) $r->inventoryId;
            if ($id === '' || !$r->createdAt) continue;
            if (!isset($first[$id]) || $r->createdAt < $first[$id]) $first[$id] = $r->createdAt;
            if ($r->type === 'deduction' && $r->createdAt >= $since) $used[$id] = ($used[$id] ?? 0) + abs((float) $r->quantity);
        }

        $apply = (bool) $this->option('apply');
        $changed = 0;
        $this->line(sprintf('%-36s %-18s %4s %6s %5s %5s  %s', 'material', 'category', 'now', 'use/d', 'lead', 'new', 'basis'));
        foreach (Inventory::where('isActive', '!=', false)->orderBy('category')->orderBy('name')->get() as $inv) {
            $id   = (string) $inv->_id;
            $seen = $first[$id] ?? null;
            $days = $seen ? max(14, min(90, (int) ceil($seen->diffInDays(now())) ?: 1)) : 90;
            $avg  = ($used[$id] ?? 0) / $days;
            $lead = (int) ($inv->leadTimeDays ?? 0) ?: 7;
            $usageBased = $avg > 0 ? (int) ceil($avg * $lead + max($avg * 2, $avg * $lead * 0.5)) : 0;
            $floor = self::FLOORS[$inv->category] ?? 10;
            $now = (int) ($inv->minStockLevel ?? 0);
            // A minimum the owner moved off the default is his decision: it can only go UP, and
            // only when usage says so. The floor applies to materials still at the default 10.
            // Only ever UP. A minimum the owner raised is his call; one still at the default 10
            // rises to the category floor or to what usage says, whichever is larger. Nothing is
            // lowered by a script - a lower minimum is a decision to make while looking at the shelf.
            $candidate = $now !== 10 && $now > 0 ? $usageBased : max($usageBased, $floor);
            $new = max($now, $candidate);
            $basis = $new === $now ? 'kept' : ($usageBased >= $floor && $usageBased === $new ? "usage {$usageBased}" : "floor for {$inv->category}");
            $mark = $now === $new ? ' ' : '*';
            $this->line(sprintf('%s%-35s %-18s %4d %6.2f %5d %5d  %s', $mark, mb_substr($inv->name, 0, 35), mb_substr((string) $inv->category, 0, 18), $now, $avg, $lead, $new, $basis));
            if ($now !== $new) {
                $changed++;
                if ($apply) { $inv->minStockLevel = $new; $inv->save(); }
            }
        }
        $this->info(($apply ? 'Written: ' : 'Would change: ') . $changed . ' material(s). * = changed.');
        if (!$apply) $this->line('Dry run. Re-run with --apply to write.');
        return self::SUCCESS;
    }
}
