<?php

namespace App\Console\Commands;

use App\Models\Product;
use Illuminate\Console\Command;

/**
 * Give tiered products an "Ask for a quote above" ceiling.
 *
 * A tier list that ends "501 and above" sells a run of any size at the last price - five thousand
 * mugs at the 501-piece rate. Past a point the materials, the machine time and often a subcontractor
 * are different, so that band is quoted instead. This sets the ceiling on every tiered product whose
 * last tier is open-ended and that has no ceiling yet. A product the owner already set is left alone,
 * and so is one whose tiers stop at a number (the owner chose where the list ends).
 */
class SetQuoteAbove extends Command
{
    /** The ceiling used when none is given: the 501+ band runs to 1000, then it is quoted. */
    public const DEFAULT_QTY = 1000;

    protected $signature   = 'catalog:set-quote-above {qty=' . self::DEFAULT_QTY . ' : Pieces above which a quote is required} {--apply : Make the change (without it, only shows what would change)}';
    protected $description = 'Set "Ask for a quote above" on tiered products whose last price tier is open-ended';

    public function handle(): int
    {
        $qty = (int) $this->argument('qty');
        if ($qty < 1) {
            $this->error('The quantity must be at least 1.');
            return self::FAILURE;
        }

        $changes = [];
        foreach (Product::where('priceType', 'tiered')->get() as $product) {
            $name = $product->name ?? (string) $product->_id;
            if ((int) ($product->quoteAboveQty ?? 0) > 0) {
                $this->line("Keep  {$name} - already quotes above {$product->quoteAboveQty}");
                continue;
            }
            $last = collect($product->priceTiers ?? [])->sortBy(fn ($t) => (int) ($t['minQty'] ?? 0))->last();
            if (!$last) {
                $this->line("Skip  {$name} - no price tiers");
                continue;
            }
            if (($last['maxQty'] ?? null) !== null && $last['maxQty'] !== '') {
                $this->line("Skip  {$name} - the tiers already end at {$last['maxQty']}");
                continue;
            }
            if ((int) ($last['minQty'] ?? 0) > $qty) {
                // A ceiling below where the last tier starts would hide a price the owner set.
                $this->line("Skip  {$name} - its last tier starts at {$last['minQty']}, above {$qty}");
                continue;
            }
            $this->line("Set   {$name} - {$last['minQty']}-{$qty} pcs at the last price, quote above {$qty}");
            $changes[] = $product;
        }

        if (!$changes) {
            $this->info('Nothing to change.');
            return self::SUCCESS;
        }
        if (!$this->option('apply')) {
            $this->warn(count($changes) . ' product(s) would change. Run again with --apply to make the change.');
            return self::SUCCESS;
        }

        foreach ($changes as $product) {
            $product->quoteAboveQty = $qty;
            $product->updatedAt     = now();
            $product->save();
        }
        $this->info('Done: ' . count($changes) . ' product(s) now ask for a quote above ' . $qty . ' pcs. Clear the field on a product to undo it there.');
        return self::SUCCESS;
    }
}
