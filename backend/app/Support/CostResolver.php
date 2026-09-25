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
 *   1. BOM, found the way everything else finds it - Product::resolveBom($variantId).
 *   2. Inventory (product->inventoryId) - finished goods: the stocked item's running average cost.
 *   3. Product.cost                     - a manual supplier buy price for no-BOM / no-inventory products.
 *   4. 0                                - no cost source configured.
 *
 * Why the BOM step changed (2026-09-26). This used to read BillOfMaterial::find($product->bomId) and
 * nothing else, while payment, Job Orders, POS, quotations and every stock deduction go through
 * resolveBom() - which, given a VARIANT, uses that variant's own BOM. Nothing here was ever told the
 * variant. On the live catalogue the product-level bomId points at a BOM that no longer exists, so
 * 28 of 31 completed sales in ninety days were written with a cost of 0 and reported as 100% profit:
 * ten Ceramic White mugs sold for P950 showed P950 profit, where the materials cost P291.34.
 *
 * And a material's cost is its running AVERAGE - what was actually paid across its stock-ins - the
 * same figure the counter (WalkInOrderController) already costs its sales with. A BOM also stores a
 * totalCost of its own, written when the BOM was saved; it goes stale the first time a material is
 * bought at a different price, so it is only the fallback for a BOM whose materials cannot be read.
 */
class CostResolver
{
    /**
     * What one unit of a material costs now.
     *
     * First choice is the shelf itself: every batch still holding stock, at what that batch cost.
     * Deductions draw from these same batches, so this is what the next unit out will cost.
     *
     * averageCost is NOT first, though it sounds like the right answer. It is recalculated on each
     * stock-in as (averageCost x stock held + new batch) / new stock, and a material created without
     * an average valued everything already on the shelf at zero. The Ceramic White mug was bought
     * in two batches, both at P30, and its averageCost reads P20.13 - 49 mugs counted as free.
     * Next come the last price paid, that average, and the price typed in when it was created.
     */
    public static function materialCost(?Inventory $inv): float
    {
        if (!$inv) return 0.0;

        $held = 0.0; $value = 0.0;
        foreach ((array) ($inv->batches ?? []) as $b) {
            $b   = (array) $b;
            $rem = (float) ($b['remainingQty'] ?? 0);
            $uc  = (float) ($b['unitCost'] ?? 0);
            if ($rem > 0 && $uc > 0) { $held += $rem; $value += $rem * $uc; }
        }
        if ($held > 0) return $value / $held;

        foreach ([$inv->lastUnitCost ?? null, $inv->averageCost ?? null, $inv->baseCost ?? null] as $c) {
            if ($c !== null && (float) $c > 0) return (float) $c;
        }
        return 0.0;
    }

    /** Per-finished-unit cost of a BOM, from its materials at their current cost. */
    public static function bomUnitCost(?BillOfMaterial $bom): float
    {
        if (!$bom) return 0.0;

        $total = 0.0;
        foreach ((array) ($bom->components ?? []) as $c) {
            $c   = (array) $c;
            $qty = (float) ($c['qty'] ?? 0);
            if ($qty <= 0) continue;
            $inv  = !empty($c['inventoryId']) ? Inventory::find((string) $c['inventoryId']) : null;
            $each = $inv ? self::materialCost($inv) : 0.0;
            // A material that has gone, or was never costed, keeps whatever the BOM wrote for it.
            if ($each <= 0) $each = (float) ($c['unitCost'] ?? 0);
            $total += $each * $qty;
        }
        if ($total <= 0) $total = (float) ($bom->totalCost ?? 0);

        return round($total, 2);
    }

    /** Per-unit COGS for a product - for the variant that was sold, when there is one. */
    public static function unitCost(?Product $product, $variantId = null): float
    {
        if (!$product) {
            return 0.0;
        }

        // 1. BOM - through the one lookup the rest of the system uses.
        $bomCost = self::bomUnitCost($product->resolveBom($variantId));
        if ($bomCost > 0) {
            return $bomCost;
        }

        // 2. Linked finished-goods inventory.
        if ($product->inventoryId) {
            $cost = self::materialCost(Inventory::find($product->inventoryId));
            if ($cost > 0) return round($cost, 2);
        }

        // 3. Manual per-product cost price (supplier buy price).
        if ($product->cost !== null && (float) $product->cost > 0) {
            return round((float) $product->cost, 2);
        }

        // 4. No cost source.
        return 0.0;
    }

    /** Line COGS = per-unit cost * quantity. */
    public static function lineCost(?Product $product, $qty, $variantId = null): float
    {
        return round(self::unitCost($product, $variantId) * max(0, (int) $qty), 2);
    }

    /**
     * The variant id for a variant NAME, for rows that only kept the name ("Ceramic White").
     * Sales written before they carried a variantId name it inside productName instead.
     */
    public static function variantIdByName(?Product $product, ?string $name): ?string
    {
        $name = trim((string) $name);
        if (!$product || $name === '') return null;
        foreach ((array) ($product->combinations ?? []) as $combo) {
            $combo = (array) $combo;
            if (strcasecmp(trim((string) ($combo['name'] ?? '')), $name) === 0) {
                $id = (string) ($combo['id'] ?? $combo['_id'] ?? '');
                return $id !== '' ? $id : null;
            }
        }
        return null;
    }
}
