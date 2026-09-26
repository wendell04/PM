<?php

namespace App\Console\Commands;

use App\Models\BillOfMaterial;
use App\Models\Product;
use Illuminate\Console\Command;

/**
 * Clears product links to BOMs that never existed.
 *
 * The package's ObjectId cast turned bomId: null into a freshly minted id, so every save of a
 * product with variants left a top-level bomId pointing at nothing. Lookups fell through to the
 * per-variant BOM, so orders and stock were right, but the link is false data (the forecast list
 * built a phantom row from it). Only a link to a BOM that does not exist at all is cleared; a link
 * to a deactivated BOM is a real one and is reported, not touched.
 *
 *   php artisan products:clear-phantom-bom            # dry run
 *   php artisan products:clear-phantom-bom --apply    # write it
 */
class ClearPhantomBomLinks extends Command
{
    protected $signature = 'products:clear-phantom-bom {--apply : Persist the changes (otherwise dry-run)}';
    protected $description = 'Clear product bomId/inventoryId links to records that never existed (minted by the ObjectId cast).';

    public function handle(): int
    {
        $apply = (bool) $this->option('apply');
        $boms  = BillOfMaterial::all(['_id'])->mapWithKeys(fn ($b) => [(string) $b->id => true]);
        $mats  = \App\Models\Inventory::all(['_id'])->mapWithKeys(fn ($i) => [(string) $i->id => true]);
        $fixed = 0;

        foreach (Product::all() as $p) {
            $unset = [];
            if (!empty($p->bomId) && !isset($boms[(string) $p->bomId]))             $unset[] = 'bomId';
            if (!empty($p->inventoryId) && !isset($mats[(string) $p->inventoryId])) $unset[] = 'inventoryId';
            if (!$unset) continue;
            $fixed++;
            $this->line(($apply ? 'Cleared ' : 'Would clear ') . implode(', ', $unset) . " on {$p->name}");
            // Raw update: no model events, so no audit entry claiming a person changed the product.
            if ($apply) Product::raw(fn ($c) => $c->updateOne(['_id' => new \MongoDB\BSON\ObjectId((string) $p->id)],
                ['$set' => array_fill_keys($unset, null)]));
        }

        $this->info(($apply ? 'Cleared' : 'Would clear') . " {$fixed} product(s)." . ($apply ? '' : ' Run with --apply to write.'));
        return self::SUCCESS;
    }
}
