<?php

namespace App\Support;

use App\Models\Product;
use App\Models\Inventory;
use App\Models\BillOfMaterial;

/**
 * Resolves the COGS (cost of goods sold) for a product so profit = revenue - cost is correct across
 * every kind of product, not just those with a directly-linked inventory item.
 *
 * Priority (first match wins):
 *   1. BOM  (product->bomId)       — made-to-order: sum of the BOM's material costs per finished unit.
 *   2. Inventory (product->inventoryId) — finished goods: the stocked item's averageCost.
 *   3. Product.cost                — a manual supplier buy price for no-BOM / no-inventory products.
 *   4. 0                           — no cost source configured (profit will look like 100% margin;
 *                                     the admin should set a cost).
 */
class CostResolver
{
    /** Per-unit COGS for a product. */
    public static function unitCost(?Product $product): float
    {
        if (!$product) {
            return 0.0;
        }

        // 1. BOM — per-finished-unit material cost.
        if ($product->bomId) {
            $bom = BillOfMaterial::find($product->bomId);
            if ($bom) {
                $total = (float) ($bom->totalCost ?? 0);
                if ($total <= 0 && is_array($bom->components)) {
                    foreach ($bom->components as $c) {
                        $total += (float) ($c['unitCost'] ?? 0) * (float) ($c['qty'] ?? 0);
                    }
                }
                if ($total > 0) {
                    return round($total, 2);
                }
            }
        }

        // 2. Linked finished-goods inventory.
        if ($product->inventoryId) {
            $inv = Inventory::find($product->inventoryId);
            if ($inv) {
                return round((float) ($inv->averageCost ?? $inv->baseCost ?? 0), 2);
            }
        }

        // 3. Manual per-product cost price (supplier buy price).
        if ($product->cost !== null && (float) $product->cost > 0) {
            return round((float) $product->cost, 2);
        }

        // 4. No cost source.
        return 0.0;
    }

    /** Line COGS = per-unit cost * quantity. */
    public static function lineCost(?Product $product, $qty): float
    {
        return round(self::unitCost($product) * max(0, (int) $qty), 2);
    }
}
