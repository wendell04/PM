<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use App\Models\Inventory;

class BackfillBaseCost extends Command
{
    protected $signature   = 'inventory:backfill-base-cost';
    protected $description = 'Backfill baseCost from averageCost for inventory documents missing it';

    public function handle(): int
    {
        $items = Inventory::whereNull('baseCost')
            ->orWhere('baseCost', 0)
            ->get();

        if ($items->isEmpty()) {
            $this->info('No items need backfilling.');
            return 0;
        }

        $updated = 0;
        $skipped = 0;

        foreach ($items as $item) {
            $fallback = $item->averageCost ?? $item->lastUnitCost ?? 0;

            if ($fallback <= 0) {
                $this->warn("Skipped [{$item->_id}] {$item->name} — no cost source available.");
                $skipped++;
                continue;
            }

            $item->baseCost = $fallback;
            $item->save();

            $this->line("Updated [{$item->_id}] {$item->name} → baseCost = {$fallback}");
            $updated++;
        }

        $this->info("Done. Updated: {$updated}, Skipped: {$skipped}.");
        return 0;
    }
}

