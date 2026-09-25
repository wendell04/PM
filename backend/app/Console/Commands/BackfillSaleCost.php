<?php

namespace App\Console\Commands;

use App\Models\Product;
use App\Models\Sale;
use App\Support\CostResolver;
use Illuminate\Console\Command;

/**
 * Fills in the cost on completed sales that were recorded with none.
 *
 * Until 2026-09-26 the cost of a sale was worked out without the variant that was sold, so a
 * product whose materials live on its variants - every custom mug, tote and sticker - was recorded
 * at cost 0 and reported as 100% profit. Reports read that straight: 28 of 31 completed sales in
 * ninety days had no cost, overstating gross profit by the whole cost of the goods.
 *
 * For each such row this finds the product (by id, or by name for rows written before sales carried
 * one - "Custom Mug 11oz (Ceramic White)" is the product and the variant), costs it the way new sales
 * are costed now, and sets cost and profit. It never touches a row that already has a cost, and it
 * leaves alone any row it cannot place with certainty - a guessed cost is worse than a missing one.
 *
 * The cost is today's material cost, not the cost on the day of the sale - the only record of that
 * day is the row itself, which says 0. The report still flags rows it could not fill.
 *
 *   php artisan sales:backfill-cost            # dry run: what it would change, and the totals
 *   php artisan sales:backfill-cost --apply    # write it
 */
class BackfillSaleCost extends Command
{
    protected $signature = 'sales:backfill-cost {--apply : Persist the changes (otherwise dry-run)}';
    protected $description = 'Cost the completed sales that were recorded at cost 0 (variant BOMs were never looked up).';

    public function handle(): int
    {
        $apply = (bool) $this->option('apply');
        $rows  = Sale::where('status', 'completed')
            ->where(function ($q) { $q->whereNull('cost')->orWhere('cost', '<=', 0); })
            ->get();

        $byName  = [];                 // product name -> Product, looked up once
        $fixed   = 0;
        $skipped = [];
        $revenue = 0.0;
        $added   = 0.0;

        foreach ($rows as $s) {
            [$product, $variantId, $why] = $this->place($s, $byName);
            if (!$product) { $skipped[$why] = ($skipped[$why] ?? 0) + 1; continue; }

            $qty  = (int) ($s->quantity ?? 0);
            $cost = CostResolver::lineCost($product, $qty, $variantId);
            if ($cost <= 0) { $skipped['no cost source on the product'] = ($skipped['no cost source on the product'] ?? 0) + 1; continue; }

            $rev = (float) ($s->totalPrice ?? 0);
            $fixed++;
            $revenue += $rev;
            $added   += $cost;
            $this->line(sprintf('%s  %-44s x%-4d sold %9.2f  cost %8.2f  profit %9.2f -> %9.2f',
                $apply ? 'FIXING  ' : 'would fix',
                mb_substr((string) $s->productName, 0, 44), $qty, $rev, $cost, $rev, $rev - $cost));

            if ($apply) {
                $s->cost   = $cost;
                $s->profit = round($rev - $cost, 2);
                $s->costBackfilledAt = now();
                $s->save();
            }
        }

        $this->newLine();
        $this->info(($apply ? 'Costed ' : 'Would cost ') . "$fixed of {$rows->count()} sales.");
        if ($fixed) {
            $this->info(sprintf('Revenue on those lines %.2f; cost added %.2f; their profit %.2f -> %.2f.',
                $revenue, $added, $revenue, $revenue - $added));
        }
        foreach ($skipped as $why => $n) $this->line("  left alone: $n ($why)");
        if (!$apply) $this->comment('Dry run. Re-run with --apply to write it. Back up the sales collection first.');
        return self::SUCCESS;
    }

    /** @return array{0:?Product,1:?string,2:string} the product, the variant id, and why not */
    private function place(Sale $s, array &$byName): array
    {
        if ($s->productId) {
            $p = Product::find($s->productId);
            if ($p) {
                $variantId = $s->variantId ?: CostResolver::variantIdByName($p, $s->variantName);
                return [$p, $variantId, ''];
            }
        }

        // "Custom Mug 11oz (Ceramic White)" - the product, and the variant in the last brackets.
        $full = trim((string) $s->productName);
        if ($full === '') return [null, null, 'no product name'];
        $base = $full; $variantName = null;
        if (preg_match('/^(.*)\s\(([^()]*(?:\([^()]*\)[^()]*)*)\)$/u', $full, $m)) {
            $base = trim($m[1]); $variantName = trim($m[2]);
        }
        if (!array_key_exists($base, $byName)) {
            $matches = Product::where('name', $base)->get();
            $byName[$base] = $matches->count() === 1 ? $matches->first() : null;   // two with one name: not certain
        }
        $p = $byName[$base];
        if (!$p) return [null, null, 'no single product by that name'];

        $variantId = CostResolver::variantIdByName($p, $variantName);
        if ($variantName !== null && !$variantId && !empty($p->combinations)) {
            return [null, null, 'variant name not on the product'];
        }
        return [$p, $variantId, ''];
    }
}
