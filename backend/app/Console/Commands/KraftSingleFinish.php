<?php

namespace App\Console\Commands;

use App\Models\BillOfMaterial;
use App\Models\Inventory;
use App\Models\Product;
use Illuminate\Console\Command;

/**
 * Kraft sticker paper comes in one finish. It was set up as three (Glossy, Matte, Transparent), each
 * with its own material and BOM, on a product that is really one thing. This folds it into one
 * standalone product: one material "Kraft Sticker Paper A4", one BOM, the Glossy prices.
 *
 * Nothing had used the three variants - no order, cart, quote, job order or stock movement - so no
 * history points at what is removed. The two spare materials and BOMs are deleted the way the
 * dashboard deletes them (hidden, not erased). A JSON backup of every record touched is written first.
 */
class KraftSingleFinish extends Command
{
    protected $signature   = 'catalog:kraft-single-finish {--apply : Make the change (without it, only shows what would change)}';
    protected $description = 'Turn Custom Kraft Sticker Paper into one standalone product with one material and one BOM';

    private const PRODUCT   = '6a06b6b8a2e923a8950607a9';
    private const KEEP_INV  = '6a06b6b6a2e923a895060759';
    private const DROP_INV  = ['6a06b6b6a2e923a89506075a', '6a06b6b6a2e923a89506075b'];
    private const KEEP_BOM  = '6a06b6b8a2e923a895060785';
    private const DROP_BOM  = ['6a06b6b8a2e923a895060786', '6a06b6b8a2e923a895060787'];

    public function handle(): int
    {
        $product = Product::find(self::PRODUCT);
        $keepInv = Inventory::find(self::KEEP_INV);
        $keepBom = BillOfMaterial::find(self::KEEP_BOM);
        if (!$product || !$keepInv || !$keepBom) {
            $this->error('The kraft product, material or BOM was not found - nothing changed.');
            return self::FAILURE;
        }

        if (empty($product->combinations) && (string) $product->bomId === self::KEEP_BOM) {
            $this->info('Already a standalone product with one BOM - nothing to do.');
            return self::SUCCESS;
        }

        $tiers = array_map(function ($t) {
            $prices = (array) ($t['prices'] ?? []);
            $base   = $prices['skf-g'] ?? $prices['__base__'] ?? reset($prices);
            return ['minQty' => $t['minQty'], 'maxQty' => $t['maxQty'], 'prices' => ['__base__' => $base], 'id' => $t['id']];
        }, (array) $product->priceTiers);

        $this->line('Product "' . $product->name . '": 3 variants -> standalone, BOM ' . self::KEEP_BOM);
        foreach ($tiers as $t) {
            $this->line('  ' . $t['minQty'] . '-' . ($t['maxQty'] ?? 'up') . ' pcs: P' . $t['prices']['__base__']);
        }
        $this->line('Material "' . $keepInv->name . '" -> "Kraft Sticker Paper A4" (stock stays ' . (int) $keepInv->stockQty . ')');
        foreach (self::DROP_INV as $id) {
            $this->line('Delete material "' . (Inventory::find($id)->name ?? $id) . '"');
        }
        $this->line('BOM "' . $keepBom->productName . '" -> "Custom Kraft Sticker Paper"');
        foreach (self::DROP_BOM as $id) {
            $this->line('Delete BOM "' . (BillOfMaterial::find($id)->productName ?? $id) . '"');
        }

        if (!$this->option('apply')) {
            $this->warn('Preview only. Run again with --apply to make the change.');
            return self::SUCCESS;
        }

        $backup = [
            'product'     => $product->getAttributes(),
            'inventories' => array_map(fn ($id) => optional(Inventory::find($id))->getAttributes(), array_merge([self::KEEP_INV], self::DROP_INV)),
            'boms'        => array_map(fn ($id) => optional(BillOfMaterial::find($id))->getAttributes(), array_merge([self::KEEP_BOM], self::DROP_BOM)),
        ];
        $dir = storage_path('app/backups');
        if (!is_dir($dir)) mkdir($dir, 0775, true);
        $file = $dir . '/kraft-single-finish-' . now()->format('Ymd-His') . '.json';
        file_put_contents($file, json_encode($backup, JSON_PRETTY_PRINT));
        $this->line('Backup: ' . $file);

        $keepInv->name      = 'Kraft Sticker Paper A4';
        $keepInv->sku       = 'STK-KFT';
        $keepInv->updatedAt = now();
        $keepInv->save();

        foreach (self::DROP_INV as $id) {
            if ($inv = Inventory::find($id)) {
                $inv->isActive  = false;
                $inv->deletedAt = now();
                $inv->save();
            }
        }

        $components = (array) $keepBom->components;
        $components[0]['materialName'] = 'Kraft Sticker Paper A4';
        $keepBom->components  = $components;
        $keepBom->productName = 'Custom Kraft Sticker Paper';
        $keepBom->sku         = 'BOM-STK-KFT';
        $keepBom->updatedAt   = now();
        $keepBom->save();

        foreach (self::DROP_BOM as $id) {
            if ($bom = BillOfMaterial::find($id)) {
                $bom->isActive = false;
                $bom->save();
            }
        }

        $product->variantGroups    = [];
        $product->combinations     = [];
        $product->variantImageUrls = [];
        $product->variantPrices    = [];
        $product->bomId            = self::KEEP_BOM;
        $product->priceTiers       = $tiers;
        $product->description      = 'Custom-printed kraft sticker paper, A4. Price per A4 sheet.';
        $product->updatedAt        = now();
        $product->save();

        $this->info('Done. Custom Kraft Sticker Paper is one standalone product. It is still unpublished - add a photo, then publish.');
        return self::SUCCESS;
    }
}
