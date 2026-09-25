<?php

namespace App\Console\Commands;

use App\Models\Inventory;
use App\Support\CostResolver;
use Illuminate\Console\Command;

/**
 * Resets each material's averageCost to what its stock on the shelf actually cost.
 *
 * The stock-in formula valued stock already held at (averageCost ?? 0), so a material created
 * without an average had everything on its shelf counted as free on the next delivery. The Ceramic
 * White mug was bought in two batches, both at P30, and read P20.13. The formula is fixed from
 * 2026-09-26, but a wrong stored average keeps feeding every stock-in after it, so the stored values
 * are put right here - from the batches, the same layers every deduction draws from.
 *
 * Only a material that still has costed stock in its batches is touched; its figure becomes the
 * batch-weighted cost of what remains. Anything else is left exactly as it is.
 *
 *   php artisan inventory:repair-average-cost            # dry run
 *   php artisan inventory:repair-average-cost --apply    # write it
 */
class RepairAverageCost extends Command
{
    protected $signature = 'inventory:repair-average-cost {--apply : Persist the changes (otherwise dry-run)}';
    protected $description = 'Reset averageCost from the batches still on the shelf (the stock-in formula counted held stock as free).';

    public function handle(): int
    {
        $apply = (bool) $this->option('apply');
        $fixed = 0;

        foreach (Inventory::all() as $inv) {
            $hasCostedStock = false;
            foreach ((array) ($inv->batches ?? []) as $b) {
                $b = (array) $b;
                if ((float) ($b['remainingQty'] ?? 0) > 0 && (float) ($b['unitCost'] ?? 0) > 0) { $hasCostedStock = true; break; }
            }
            if (!$hasCostedStock) continue;

            $right = round(CostResolver::materialCost($inv), 4);
            $now   = (float) ($inv->averageCost ?? 0);
            if (abs($right - $now) < 0.01) continue;

            $fixed++;
            $this->line(sprintf('%s  %-34s averageCost %8.2f -> %8.2f   (last paid %s)',
                $apply ? 'FIXING  ' : 'would fix', mb_substr((string) $inv->name, 0, 34), $now, $right,
                var_export($inv->lastUnitCost, true)));

            if ($apply) {
                $inv->averageCost = $right;
                $inv->save();
            }
        }

        $this->newLine();
        $this->info(($apply ? 'Repaired ' : 'Would repair ') . $fixed . ' material(s).');
        if (!$apply) $this->comment('Dry run. Re-run with --apply to write it.');
        return self::SUCCESS;
    }
}
