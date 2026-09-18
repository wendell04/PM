<?php

namespace App\Support;

use App\Models\Inventory;
use App\Models\OrderRequest;
use App\Models\Product;

/**
 * Whether a quotation can still be paid against the stock that exists NOW.
 *
 * A quote holds a price, not the shelf. Nothing is set aside while it waits for payment - most
 * quotes take days or never convert, and holding for them would turn away customers ready to pay
 * today - so by the time a customer pays, the storefront may have sold what the quote was counting
 * on. This is the check at that moment, using the materials the admin put on the quote itself.
 */
final class QuoteStock
{
    /**
     * Every material the quote needs more of than is free (on hand minus what other orders hold).
     * Materials bought per order are skipped: there is no shelf to run out of.
     *
     * `preorder` is true when every line asking for that material is a product the owner allows
     * pre-orders on - the same promise the storefront checkout honours.
     *
     * @return array<int, array{inventoryId:string,name:?string,uom:?string,needed:int,available:int,short:int,leadTimeDays:int,preorder:bool}>
     */
    public static function shortages(OrderRequest $orderRequest): array
    {
        $needed = [];
        $askers = [];

        foreach ($orderRequest->lineItems ?? [] as $line) {
            $product  = !empty($line['productId']) ? Product::find($line['productId']) : null;
            $preorder = (bool) ($product->allowPreorder ?? false);

            foreach ($line['materials'] ?? [] as $material) {
                $inventoryId = (string) ($material['inventoryId'] ?? '');
                // Rounded the way reserveQuoteMaterials rounds it, so the check and the hold agree.
                $qty = (int) round((float) ($material['qty'] ?? 0));
                if ($inventoryId === '' || $qty <= 0) continue;

                $needed[$inventoryId]   = ($needed[$inventoryId] ?? 0) + $qty;
                $askers[$inventoryId][] = $preorder;
            }
        }

        $shortages = [];
        foreach ($needed as $inventoryId => $qty) {
            $inventory = Inventory::find($inventoryId);
            if (!$inventory || $inventory->isOnDemand) continue;

            $available = max(0, (int) ($inventory->stockQty ?? 0) - (int) ($inventory->reservedQty ?? 0));
            if ($available >= $qty) continue;

            $shortages[] = [
                'inventoryId'  => $inventoryId,
                'name'         => $inventory->name,
                'uom'          => $inventory->uom,
                'needed'       => $qty,
                'available'    => $available,
                'short'        => $qty - $available,
                'leadTimeDays' => (int) ($inventory->leadTimeDays ?? 0),
                'preorder'     => !in_array(false, $askers[$inventoryId], true),
            ];
        }

        return $shortages;
    }

    /**
     * Whether the customer may pay even though something is short.
     *
     * Yes when the owner allowed pre-order on this one quote - a negotiated deal decided on its
     * own, without opening pre-orders on the storefront for everyone - or when every short
     * material belongs to products that already allow pre-order.
     */
    public static function mayPayPastShelf(OrderRequest $orderRequest, array $shortages): bool
    {
        if (!$shortages) return true;
        if ((bool) ($orderRequest->allowPreorder ?? false)) return true;

        foreach ($shortages as $shortage) {
            if (empty($shortage['preorder'])) return false;
        }
        return true;
    }
}
