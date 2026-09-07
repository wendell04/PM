<?php

namespace App\Support;

use App\Models\BillOfMaterial;
use App\Models\Inventory;
use App\Models\Product;
use Illuminate\Support\Facades\DB;
use MongoDB\BSON\ObjectId;

/**
 * Claiming raw material for a whole order at once.
 *
 * Every order path used to check each cart line on its own: read stockQty minus reservedQty, divide
 * by the recipe, refuse if the line asked for more. The reservation, though, happened in a later
 * loop - so no line ever saw what the lines before it in the SAME cart had taken. Three lines of 50
 * mugs each passed a 50-box ceiling one after another, and the box row finished on 150 reserved
 * against 50 in stock. The same three variants share Mug Box White 11oz, which is why the admin's
 * "50 can build" was true three times over and wrong once added up.
 *
 * So demand is totalled across the cart first, and claimed per material in one guarded write.
 * MongoDB is atomic per document, not per transaction, so the guard is a compare-and-set: the
 * update only applies while stock minus reserved still covers the amount asked for. Two carts
 * racing for the last boxes means one lands and one comes back empty-handed - and the loser
 * releases whatever it had already taken, so it leaves nothing behind.
 */
final class MaterialClaim
{
    /**
     * The BOM a cart line is built from.
     *
     * Delegates to the model rather than repeating the three-shape lookup, because the demand
     * counted here and the material reserved later have to come from the SAME recipe - resolve
     * them two slightly different ways and a claim never matches its release.
     */
    public static function bomFor(?Product $product, $variantId): ?BillOfMaterial
    {
        return $product ? $product->resolveBom($variantId) : null;
    }

    /**
     * What the whole cart needs, keyed by inventory id.
     *
     * Produced and ready-made lines are both counted. A produced line ends up holding the material
     * as a reservation and a ready-made one deducts it outright, but until the order exists they
     * are competing for the same shelf, and only the total decides whether the order can be taken.
     *
     * On-demand materials are skipped, as they are everywhere else: those are bought per order, so
     * there is no shelf to run out of.
     *
     * @param  array<int, array>  $orderItems
     * @return array<string, int>
     */
    public static function demandOf(array $orderItems): array
    {
        $demand = [];

        foreach ($orderItems as $item) {
            $product = Product::find($item['productId'] ?? null);
            $bom     = self::bomFor($product, $item['variantId'] ?? null);
            if (!$bom || empty($bom->components)) {
                continue;
            }

            foreach ($bom->components as $component) {
                $invId = (string) ($component['inventoryId'] ?? '');
                if ($invId === '') {
                    continue;
                }

                $inventory = Inventory::find($invId);
                if (!$inventory || $inventory->isOnDemand) {
                    continue;
                }

                // Rounded exactly the way the reservation loop rounds it, so a claim and its
                // release cancel out to zero instead of leaving a stray unit held forever.
                $qty = (int) round(((float) ($component['qty'] ?? 0)) * ((int) ($item['qty'] ?? 1)));
                if ($qty <= 0) {
                    continue;
                }

                $demand[$invId] = ($demand[$invId] ?? 0) + $qty;
            }
        }

        return $demand;
    }

    /**
     * Take `qty` of one material, but only while stock minus what is already reserved still covers
     * it. Returns false when someone else got there first - nothing is written in that case.
     */
    public static function claim(string $inventoryId, int $qty): bool
    {
        if ($qty <= 0) {
            return true;
        }

        $updated = DB::connection('mongodb')
            ->getCollection('inventories')
            ->findOneAndUpdate(
                [
                    '_id'   => new ObjectId($inventoryId),
                    // Two fields compared against each other, which a plain query cannot do.
                    '$expr' => ['$gte' => [
                        ['$subtract' => [
                            ['$ifNull' => ['$stockQty', 0]],
                            ['$ifNull' => ['$reservedQty', 0]],
                        ]],
                        $qty,
                    ]],
                ],
                ['$inc' => ['reservedQty' => $qty]],
                ['returnDocument' => \MongoDB\Operation\FindOneAndUpdate::RETURN_DOCUMENT_AFTER]
            );

        return $updated !== null;
    }

    /**
     * Give a claim back - on a rollback, or when a ready-made line turns its hold into a real
     * deduction and must not be counted twice.
     */
    public static function release(string $inventoryId, int $qty): void
    {
        if ($qty <= 0) {
            return;
        }

        DB::connection('mongodb')
            ->getCollection('inventories')
            ->updateOne(
                ['_id' => new ObjectId($inventoryId)],
                ['$inc' => ['reservedQty' => -$qty]]
            );
    }

    /**
     * Release a whole set of claims, as built up by the claim loop.
     *
     * @param  array<string, int>  $claims
     */
    public static function releaseAll(array $claims): void
    {
        foreach ($claims as $inventoryId => $qty) {
            self::release((string) $inventoryId, (int) $qty);
        }
    }

    /**
     * The message a refused order should carry. Naming the material and both numbers is the whole
     * point: "can only produce 50" told the customer nothing when three lines shared one ceiling.
     */
    public static function shortfallMessage(string $inventoryId, int $needed): string
    {
        $inventory = Inventory::find($inventoryId);
        if (!$inventory) {
            return 'A material for this order is no longer available.';
        }

        $available = max(0, (int) ($inventory->stockQty ?? 0) - (int) ($inventory->reservedQty ?? 0));
        $unit      = $inventory->uom ? ' ' . $inventory->uom : '';

        return "Not enough \"{$inventory->name}\" for this order: {$available}{$unit} available, "
             . "the whole cart needs {$needed}{$unit}. Reduce the quantity or remove a line.";
    }
}
