<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use App\Models\Supplier;
use App\Models\Inventory;
use App\Models\BillOfMaterial;
use App\Models\Product;
use App\Models\Collection;
use App\Models\Masterlist;
use App\Models\Order;
use App\Models\JobOrder;
use App\Models\Cart;
use App\Models\InventoryReturn;
use App\Models\StockHistory;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cache;

class RealDataSeeder extends Seeder
{
    public function run(): void
    {
        $now = Carbon::now();

        // ── WIPE ─────────────────────────────────────────────────────────────
        $this->command->info('Wiping old data...');
        Order::truncate();
        JobOrder::truncate();
        Cart::truncate();
        InventoryReturn::truncate();
        StockHistory::truncate();
        Product::truncate();
        Collection::truncate();
        BillOfMaterial::truncate();
        Inventory::truncate();
        Supplier::truncate();
        Cache::flush();

        // ── MASTERLIST ────────────────────────────────────────────────────────
        $this->command->info('Updating masterlist categories...');
        $categories = [
            ['id' => 'cat_mugs',        'name' => 'Mugs',              'products' => []],
            ['id' => 'cat_bags',        'name' => 'Bags',              'products' => []],
            ['id' => 'cat_mousepads',   'name' => 'Mousepads',         'products' => []],
            ['id' => 'cat_badges',      'name' => 'Button Badges',     'products' => []],
            ['id' => 'cat_souvenirs',   'name' => 'Souvenirs',         'products' => []],
            ['id' => 'cat_stickers',    'name' => 'Stickers & Labels', 'products' => []],
            ['id' => 'cat_printing',    'name' => 'Printing Services', 'products' => []],
            ['id' => 'cat_accessories', 'name' => 'Accessories',       'products' => []],
            ['id' => 'cat_consumables', 'name' => 'Consumables',       'products' => []],
        ];
        // Use raw query builder to bypass the array cast issue on this model
        $mlTable = \Illuminate\Support\Facades\DB::connection('mongodb')->table('masterlist');
        $mlTable->truncate();
        $mlTable->insert(['categories' => $categories, 'updatedAt' => $now->toISOString()]);

        // ── SUPPLIERS ─────────────────────────────────────────────────────────
        $this->command->info('Seeding suppliers...');

        $sup1 = Supplier::create([
            'name' => 'Blanks & Beyond Supply', 'contactPerson' => 'Maria Santos',
            'phone' => '09171234567', 'email' => 'blanks.beyond@email.com',
            'address' => 'Divisoria, Manila',
            'notes' => 'Sublimation blanks: mugs, mousepads, coasters, mirrors, keychains, ref magnets, bookmarks',
            'itemsSupplied' => ['Drinkware', 'Mousepads', 'Souvenirs', 'Packaging'],
            'isActive' => true, 'createdAt' => $now, 'updatedAt' => $now,
        ]);

        $sup2 = Supplier::create([
            'name' => 'Vinyl & Media Solutions PH', 'contactPerson' => 'Jose Reyes',
            'phone' => '09189876543', 'email' => 'vinylmedia.ph@email.com',
            'address' => 'Quiapo, Manila',
            'notes' => 'Vinyl/sticker sheets, sublimation transfer paper, sublimation inks',
            'itemsSupplied' => ['Print Materials', 'Stickers & Labels', 'Consumables'],
            'isActive' => true, 'createdAt' => $now, 'updatedAt' => $now,
        ]);

        $sup3 = Supplier::create([
            'name' => 'Badge & Bags Supply PH', 'contactPerson' => 'Ana Cruz',
            'phone' => '09201122334', 'email' => 'badgebags.ph@email.com',
            'address' => 'Cubao, Quezon City',
            'notes' => 'Button badges, canvas totebags, scrunchies',
            'itemsSupplied' => ['Button Badges', 'Bags', 'Accessories'],
            'isActive' => true, 'createdAt' => $now, 'updatedAt' => $now,
        ]);

        // ── INVENTORY MATERIALS ───────────────────────────────────────────────
        $this->command->info('Seeding inventory materials...');

        $mat = function (array $d) use ($now, &$sup1, &$sup2, &$sup3) {
            $supId   = (string) $d['sup']->_id;
            $supName = $d['sup']->name;
            $batchId = 'BATCH-' . strtoupper(substr(md5($d['sku']), 0, 8));
            return Inventory::create([
                'name'          => $d['name'],
                'sku'           => $d['sku'],
                'uom'           => $d['uom'],
                'category'      => $d['cat'],
                'stockQty'      => $d['qty'],
                'minStockLevel' => $d['min'],
                'isOnDemand'    => false,
                'isActive'      => true,
                'supplierId'    => $supId,
                'supplierName'  => $supName,
                'lastUnitCost'  => $d['cost'],
                'baseCost'      => $d['cost'],
                'reservedQty'   => 0,
                'consumedQty'   => 0,
                'badOrderQty'   => 0,
                'batches'       => [[
                    'batchId'       => $batchId,
                    'invoiceNumber' => 'INV-2026-INIT-' . $d['sku'],
                    'dateReceived'  => '2026-05-15T00:00:00.000Z',
                    'supplierId'    => $supId,
                    'vendorName'    => $supName,
                    'goodQty'       => $d['qty'],
                    'unitCost'      => $d['cost'],
                    'remainingQty'  => $d['qty'],
                    'notes'         => 'Initial stock',
                ]],
                'createdAt' => $now,
                'updatedAt' => $now,
            ]);
        };

        // Mugs
        $mMugW  = $mat(['name'=>'Ceramic White Mug 11oz',      'sku'=>'MUG-CW-11',    'uom'=>'pcs',   'cat'=>'Mugs',              'qty'=>100, 'cost'=>30.00, 'min'=>20, 'sup'=>$sup1]);
        $mMugI  = $mat(['name'=>'Inner Color Mug 11oz',        'sku'=>'MUG-IC-11',    'uom'=>'pcs',   'cat'=>'Mugs',              'qty'=>100, 'cost'=>40.00, 'min'=>20, 'sup'=>$sup1]);
        $mMugM  = $mat(['name'=>'Magic Mug 11oz',              'sku'=>'MUG-MG-11',    'uom'=>'pcs',   'cat'=>'Mugs',              'qty'=>100, 'cost'=>85.00, 'min'=>20, 'sup'=>$sup1]);
        // Bags
        $mBPS   = $mat(['name'=>'Canvas Totebag Plain Small 10x12"',              'sku'=>'BAG-PS-1012',  'uom'=>'pcs', 'cat'=>'Bags', 'qty'=>50,  'cost'=>32.00, 'min'=>10, 'sup'=>$sup3]);
        $mBPM   = $mat(['name'=>'Canvas Totebag Plain Medium 12x14"',             'sku'=>'BAG-PM-1214',  'uom'=>'pcs', 'cat'=>'Bags', 'qty'=>50,  'cost'=>38.00, 'min'=>10, 'sup'=>$sup3]);
        $mBPL   = $mat(['name'=>'Canvas Totebag Plain Large 14x16"',              'sku'=>'BAG-PL-1416',  'uom'=>'pcs', 'cat'=>'Bags', 'qty'=>50,  'cost'=>43.00, 'min'=>10, 'sup'=>$sup3]);
        $mBZS   = $mat(['name'=>'Canvas Totebag W/Zipper & Pocket Small 10x12"',  'sku'=>'BAG-ZS-1012',  'uom'=>'pcs', 'cat'=>'Bags', 'qty'=>50,  'cost'=>55.00, 'min'=>10, 'sup'=>$sup3]);
        $mBZM   = $mat(['name'=>'Canvas Totebag W/Zipper & Pocket Medium 12x14"', 'sku'=>'BAG-ZM-1214',  'uom'=>'pcs', 'cat'=>'Bags', 'qty'=>50,  'cost'=>62.00, 'min'=>10, 'sup'=>$sup3]);
        $mBZL   = $mat(['name'=>'Canvas Totebag W/Zipper & Pocket Large 14x16"',  'sku'=>'BAG-ZL-1416',  'uom'=>'pcs', 'cat'=>'Bags', 'qty'=>50,  'cost'=>68.00, 'min'=>10, 'sup'=>$sup3]);
        // Mousepads & Coasters
        $mPad   = $mat(['name'=>'Sublimation Mousepad 22x18cm', 'sku'=>'PAD-SUB-2218',  'uom'=>'pcs',   'cat'=>'Mousepads',         'qty'=>50,  'cost'=>32.00, 'min'=>10, 'sup'=>$sup1]);
        $mCst   = $mat(['name'=>'Rubber Coaster 10x10cm',       'sku'=>'CST-RUB-1010',  'uom'=>'pcs',   'cat'=>'Souvenirs',         'qty'=>100, 'cost'=>10.00, 'min'=>20, 'sup'=>$sup1]);
        // Button Badges
        $mBPin  = $mat(['name'=>'Button Pin Badge Blank 2.25"', 'sku'=>'BADGE-PIN-225', 'uom'=>'pcs',   'cat'=>'Button Badges',     'qty'=>200, 'cost'=>8.00,  'min'=>50, 'sup'=>$sup3]);
        $mBMag  = $mat(['name'=>'Magnet Badge Blank 2.25"',     'sku'=>'BADGE-MAG-225', 'uom'=>'pcs',   'cat'=>'Button Badges',     'qty'=>200, 'cost'=>8.00,  'min'=>50, 'sup'=>$sup3]);
        $mBKey  = $mat(['name'=>'Keychain Badge Blank 2.25"',   'sku'=>'BADGE-KEY-225', 'uom'=>'pcs',   'cat'=>'Button Badges',     'qty'=>200, 'cost'=>10.00, 'min'=>50, 'sup'=>$sup3]);
        // Souvenirs
        $mMirC  = $mat(['name'=>'Compact Mirror Blank 2.75"',          'sku'=>'MIR-CMP-275',  'uom'=>'pcs', 'cat'=>'Souvenirs', 'qty'=>50,  'cost'=>32.00, 'min'=>10, 'sup'=>$sup1]);
        $mMirP  = $mat(['name'=>'Pocket Mirror Blank 2.25"',           'sku'=>'MIR-PKT-225',  'uom'=>'pcs', 'cat'=>'Souvenirs', 'qty'=>100, 'cost'=>8.00,  'min'=>20, 'sup'=>$sup1]);
        $mMirK  = $mat(['name'=>'Mini Compact Mirror Keychain Blank',   'sku'=>'MIR-KCH-MINI', 'uom'=>'pcs', 'cat'=>'Souvenirs', 'qty'=>50,  'cost'=>30.00, 'min'=>10, 'sup'=>$sup1]);
        $mRMag  = $mat(['name'=>'Ref Magnet Blank 3"',                 'sku'=>'MAG-REF-3',    'uom'=>'pcs', 'cat'=>'Souvenirs', 'qty'=>100, 'cost'=>6.00,  'min'=>20, 'sup'=>$sup1]);
        $mWKch  = $mat(['name'=>'Wood Keychain Blank 2.75"',           'sku'=>'KCH-WD-275',   'uom'=>'pcs', 'cat'=>'Souvenirs', 'qty'=>50,  'cost'=>22.00, 'min'=>10, 'sup'=>$sup1]);
        $mMBkm  = $mat(['name'=>'Magnetic Bookmark Blank 2.5"',        'sku'=>'BKM-MAG-25',   'uom'=>'pcs', 'cat'=>'Souvenirs', 'qty'=>100, 'cost'=>8.00,  'min'=>20, 'sup'=>$sup1]);
        // Vinyl Sticker Waterproof finishes
        $mSVP_G = $mat(['name'=>'Vinyl Sticker Sheet A4 (WP Glossy)',       'sku'=>'STK-VNL-GLS',    'uom'=>'sheet', 'cat'=>'Stickers & Labels', 'qty'=>200, 'cost'=>6.00,  'min'=>50, 'sup'=>$sup2]);
        $mSVP_M = $mat(['name'=>'Vinyl Sticker Sheet A4 (WP Matte)',        'sku'=>'STK-VNL-MAT',    'uom'=>'sheet', 'cat'=>'Stickers & Labels', 'qty'=>200, 'cost'=>6.00,  'min'=>50, 'sup'=>$sup2]);
        $mSVP_T = $mat(['name'=>'Vinyl Sticker Sheet A4 (WP Transparent)',  'sku'=>'STK-VNL-TRN',    'uom'=>'sheet', 'cat'=>'Stickers & Labels', 'qty'=>200, 'cost'=>6.50,  'min'=>50, 'sup'=>$sup2]);
        // Vinyl Sticker Laminated finishes
        $mSVL_G  = $mat(['name'=>'Vinyl Sticker Sheet A4 (Lam Glossy)',     'sku'=>'STK-VNL-LAM-GLS','uom'=>'sheet', 'cat'=>'Stickers & Labels', 'qty'=>200, 'cost'=>10.00, 'min'=>50, 'sup'=>$sup2]);
        $mSVL_M  = $mat(['name'=>'Vinyl Sticker Sheet A4 (Lam Matte)',      'sku'=>'STK-VNL-LAM-MAT','uom'=>'sheet', 'cat'=>'Stickers & Labels', 'qty'=>200, 'cost'=>10.00, 'min'=>50, 'sup'=>$sup2]);
        $mSVL_Gl = $mat(['name'=>'Vinyl Sticker Sheet A4 (Glittered)',      'sku'=>'STK-VNL-GLT',    'uom'=>'sheet', 'cat'=>'Stickers & Labels', 'qty'=>200, 'cost'=>12.00, 'min'=>50, 'sup'=>$sup2]);
        $mSVL_H  = $mat(['name'=>'Vinyl Sticker Sheet A4 (Holographic)',    'sku'=>'STK-VNL-HLG',    'uom'=>'sheet', 'cat'=>'Stickers & Labels', 'qty'=>200, 'cost'=>13.00, 'min'=>50, 'sup'=>$sup2]);
        // Specialty Label finishes
        $mSSP_PG = $mat(['name'=>'Specialty Label Sheet A4 (Pearl Glossy)', 'sku'=>'STK-SPEC-PGL',   'uom'=>'sheet', 'cat'=>'Stickers & Labels', 'qty'=>200, 'cost'=>18.00, 'min'=>50, 'sup'=>$sup2]);
        $mSSP_Al = $mat(['name'=>'Specialty Label Sheet A4 (Aluminum)',     'sku'=>'STK-SPEC-ALM',   'uom'=>'sheet', 'cat'=>'Stickers & Labels', 'qty'=>200, 'cost'=>20.00, 'min'=>50, 'sup'=>$sup2]);
        $mSSP_Go = $mat(['name'=>'Specialty Label Sheet A4 (Gold)',         'sku'=>'STK-SPEC-GLD',   'uom'=>'sheet', 'cat'=>'Stickers & Labels', 'qty'=>200, 'cost'=>22.00, 'min'=>50, 'sup'=>$sup2]);
        $mSSP_H  = $mat(['name'=>'Specialty Label Sheet A4 (Holographic)',  'sku'=>'STK-SPEC-HLG',   'uom'=>'sheet', 'cat'=>'Stickers & Labels', 'qty'=>200, 'cost'=>22.00, 'min'=>50, 'sup'=>$sup2]);
        // Photopaper finishes
        $mSPH_G  = $mat(['name'=>'Photopaper Sticker Sheet A4 (Glossy)',    'sku'=>'STK-PHT-GLS',    'uom'=>'sheet', 'cat'=>'Stickers & Labels', 'qty'=>200, 'cost'=>6.00,  'min'=>50, 'sup'=>$sup2]);
        $mSPH_M  = $mat(['name'=>'Photopaper Sticker Sheet A4 (Matte)',     'sku'=>'STK-PHT-MAT',    'uom'=>'sheet', 'cat'=>'Stickers & Labels', 'qty'=>200, 'cost'=>6.50,  'min'=>50, 'sup'=>$sup2]);
        // Regular Sticker finishes
        $mSRG_G  = $mat(['name'=>'Regular Sticker Paper A4 (Glossy)',       'sku'=>'STK-REG-GLS',    'uom'=>'sheet', 'cat'=>'Stickers & Labels', 'qty'=>200, 'cost'=>4.00,  'min'=>50, 'sup'=>$sup2]);
        $mSRG_M  = $mat(['name'=>'Regular Sticker Paper A4 (Matte)',        'sku'=>'STK-REG-MAT',    'uom'=>'sheet', 'cat'=>'Stickers & Labels', 'qty'=>200, 'cost'=>4.00,  'min'=>50, 'sup'=>$sup2]);
        // Kraft finishes
        $mSKF_G  = $mat(['name'=>'Kraft Sticker Paper A4 (Glossy)',         'sku'=>'STK-KFT-GLS',    'uom'=>'sheet', 'cat'=>'Stickers & Labels', 'qty'=>200, 'cost'=>3.00,  'min'=>50, 'sup'=>$sup2]);
        $mSKF_M  = $mat(['name'=>'Kraft Sticker Paper A4 (Matte)',          'sku'=>'STK-KFT-MAT',    'uom'=>'sheet', 'cat'=>'Stickers & Labels', 'qty'=>200, 'cost'=>3.00,  'min'=>50, 'sup'=>$sup2]);
        $mSKF_T  = $mat(['name'=>'Kraft Sticker Paper A4 (Transparent)',    'sku'=>'STK-KFT-TRN',    'uom'=>'sheet', 'cat'=>'Stickers & Labels', 'qty'=>200, 'cost'=>3.50,  'min'=>50, 'sup'=>$sup2]);
        // Consumables
        $mPap   = $mat(['name'=>'Sublimation Transfer Paper A3', 'sku'=>'CONS-SUB-PAP-A3', 'uom'=>'sheet', 'cat'=>'Consumables', 'qty'=>500, 'cost'=>6.00,   'min'=>100, 'sup'=>$sup2]);
        $mInk   = $mat(['name'=>'Sublimation Ink Set',           'sku'=>'CONS-SUB-INK',    'uom'=>'set',   'cat'=>'Consumables', 'qty'=>5,   'cost'=>900.00, 'min'=>1,   'sup'=>$sup2]);
        // Packaging
        $mMugBox   = $mat(['name'=>'Mug Box White 11oz',             'sku'=>'PKG-MUG-BOX-11',    'uom'=>'pcs', 'cat'=>'Consumables', 'qty'=>100, 'cost'=>5.00,  'min'=>20,  'sup'=>$sup1]);
        $mBadgePkg = $mat(['name'=>'Button Badge OPP Bag 2.25"',     'sku'=>'PKG-BADGE-OPP-225', 'uom'=>'pcs', 'cat'=>'Consumables', 'qty'=>500, 'cost'=>0.50,  'min'=>100, 'sup'=>$sup3]);
        // Accessories — Scrunchie colors
        $mScrchY = $mat(['name'=>'Scrunchie - Yellow', 'sku'=>'ACC-SCRCH-YEL', 'uom'=>'pcs', 'cat'=>'Accessories', 'qty'=>50, 'cost'=>18.00, 'min'=>10, 'sup'=>$sup3]);
        $mScrchO = $mat(['name'=>'Scrunchie - Orange', 'sku'=>'ACC-SCRCH-ORG', 'uom'=>'pcs', 'cat'=>'Accessories', 'qty'=>50, 'cost'=>18.00, 'min'=>10, 'sup'=>$sup3]);

        // ── BOMs ─────────────────────────────────────────────────────────────
        $this->command->info('Seeding BOMs...');

        $bom = function (string $sku, string $name, array $comps) use ($now) {
            return BillOfMaterial::create([
                'sku'         => $sku,
                'productName' => $name,
                'components'  => $comps,
                'totalCost'   => array_sum(array_map(fn($c) => $c['unitCost'] * $c['qty'], $comps)),
                'isActive'    => true,
                'createdAt'   => $now,
                'updatedAt'   => $now,
            ]);
        };

        $c = fn(Inventory $m, float $q) => [
            'inventoryId'  => (string) $m->_id,
            'materialName' => $m->name,
            'qty'          => $q,
            'unit'         => $m->uom,
            'unitCost'     => $m->baseCost,
        ];

        $bMugW  = $bom('BOM-MUG-CW',      'Custom Mug - Ceramic White',                    [$c($mMugW,1), $c($mPap,1), $c($mMugBox,1)]);
        $bMugI  = $bom('BOM-MUG-IC',      'Custom Mug - Inner Color',                      [$c($mMugI,1), $c($mPap,1), $c($mMugBox,1)]);
        $bMugM  = $bom('BOM-MUG-MG',      'Magic Mug',                                     [$c($mMugM,1), $c($mPap,1), $c($mMugBox,1)]);
        $bBPS   = $bom('BOM-BAG-PS',      'Canvas Totebag Plain Small',                    [$c($mBPS,1),  $c($mPap,1)]);
        $bBPM   = $bom('BOM-BAG-PM',      'Canvas Totebag Plain Medium',                   [$c($mBPM,1),  $c($mPap,1)]);
        $bBPL   = $bom('BOM-BAG-PL',      'Canvas Totebag Plain Large',                    [$c($mBPL,1),  $c($mPap,1)]);
        $bBZS   = $bom('BOM-BAG-ZS',      'Canvas Totebag W/Zipper Small',                 [$c($mBZS,1),  $c($mPap,1)]);
        $bBZM   = $bom('BOM-BAG-ZM',      'Canvas Totebag W/Zipper Medium',                [$c($mBZM,1),  $c($mPap,1)]);
        $bBZL   = $bom('BOM-BAG-ZL',      'Canvas Totebag W/Zipper Large',                 [$c($mBZL,1),  $c($mPap,1)]);
        $bPad   = $bom('BOM-PAD',         'Custom Mousepad',                               [$c($mPad,1),  $c($mPap,1)]);
        $bCst   = $bom('BOM-CST',         'Custom Rubber Coaster',                         [$c($mCst,1),  $c($mPap,1)]);
        $bBPin  = $bom('BOM-BADGE-PIN',   'Badge/Button Pin',                              [$c($mBPin,1),  $c($mBadgePkg,1)]);
        $bBMag  = $bom('BOM-BADGE-MAG',   'Magnet Badge',                                  [$c($mBMag,1),  $c($mBadgePkg,1)]);
        $bBKey  = $bom('BOM-BADGE-KEY',   'Keychain Badge',                                [$c($mBKey,1),  $c($mBadgePkg,1)]);
        $bMirC  = $bom('BOM-MIR-CMP',    'Compact Mirror',                                [$c($mMirC,1), $c($mPap,1)]);
        $bMirP  = $bom('BOM-MIR-PKT',    'Pocket Mirror',                                 [$c($mMirP,1), $c($mPap,1)]);
        $bMirK  = $bom('BOM-MIR-KCH',    'Mini Compact Mirror Keychain',                  [$c($mMirK,1), $c($mPap,1)]);
        $bRMag  = $bom('BOM-MAG-REF',    'Ref Magnet',                                    [$c($mRMag,1), $c($mPap,1)]);
        $bWKch  = $bom('BOM-KCH-WD',     'Wood Keychain',                                 [$c($mWKch,1), $c($mPap,1)]);
        $bMBkm  = $bom('BOM-BKM-MAG',    'Magnetic Bookmark',                             [$c($mMBkm,1), $c($mPap,1)]);
        // Vinyl WP finish BOMs
        $bSVP_G  = $bom('BOM-STK-VNL-GLS',     'Vinyl Sticker Waterproof - Glossy',            [$c($mSVP_G,1)]);
        $bSVP_M  = $bom('BOM-STK-VNL-MAT',     'Vinyl Sticker Waterproof - Matte',             [$c($mSVP_M,1)]);
        $bSVP_T  = $bom('BOM-STK-VNL-TRN',     'Vinyl Sticker Waterproof - Transparent',       [$c($mSVP_T,1)]);
        // Vinyl Lam finish BOMs
        $bSVL_G  = $bom('BOM-STK-VNL-LAM-GLS', 'Vinyl Sticker Laminated - Glossy',             [$c($mSVL_G,1)]);
        $bSVL_M  = $bom('BOM-STK-VNL-LAM-MAT', 'Vinyl Sticker Laminated - Matte',              [$c($mSVL_M,1)]);
        $bSVL_Gl = $bom('BOM-STK-VNL-GLT',     'Vinyl Sticker Laminated - Glittered',          [$c($mSVL_Gl,1)]);
        $bSVL_H  = $bom('BOM-STK-VNL-HLG',     'Vinyl Sticker Laminated - Holographic',        [$c($mSVL_H,1)]);
        // Specialty Label finish BOMs
        $bSSP_PG = $bom('BOM-STK-SPEC-PGL',    'Specialty Label Sticker - Pearl Glossy',       [$c($mSSP_PG,1)]);
        $bSSP_Al = $bom('BOM-STK-SPEC-ALM',    'Specialty Label Sticker - Aluminum',           [$c($mSSP_Al,1)]);
        $bSSP_Go = $bom('BOM-STK-SPEC-GLD',    'Specialty Label Sticker - Gold',               [$c($mSSP_Go,1)]);
        $bSSP_H  = $bom('BOM-STK-SPEC-HLG',    'Specialty Label Sticker - Holographic',        [$c($mSSP_H,1)]);
        // Photopaper finish BOMs
        $bSPH_G  = $bom('BOM-STK-PHT-GLS',     'Photopaper Sticker - Glossy',                  [$c($mSPH_G,1)]);
        $bSPH_M  = $bom('BOM-STK-PHT-MAT',     'Photopaper Sticker - Matte',                   [$c($mSPH_M,1)]);
        // Regular finish BOMs
        $bSRG_G  = $bom('BOM-STK-REG-GLS',     'Regular Sticker Paper - Glossy',               [$c($mSRG_G,1)]);
        $bSRG_M  = $bom('BOM-STK-REG-MAT',     'Regular Sticker Paper - Matte',                [$c($mSRG_M,1)]);
        // Kraft finish BOMs
        $bSKF_G  = $bom('BOM-STK-KFT-GLS',     'Kraft Sticker Paper - Glossy',                 [$c($mSKF_G,1)]);
        $bSKF_M  = $bom('BOM-STK-KFT-MAT',     'Kraft Sticker Paper - Matte',                  [$c($mSKF_M,1)]);
        $bSKF_T  = $bom('BOM-STK-KFT-TRN',     'Kraft Sticker Paper - Transparent',            [$c($mSKF_T,1)]);
        // Scrunchie color BOMs
        $bScrchY = $bom('BOM-ACC-SCRCH-YEL',   'Scrunchie - Yellow',                           [$c($mScrchY,1)]);
        $bScrchO = $bom('BOM-ACC-SCRCH-ORG',   'Scrunchie - Orange',                           [$c($mScrchO,1)]);

        // ── PRODUCTS ─────────────────────────────────────────────────────────
        $this->command->info('Seeding products...');

        $t = function (array $breaks): array {
            return array_map(fn($i, $b) => [
                'id'     => 'tier_' . ($i + 1),
                'minQty' => $b[0],
                'maxQty' => $b[1],
                'prices' => ['__base__' => $b[2]],
            ], array_keys($breaks), $breaks);
        };

        $tm = function (array $breaks): array {
            return array_map(fn($i, $b) => [
                'id'     => 'tier_' . ($i + 1),
                'minQty' => $b[0],
                'maxQty' => $b[1],
                'prices' => $b[2],
            ], array_keys($breaks), $breaks);
        };

        $prod = function (array $d) use ($now): Product {
            return Product::create(array_merge([
                'isActive'            => true,
                'isPublished'         => true,
                'isArchived'          => false,
                'isCustom'            => true,
                'isMadeToOrder'       => false,
                'images'              => [],
                'thumbnail'           => '',
                'tags'                => [],
                'variantGroups'       => [],
                'combinations'        => [],
                'requiresDownpayment' => true,
                'downpaymentPercent'  => 50,
                'trackInventory'      => true,
                'stockStatus'         => 'in-stock',
                'createdAt'           => $now,
                'updatedAt'           => $now,
            ], $d));
        };

        $bid = fn($b) => $b->_id;

        // Mugs — multi-variant (Ceramic White / Inner Color / Magic Mug)
        $pMug = $prod([
            'name'           => 'Custom Mug 11oz',
            'description'    => 'Personalized sublimation-printed mug, 11oz. Choose from Ceramic White, Inner Color, or Magic Mug.',
            'category'       => 'Mugs',
            'subCategoryName'=> '11oz',
            'priceType'      => 'tiered',
            'bomId'          => null,
            'variantGroups'  => [['id'=>'type','name'=>'Type','options'=>['Ceramic White','Inner Color','Magic Mug']]],
            'combinations'   => [
                ['id'=>'mug-cw','name'=>'Ceramic White', 'bomId'=>(string)$bid($bMugW)],
                ['id'=>'mug-ic','name'=>'Inner Color',   'bomId'=>(string)$bid($bMugI)],
                ['id'=>'mug-mm','name'=>'Magic Mug',     'bomId'=>(string)$bid($bMugM)],
            ],
            'priceTiers'     => $tm([
                [1,   20,  ['mug-cw'=>95, 'mug-ic'=>100,'mug-mm'=>200]],
                [21,  30,  ['mug-cw'=>90, 'mug-ic'=>95, 'mug-mm'=>180]],
                [31,  50,  ['mug-cw'=>85, 'mug-ic'=>90, 'mug-mm'=>170]],
                [51,  100, ['mug-cw'=>80, 'mug-ic'=>85, 'mug-mm'=>160]],
                [101, 300, ['mug-cw'=>70, 'mug-ic'=>75, 'mug-mm'=>150]],
                [301, 500, ['mug-cw'=>60, 'mug-ic'=>65, 'mug-mm'=>130]],
                [501, null,['mug-cw'=>50, 'mug-ic'=>55, 'mug-mm'=>100]],
            ]),
        ]);

        // Canvas Totebags — multi-variant per style (3 sizes each)
        $pBagPlain = $prod([
            'name'           => 'Canvas Totebag - Plain',
            'description'    => 'Custom sublimation-printed canvas totebag, plain. Available in Small (10x12"), Medium (12x14"), and Large (14x16").',
            'category'       => 'Bags',
            'subCategoryName'=> 'Plain Canvas Totebag',
            'priceType'      => 'tiered',
            'bomId'          => null,
            'variantGroups'  => [['id'=>'size','name'=>'Size','options'=>['Small (10x12")','Medium (12x14")','Large (14x16")']]],
            'combinations'   => [
                ['id'=>'bp-s','name'=>'Small (10x12")', 'bomId'=>(string)$bid($bBPS)],
                ['id'=>'bp-m','name'=>'Medium (12x14")','bomId'=>(string)$bid($bBPM)],
                ['id'=>'bp-l','name'=>'Large (14x16")', 'bomId'=>(string)$bid($bBPL)],
            ],
            'priceTiers'     => $tm([
                [1,   20,  ['bp-s'=>100,'bp-m'=>110,'bp-l'=>120]],
                [21,  30,  ['bp-s'=>95, 'bp-m'=>100,'bp-l'=>110]],
                [31,  50,  ['bp-s'=>90, 'bp-m'=>95, 'bp-l'=>105]],
                [51,  100, ['bp-s'=>85, 'bp-m'=>90, 'bp-l'=>100]],
                [101, 300, ['bp-s'=>80, 'bp-m'=>85, 'bp-l'=>95]],
                [301, 500, ['bp-s'=>75, 'bp-m'=>80, 'bp-l'=>90]],
                [501, null,['bp-s'=>70, 'bp-m'=>75, 'bp-l'=>85]],
            ]),
        ]);

        $pBagZip = $prod([
            'name'           => 'Canvas Totebag - W/Zipper & Pocket',
            'description'    => 'Custom sublimation-printed canvas totebag with zipper & pocket. Available in Small (10x12"), Medium (12x14"), and Large (14x16").',
            'category'       => 'Bags',
            'subCategoryName'=> 'W/Zipper & Pocket Canvas Totebag',
            'priceType'      => 'tiered',
            'bomId'          => null,
            'variantGroups'  => [['id'=>'size','name'=>'Size','options'=>['Small (10x12")','Medium (12x14")','Large (14x16")']]],
            'combinations'   => [
                ['id'=>'bz-s','name'=>'Small (10x12")', 'bomId'=>(string)$bid($bBZS)],
                ['id'=>'bz-m','name'=>'Medium (12x14")','bomId'=>(string)$bid($bBZM)],
                ['id'=>'bz-l','name'=>'Large (14x16")', 'bomId'=>(string)$bid($bBZL)],
            ],
            'priceTiers'     => $tm([
                [1,   20,  ['bz-s'=>130,'bz-m'=>140,'bz-l'=>150]],
                [21,  30,  ['bz-s'=>120,'bz-m'=>130,'bz-l'=>140]],
                [31,  50,  ['bz-s'=>115,'bz-m'=>125,'bz-l'=>135]],
                [51,  100, ['bz-s'=>110,'bz-m'=>120,'bz-l'=>130]],
                [101, 300, ['bz-s'=>105,'bz-m'=>115,'bz-l'=>125]],
                [301, 500, ['bz-s'=>95, 'bz-m'=>110,'bz-l'=>120]],
                [501, null,['bz-s'=>90, 'bz-m'=>105,'bz-l'=>115]],
            ]),
        ]);

        // Mousepads & Coasters
        $pPad = $prod(['name'=>'Custom Mousepad Rectangle 22x18cm', 'description'=>'Full-color sublimation-printed mousepad, rubber base. Size: 22x18cm.', 'category'=>'Mousepads', 'subCategoryName'=>'Rectangle 22x18cm', 'priceType'=>'tiered', 'priceTiers'=>$t([[1,20,100],[21,30,95],[31,50,90],[51,100,85],[101,300,80],[301,500,75],[501,null,70]]), 'bomId'=>$bid($bPad)]);
        $pCst = $prod([
            'name'           => 'Custom Rubber Coaster',
            'description'    => 'Sublimation-printed rubber coaster. Available in Round or Square, 10x10cm.',
            'category'       => 'Souvenirs',
            'subCategoryName'=> 'Rubber Coaster 10x10cm',
            'priceType'      => 'tiered',
            'bomId'          => null,
            'variantGroups'  => [['id'=>'shape','name'=>'Shape','options'=>['Round','Square']]],
            'combinations'   => [
                ['id'=>'cst-r','name'=>'Round', 'bomId'=>(string)$bid($bCst)],
                ['id'=>'cst-s','name'=>'Square','bomId'=>(string)$bid($bCst)],
            ],
            'priceTiers'     => $tm([
                [1,   20,  ['cst-r'=>35,'cst-s'=>35]],
                [21,  30,  ['cst-r'=>33,'cst-s'=>33]],
                [31,  50,  ['cst-r'=>30,'cst-s'=>30]],
                [51,  100, ['cst-r'=>28,'cst-s'=>28]],
                [101, 300, ['cst-r'=>25,'cst-s'=>25]],
                [301, 500, ['cst-r'=>23,'cst-s'=>23]],
                [501, null,['cst-r'=>20,'cst-s'=>20]],
            ]),
        ]);

        // Button Badges — multi-variant (Button Pin / Magnet Badge / Keychain Badge)
        $pBadge = $prod([
            'name'                => 'Custom Badge 2.25"',
            'description'         => 'Custom-printed badge, 2.25" diameter. Choose from Button Pin, Magnet Badge, or Keychain Badge.',
            'category'            => 'Button Badges',
            'subCategoryName'     => '2.25" Badge',
            'priceType'           => 'tiered',
            'bomId'               => null,
            'requiresDownpayment' => false,
            'downpaymentPercent'  => 0,
            'variantGroups'       => [['id'=>'type','name'=>'Type','options'=>['Button Pin','Magnet Badge','Keychain Badge']]],
            'combinations'        => [
                ['id'=>'bdg-pin','name'=>'Button Pin',    'bomId'=>(string)$bid($bBPin)],
                ['id'=>'bdg-mag','name'=>'Magnet Badge',  'bomId'=>(string)$bid($bBMag)],
                ['id'=>'bdg-key','name'=>'Keychain Badge','bomId'=>(string)$bid($bBKey)],
            ],
            'priceTiers'          => $tm([
                [1,   20,  ['bdg-pin'=>30,'bdg-mag'=>30,'bdg-key'=>33]],
                [21,  30,  ['bdg-pin'=>28,'bdg-mag'=>28,'bdg-key'=>30]],
                [31,  50,  ['bdg-pin'=>25,'bdg-mag'=>25,'bdg-key'=>28]],
                [51,  100, ['bdg-pin'=>20,'bdg-mag'=>23,'bdg-key'=>25]],
                [101, 300, ['bdg-pin'=>18,'bdg-mag'=>20,'bdg-key'=>23]],
                [301, 500, ['bdg-pin'=>15,'bdg-mag'=>18,'bdg-key'=>20]],
                [501, null,['bdg-pin'=>10,'bdg-mag'=>15,'bdg-key'=>18]],
            ]),
        ]);

        // Souvenirs
        $pMirC = $prod([
            'name'           => 'Compact Mirror 2.75"',
            'description'    => 'Custom sublimation-printed compact mirror. Available in Round, Square, or Heart. Size: 2.75".',
            'category'       => 'Souvenirs',
            'subCategoryName'=> 'Compact Mirror 2.75"',
            'priceType'      => 'tiered',
            'bomId'          => null,
            'variantGroups'  => [['id'=>'shape','name'=>'Shape','options'=>['Round','Square','Heart']]],
            'combinations'   => [
                ['id'=>'mirc-r','name'=>'Round', 'bomId'=>(string)$bid($bMirC)],
                ['id'=>'mirc-s','name'=>'Square','bomId'=>(string)$bid($bMirC)],
                ['id'=>'mirc-h','name'=>'Heart', 'bomId'=>(string)$bid($bMirC)],
            ],
            'priceTiers'     => $tm([
                [1,   20,  ['mirc-r'=>85,'mirc-s'=>85,'mirc-h'=>85]],
                [21,  30,  ['mirc-r'=>75,'mirc-s'=>75,'mirc-h'=>75]],
                [31,  50,  ['mirc-r'=>70,'mirc-s'=>70,'mirc-h'=>70]],
                [51,  100, ['mirc-r'=>65,'mirc-s'=>65,'mirc-h'=>65]],
                [101, 300, ['mirc-r'=>60,'mirc-s'=>60,'mirc-h'=>60]],
                [301, 500, ['mirc-r'=>55,'mirc-s'=>55,'mirc-h'=>55]],
                [501, null,['mirc-r'=>50,'mirc-s'=>50,'mirc-h'=>50]],
            ]),
        ]);
        $pMirP = $prod(['name'=>'Pocket Mirror 2.25"', 'description'=>'Custom-printed pocket mirror, 2.25".', 'category'=>'Souvenirs', 'subCategoryName'=>'Pocket Mirror 2.25"', 'priceType'=>'tiered', 'priceTiers'=>$t([[1,20,30],[21,30,28],[31,50,25],[51,100,23],[101,300,20],[301,500,18],[501,null,15]]), 'bomId'=>$bid($bMirP), 'requiresDownpayment'=>false, 'downpaymentPercent'=>0]);
        $pMirK = $prod([
            'name'           => 'Mini Compact Mirror Keychain',
            'description'    => 'Custom-printed mini compact mirror keychain. Available in Round or Heart.',
            'category'       => 'Souvenirs',
            'subCategoryName'=> 'Mini Compact Mirror Keychain',
            'priceType'      => 'tiered',
            'bomId'          => null,
            'variantGroups'  => [['id'=>'shape','name'=>'Shape','options'=>['Round','Heart']]],
            'combinations'   => [
                ['id'=>'mirk-r','name'=>'Round','bomId'=>(string)$bid($bMirK)],
                ['id'=>'mirk-h','name'=>'Heart','bomId'=>(string)$bid($bMirK)],
            ],
            'priceTiers'     => $tm([
                [1,   20,  ['mirk-r'=>90,'mirk-h'=>90]],
                [21,  30,  ['mirk-r'=>80,'mirk-h'=>80]],
                [31,  50,  ['mirk-r'=>75,'mirk-h'=>75]],
                [51,  100, ['mirk-r'=>70,'mirk-h'=>70]],
                [101, 300, ['mirk-r'=>65,'mirk-h'=>65]],
                [301, 500, ['mirk-r'=>60,'mirk-h'=>60]],
                [501, null,['mirk-r'=>55,'mirk-h'=>55]],
            ]),
        ]);
        $pRMag = $prod(['name'=>'Ref Magnet', 'description'=>'Custom-printed refrigerator magnet. Maximum size: 3".', 'category'=>'Souvenirs', 'subCategoryName'=>'Ref Magnet 3"', 'priceType'=>'tiered', 'priceTiers'=>$t([[1,20,30],[21,30,28],[31,50,25],[51,100,23],[101,300,20],[301,500,18],[501,null,15]]), 'bomId'=>$bid($bRMag), 'requiresDownpayment'=>false, 'downpaymentPercent'=>0]);
        $pWKch = $prod([
            'name'           => 'Wood Keychain 2.75"',
            'description'    => 'Custom-printed wood keychain. Available in Round, Square, Oblong, or Rectangle. Size: 2.75".',
            'category'       => 'Souvenirs',
            'subCategoryName'=> 'Wood Keychain 2.75"',
            'priceType'      => 'tiered',
            'bomId'          => null,
            'variantGroups'  => [['id'=>'shape','name'=>'Shape','options'=>['Round','Square','Oblong','Rectangle']]],
            'combinations'   => [
                ['id'=>'wkch-r',   'name'=>'Round',    'bomId'=>(string)$bid($bWKch)],
                ['id'=>'wkch-s',   'name'=>'Square',   'bomId'=>(string)$bid($bWKch)],
                ['id'=>'wkch-o',   'name'=>'Oblong',   'bomId'=>(string)$bid($bWKch)],
                ['id'=>'wkch-rect','name'=>'Rectangle','bomId'=>(string)$bid($bWKch)],
            ],
            'priceTiers'     => $tm([
                [1,   20,  ['wkch-r'=>65,'wkch-s'=>65,'wkch-o'=>65,'wkch-rect'=>65]],
                [21,  30,  ['wkch-r'=>55,'wkch-s'=>55,'wkch-o'=>55,'wkch-rect'=>55]],
                [31,  50,  ['wkch-r'=>45,'wkch-s'=>45,'wkch-o'=>45,'wkch-rect'=>45]],
                [51,  100, ['wkch-r'=>35,'wkch-s'=>35,'wkch-o'=>35,'wkch-rect'=>35]],
                [101, 300, ['wkch-r'=>30,'wkch-s'=>30,'wkch-o'=>30,'wkch-rect'=>30]],
                [301, 500, ['wkch-r'=>25,'wkch-s'=>25,'wkch-o'=>25,'wkch-rect'=>25]],
                [501, null,['wkch-r'=>20,'wkch-s'=>20,'wkch-o'=>20,'wkch-rect'=>20]],
            ]),
        ]);
        $pMBkm = $prod(['name'=>'Magnetic Bookmark 2.5"', 'description'=>'Custom-printed magnetic bookmark. Maximum size: 2.5".', 'category'=>'Souvenirs', 'subCategoryName'=>'Magnetic Bookmark 2.5"', 'priceType'=>'tiered', 'priceTiers'=>$t([[1,20,30],[21,30,28],[31,50,25],[51,100,23],[101,300,20],[301,500,18],[501,null,15]]), 'bomId'=>$bid($bMBkm), 'requiresDownpayment'=>false, 'downpaymentPercent'=>0]);

        // Stickers & Labels — multi-variant per finish (price per A4 sheet, tiers start at 1-30)
        $pSVP = $prod([
            'name'                => 'Vinyl Sticker Waterproof (Kisscut/Diecut)',
            'description'         => 'Waterproof vinyl sticker. Choose from Glossy, Matte, or Transparent. Price per A4 sheet.',
            'category'            => 'Stickers & Labels',
            'subCategoryName'     => 'Vinyl Waterproof A4',
            'priceType'           => 'tiered',
            'bomId'               => null,
            'requiresDownpayment' => false,
            'downpaymentPercent'  => 0,
            'variantGroups'       => [['id'=>'finish','name'=>'Finish','options'=>['Glossy','Matte','Transparent']]],
            'combinations'        => [
                ['id'=>'svp-g','name'=>'Glossy',     'bomId'=>(string)$bid($bSVP_G)],
                ['id'=>'svp-m','name'=>'Matte',      'bomId'=>(string)$bid($bSVP_M)],
                ['id'=>'svp-t','name'=>'Transparent','bomId'=>(string)$bid($bSVP_T)],
            ],
            'priceTiers'          => $tm([
                [1,   30,  ['svp-g'=>50,'svp-m'=>50,'svp-t'=>52]],
                [31,  50,  ['svp-g'=>45,'svp-m'=>45,'svp-t'=>47]],
                [51,  100, ['svp-g'=>43,'svp-m'=>43,'svp-t'=>45]],
                [101, 300, ['svp-g'=>40,'svp-m'=>40,'svp-t'=>42]],
                [301, 500, ['svp-g'=>38,'svp-m'=>38,'svp-t'=>40]],
                [501, null,['svp-g'=>35,'svp-m'=>35,'svp-t'=>37]],
            ]),
        ]);
        $pSVL = $prod([
            'name'                => 'Vinyl Sticker Laminated Scratchproof (Kisscut/Diecut)',
            'description'         => 'Waterproof laminated scratchproof vinyl sticker. Choose from Glossy, Matte, Glittered, or Holographic. Price per A4 sheet.',
            'category'            => 'Stickers & Labels',
            'subCategoryName'     => 'Vinyl Laminated Scratchproof A4',
            'priceType'           => 'tiered',
            'bomId'               => null,
            'requiresDownpayment' => false,
            'downpaymentPercent'  => 0,
            'variantGroups'       => [['id'=>'finish','name'=>'Finish','options'=>['Glossy','Matte','Glittered','Holographic']]],
            'combinations'        => [
                ['id'=>'svl-g', 'name'=>'Glossy',     'bomId'=>(string)$bid($bSVL_G)],
                ['id'=>'svl-m', 'name'=>'Matte',      'bomId'=>(string)$bid($bSVL_M)],
                ['id'=>'svl-gl','name'=>'Glittered',  'bomId'=>(string)$bid($bSVL_Gl)],
                ['id'=>'svl-h', 'name'=>'Holographic','bomId'=>(string)$bid($bSVL_H)],
            ],
            'priceTiers'          => $tm([
                [1,   30,  ['svl-g'=>55,'svl-m'=>55,'svl-gl'=>60,'svl-h'=>62]],
                [31,  50,  ['svl-g'=>50,'svl-m'=>50,'svl-gl'=>55,'svl-h'=>57]],
                [51,  100, ['svl-g'=>48,'svl-m'=>48,'svl-gl'=>52,'svl-h'=>54]],
                [101, 300, ['svl-g'=>45,'svl-m'=>45,'svl-gl'=>50,'svl-h'=>52]],
                [301, 500, ['svl-g'=>43,'svl-m'=>43,'svl-gl'=>48,'svl-h'=>50]],
                [501, null,['svl-g'=>40,'svl-m'=>40,'svl-gl'=>45,'svl-h'=>47]],
            ]),
        ]);
        $pSSP = $prod([
            'name'                => 'Specialty Label Sticker Waterproof',
            'description'         => 'Waterproof specialty label sticker. Choose from Pearl Glossy, Aluminum, Gold, or Holographic. Price per A4 sheet.',
            'category'            => 'Stickers & Labels',
            'subCategoryName'     => 'Specialty Label A4',
            'priceType'           => 'tiered',
            'bomId'               => null,
            'requiresDownpayment' => false,
            'downpaymentPercent'  => 0,
            'variantGroups'       => [['id'=>'finish','name'=>'Finish','options'=>['Pearl Glossy','Aluminum','Gold','Holographic']]],
            'combinations'        => [
                ['id'=>'ssp-pg','name'=>'Pearl Glossy','bomId'=>(string)$bid($bSSP_PG)],
                ['id'=>'ssp-al','name'=>'Aluminum',    'bomId'=>(string)$bid($bSSP_Al)],
                ['id'=>'ssp-go','name'=>'Gold',        'bomId'=>(string)$bid($bSSP_Go)],
                ['id'=>'ssp-h', 'name'=>'Holographic', 'bomId'=>(string)$bid($bSSP_H)],
            ],
            'priceTiers'          => $tm([
                [1,   30,  ['ssp-pg'=>65,'ssp-al'=>68,'ssp-go'=>70,'ssp-h'=>70]],
                [31,  50,  ['ssp-pg'=>60,'ssp-al'=>63,'ssp-go'=>65,'ssp-h'=>65]],
                [51,  100, ['ssp-pg'=>58,'ssp-al'=>60,'ssp-go'=>62,'ssp-h'=>62]],
                [101, 300, ['ssp-pg'=>55,'ssp-al'=>58,'ssp-go'=>60,'ssp-h'=>60]],
                [301, 500, ['ssp-pg'=>53,'ssp-al'=>55,'ssp-go'=>58,'ssp-h'=>58]],
                [501, null,['ssp-pg'=>50,'ssp-al'=>52,'ssp-go'=>55,'ssp-h'=>55]],
            ]),
        ]);
        $pSPH = $prod([
            'name'                => 'Photopaper Sticker Waterproof',
            'description'         => 'Waterproof photopaper sticker. Choose from Glossy or Matte. Price per A4 sheet.',
            'category'            => 'Stickers & Labels',
            'subCategoryName'     => 'Photopaper Sticker A4',
            'priceType'           => 'tiered',
            'bomId'               => null,
            'requiresDownpayment' => false,
            'downpaymentPercent'  => 0,
            'variantGroups'       => [['id'=>'finish','name'=>'Finish','options'=>['Glossy','Matte']]],
            'combinations'        => [
                ['id'=>'sph-g','name'=>'Glossy','bomId'=>(string)$bid($bSPH_G)],
                ['id'=>'sph-m','name'=>'Matte', 'bomId'=>(string)$bid($bSPH_M)],
            ],
            'priceTiers'          => $tm([
                [1,   30,  ['sph-g'=>45,'sph-m'=>46]],
                [31,  50,  ['sph-g'=>40,'sph-m'=>41]],
                [51,  100, ['sph-g'=>38,'sph-m'=>39]],
                [101, 300, ['sph-g'=>35,'sph-m'=>36]],
                [301, 500, ['sph-g'=>33,'sph-m'=>34]],
                [501, null,['sph-g'=>30,'sph-m'=>31]],
            ]),
        ]);
        $pSRG = $prod([
            'name'                => 'Regular Sticker Paper Non-Waterproof',
            'description'         => 'Regular non-waterproof sticker paper. Choose from Glossy or Matte. Price per A4 sheet.',
            'category'            => 'Stickers & Labels',
            'subCategoryName'     => 'Regular Sticker Paper A4',
            'priceType'           => 'tiered',
            'bomId'               => null,
            'requiresDownpayment' => false,
            'downpaymentPercent'  => 0,
            'variantGroups'       => [['id'=>'finish','name'=>'Finish','options'=>['Glossy','Matte']]],
            'combinations'        => [
                ['id'=>'srg-g','name'=>'Glossy','bomId'=>(string)$bid($bSRG_G)],
                ['id'=>'srg-m','name'=>'Matte', 'bomId'=>(string)$bid($bSRG_M)],
            ],
            'priceTiers'          => $tm([
                [1,   30,  ['srg-g'=>40,'srg-m'=>40]],
                [31,  50,  ['srg-g'=>38,'srg-m'=>38]],
                [51,  100, ['srg-g'=>35,'srg-m'=>35]],
                [101, 300, ['srg-g'=>33,'srg-m'=>33]],
                [301, 500, ['srg-g'=>30,'srg-m'=>30]],
                [501, null,['srg-g'=>28,'srg-m'=>28]],
            ]),
        ]);
        $pSKF = $prod([
            'name'                => 'Kraft Sticker Paper',
            'description'         => 'Kraft sticker paper. Choose from Glossy, Matte, or Transparent. Price per A4 sheet.',
            'category'            => 'Stickers & Labels',
            'subCategoryName'     => 'Kraft Sticker Paper A4',
            'priceType'           => 'tiered',
            'bomId'               => null,
            'requiresDownpayment' => false,
            'downpaymentPercent'  => 0,
            'variantGroups'       => [['id'=>'finish','name'=>'Finish','options'=>['Glossy','Matte','Transparent']]],
            'combinations'        => [
                ['id'=>'skf-g','name'=>'Glossy',     'bomId'=>(string)$bid($bSKF_G)],
                ['id'=>'skf-m','name'=>'Matte',      'bomId'=>(string)$bid($bSKF_M)],
                ['id'=>'skf-t','name'=>'Transparent','bomId'=>(string)$bid($bSKF_T)],
            ],
            'priceTiers'          => $tm([
                [1,   30,  ['skf-g'=>35,'skf-m'=>35,'skf-t'=>37]],
                [31,  50,  ['skf-g'=>33,'skf-m'=>33,'skf-t'=>35]],
                [51,  100, ['skf-g'=>30,'skf-m'=>30,'skf-t'=>32]],
                [101, 300, ['skf-g'=>28,'skf-m'=>28,'skf-t'=>30]],
                [301, 500, ['skf-g'=>27,'skf-m'=>27,'skf-t'=>29]],
                [501, null,['skf-g'=>25,'skf-m'=>25,'skf-t'=>27]],
            ]),
        ]);

        // Printing Services (inquiry, made-to-order, no BOM needed)
        $svc = function (array $d) use ($now): Product {
            return Product::create(array_merge([
                'isActive'            => true,
                'isPublished'         => true,
                'isArchived'          => false,
                'isCustom'            => true,
                'isMadeToOrder'       => true,
                'priceType'           => 'inquiry',
                'images'              => [],
                'thumbnail'           => '',
                'tags'                => [],
                'variantGroups'       => [],
                'combinations'        => [],
                'priceTiers'          => [],
                'requiresDownpayment' => true,
                'downpaymentPercent'  => 50,
                'trackInventory'      => false,
                'bomId'               => null,
                'stockStatus'         => 'upon-order',
                'createdAt'           => $now,
                'updatedAt'           => $now,
            ], $d));
        };

        $pSilk = $svc(['name'=>'Silkscreen Printing',  'description'=>'Custom silkscreen printing on shirts, tote bags, and more. Prices start at ₱10 per print. Final cost depends on quantity, design, and panel print.', 'category'=>'Printing Services', 'subCategoryName'=>'Silkscreen Printing']);
        $pDTF  = $svc(['name'=>'DTF Printing',         'description'=>'Direct-to-film (DTF) printing. Prices start at ₱250 per meter. Final cost depends on quantity.',                                                      'category'=>'Printing Services', 'subCategoryName'=>'DTF Printing']);
        $pSub  = $svc(['name'=>'Sublimation Printing', 'description'=>'Sublimation printing on various items. Prices start at ₱15 per A4 sheet. Final cost depends on quantity.',                                            'category'=>'Printing Services', 'subCategoryName'=>'Sublimation Printing']);
        $pHP   = $svc(['name'=>'Heat Press Subcon',    'description'=>'Heat press sublimation subcontracting. Prices start at ₱5 per press. Final cost depends on quantity, design, and panel print.',                       'category'=>'Printing Services', 'subCategoryName'=>'Heat Press Subcon']);
        $pTsh  = $svc(['name'=>'T-Shirt Printing',     'description'=>'Custom t-shirt printing via DTF or sublimation. Prices start at ₱300. Final cost depends on quantity, design, material, and panel print.',           'category'=>'Printing Services', 'subCategoryName'=>'T-Shirt Printing']);

        // Scrunchie — non-customizable, ready-made, color variants
        $pScrch = $prod([
            'name'                => 'Scrunchie',
            'description'         => 'Plain scrunchie, ready-made. Available in Yellow or Orange. Perfect as an add-on gift item.',
            'category'            => 'Accessories',
            'subCategoryName'     => 'Scrunchie',
            'priceType'           => 'tiered',
            'bomId'               => null,
            'isCustom'            => false,
            'requiresDownpayment' => false,
            'downpaymentPercent'  => 0,
            'variantGroups'       => [['id'=>'color','name'=>'Color','options'=>['Yellow','Orange']]],
            'combinations'        => [
                ['id'=>'scrch-y','name'=>'Yellow','bomId'=>(string)$bid($bScrchY)],
                ['id'=>'scrch-o','name'=>'Orange','bomId'=>(string)$bid($bScrchO)],
            ],
            'priceTiers'          => $tm([
                [1, null, ['scrch-y'=>45,'scrch-o'=>45]],
            ]),
        ]);

        // ── COLLECTIONS ───────────────────────────────────────────────────────
        $this->command->info('Seeding collections...');

        $ids = fn(array $ps) => array_map(fn($p) => (string) $p->_id, $ps);

        $col = function (string $title, string $slug, string $desc, array $ps, int $sort) use ($now) {
            return Collection::create([
                'title'          => $title,
                'slug'           => $slug,
                'description'    => $desc,
                'image'          => '',
                'type'           => 'manual',
                'conditionMatch' => 'all',
                'conditions'     => [],
                'productIds'     => array_map(fn($p) => (string) $p->_id, $ps),
                'isPublished'    => true,
                'sortOrder'      => $sort,
                'createdAt'      => $now,
                'updatedAt'      => $now,
            ]);
        };

        $col('Best Sellers',      'best-sellers',     'Our most popular products.',                                         [$pMug, $pPad, $pBadge, $pSVP, $pBagPlain, $pMirC], 0);
        $col('Mugs',              'mugs',             'Custom sublimation-printed mugs in various styles.',                 [$pMug], 1);
        $col('Bags',              'bags',             'Custom sublimation-printed canvas totebags in various sizes.',       [$pBagPlain, $pBagZip], 2);
        $col('Mousepads',         'mousepads',        'Custom sublimation-printed mousepads.',                             [$pPad], 3);
        $col('Button Badges',     'button-badges',    'Custom-printed button pins, magnet badges, and keychain badges.',   [$pBadge], 4);
        $col('Souvenirs',         'souvenirs',        'Custom-printed souvenirs: mirrors, keychains, coasters, magnets.',  [$pMirC, $pMirP, $pMirK, $pRMag, $pWKch, $pMBkm, $pCst], 5);
        $col('Stickers & Labels', 'stickers-labels',  'Custom kisscut and diecut stickers in various materials.',          [$pSVP, $pSVL, $pSSP, $pSPH, $pSRG, $pSKF], 6);
        $col('Printing Services', 'printing-services','Professional printing services: silkscreen, DTF, sublimation.',    [$pSilk, $pDTF, $pSub, $pHP, $pTsh], 7);
        $col('Accessories',       'accessories',      'Ready-made accessories and add-ons.',                               [$pScrch], 8);

        Cache::forget('admin_products_list');

        $this->command->info('Done! Seeded:');
        $this->command->info('  Suppliers:  ' . Supplier::count());
        $this->command->info('  Materials:  ' . Inventory::count() . ' (each with 1 initial batch)');
        $this->command->info('  BOMs:       ' . BillOfMaterial::count());
        $this->command->info('  Products:   ' . Product::count());
        $this->command->info('  Collections:' . Collection::count());
    }
}
