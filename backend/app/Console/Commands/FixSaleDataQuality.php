<?php

namespace App\Console\Commands;

use App\Models\Sale;
use Illuminate\Console\Command;

/**
 * One-time data-quality cleanup for legacy Sale records. Idempotent + re-runnable.
 * DRY-RUN by default; pass --apply to write. Back up the `sales` collection first.
 *
 *   php artisan sales:fix-data-quality            # dry run (counts only)
 *   php artisan sales:fix-data-quality --apply    # write changes
 *
 * Fixes:
 *   1. source = null  ->  "manual"  (the Sale model's default; every current
 *      creation path already sets source, so these are legacy rows only).
 *   2. category "Acessories"  ->  "Accessories"  (hand-entered spelling error).
 */
class FixSaleDataQuality extends Command
{
    protected $signature = 'sales:fix-data-quality {--apply : Persist changes (otherwise dry-run)}';
    protected $description = 'Backfill null Sale.source to "manual" and fix the "Acessories" category typo.';

    public function handle(): int
    {
        $apply = (bool) $this->option('apply');
        $this->info($apply ? 'APPLYING sale data-quality fixes…' : 'DRY RUN (no writes). Use --apply to persist.');

        // 1) Backfill missing source → "manual".
        $nullSource = Sale::whereNull('source')->count();
        if ($apply && $nullSource > 0) {
            Sale::whereNull('source')->update(['source' => 'manual']);
        }

        // 2) Fix the "Acessories" spelling.
        $typo = Sale::where('category', 'Acessories')->count();
        if ($apply && $typo > 0) {
            Sale::where('category', 'Acessories')->update(['category' => 'Accessories']);
        }

        $this->newLine();
        $this->info("source: null → 'manual'                 {$nullSource}");
        $this->info("category: 'Acessories' → 'Accessories'   {$typo}");
        if (!$apply) $this->warn('Dry run only — nothing written. Re-run with --apply after backing up `sales`.');

        return self::SUCCESS;
    }
}
