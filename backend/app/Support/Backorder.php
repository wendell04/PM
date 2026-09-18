<?php

namespace App\Support;

use App\Models\Inventory;
use App\Models\Order;
use App\Models\StockHistory;
use Illuminate\Support\Facades\Log;

/**
 * Ready-made goods sold past the shelf.
 *
 * A ready-made line takes its material off the shelf the moment the order exists. When the shelf
 * cannot cover it - a pre-order, or a quote paid after the storefront sold what it was counting
 * on - the deduction used to stop at zero (or, on two checkout paths, run the stock negative), and
 * the missing units were simply gone: no hold, nothing in To Buy, nothing anyone would see.
 *
 * Now the line takes what is free and the remainder is OWED: held against the material, recorded
 * on the order as `backorders`, counted in To Buy, and taken off the shelf when the order leaves
 * (For Delivery or Delivered). Cancelling gives the hold back.
 */
final class Backorder
{
    /**
     * How much of `qty` the shelf can give right now without touching what other orders hold,
     * and how much would be owed. Call it after releasing any hold this same order placed.
     *
     * @return array{0:int,1:int} [take, owed]
     */
    public static function split(string $inventoryId, int $qty): array
    {
        if ($qty <= 0) return [0, 0];

        $inventory = Inventory::find($inventoryId);
        if (!$inventory) return [$qty, 0];

        $free = max(0, (int) ($inventory->stockQty ?? 0) - (int) ($inventory->reservedQty ?? 0));
        $take = min($qty, $free);

        return [$take, $qty - $take];
    }

    /** Hold the owed part and write the paper trail for it. */
    public static function hold(string $inventoryId, int $owed, string $orderId, array $meta = []): void
    {
        if ($owed <= 0) return;

        MaterialClaim::hold($inventoryId, $owed);

        try {
            $inventory = Inventory::find($inventoryId);
            StockHistory::create([
                'inventoryId'  => $inventoryId,
                'quantity'     => $owed,
                'remainingQty' => (int) ($inventory->stockQty ?? 0),
                'unitCost'     => 0,
                'totalCost'    => 0,
                'reason'       => 'backorder_held',
                'type'         => 'reservation',
                'performedBy'  => 'system',
                'orderId'      => $orderId,
                'productId'    => $meta['productId'] ?? null,
                'productName'  => $meta['productName'] ?? '',
                'customerName' => $meta['customerName'] ?? '',
                'remarks'      => "Owed - not enough on the shelf for order {$orderId}. Shows in To Buy.",
                'createdAt'    => now(),
            ]);
        } catch (\Throwable $e) {
            Log::warning('Backorder::hold history failed', ['error' => $e->getMessage()]);
        }
    }

    /**
     * Merge owed amounts into one entry per material, the shape stored on the order.
     *
     * @param  array<int, array{inventoryId:string,qty:int}>  $entries
     */
    public static function merge(array $existing, array $entries): array
    {
        $byId = [];
        foreach (array_merge($existing, $entries) as $entry) {
            $id  = (string) ($entry['inventoryId'] ?? '');
            $qty = (int) ($entry['qty'] ?? 0);
            if ($id === '' || $qty <= 0) continue;
            $byId[$id] = ($byId[$id] ?? 0) + $qty;
        }
        return array_map(fn ($id, $qty) => ['inventoryId' => $id, 'qty' => $qty], array_keys($byId), array_values($byId));
    }

    /**
     * The order is leaving: turn every owed hold into a real deduction.
     *
     * Shipped means the goods existed, whether or not they were ever stocked in - so the full owed
     * amount is taken (the deduction itself stops at zero) rather than holding on for stock that
     * the system may never be told about. Idempotent: settled entries move to backordersSettled.
     *
     * @param callable(Inventory,int):void $deduct the caller's FIFO deduction
     */
    public static function settle(Order $order, callable $deduct): void
    {
        $owed = $order->backorders ?? [];
        if (!$owed) return;

        $settled = $order->backordersSettled ?? [];
        foreach ($owed as $entry) {
            $inventoryId = (string) ($entry['inventoryId'] ?? '');
            $qty         = (int) ($entry['qty'] ?? 0);
            if ($inventoryId === '' || $qty <= 0) continue;

            try {
                MaterialClaim::release($inventoryId, $qty);
                $inventory = Inventory::find($inventoryId);
                if ($inventory) $deduct($inventory, $qty);
                $settled[] = ['inventoryId' => $inventoryId, 'qty' => $qty, 'at' => now()->toISOString()];
            } catch (\Throwable $e) {
                Log::warning('Backorder::settle failed', ['orderId' => (string) $order->_id, 'inventoryId' => $inventoryId, 'error' => $e->getMessage()]);
            }
        }

        $order->backorders        = [];
        $order->backordersSettled = $settled;
        $order->save();
    }

    /**
     * Give back what a cancelled order still owes (holds only - nothing was taken for those).
     * Returns nothing; settled entries were real deductions and the caller restocks them.
     */
    public static function releaseForCancel(Order $order): void
    {
        foreach ($order->backorders ?? [] as $entry) {
            $inventoryId = (string) ($entry['inventoryId'] ?? '');
            $qty         = (int) ($entry['qty'] ?? 0);
            if ($inventoryId === '' || $qty <= 0) continue;
            try {
                MaterialClaim::release($inventoryId, $qty);
                StockHistory::create([
                    'inventoryId'  => $inventoryId,
                    'quantity'     => $qty,
                    'remainingQty' => (int) (Inventory::find($inventoryId)->stockQty ?? 0),
                    'unitCost'     => 0,
                    'totalCost'    => 0,
                    'reason'       => 'reservation_released',
                    'type'         => 'reservation',
                    'performedBy'  => 'system',
                    'orderId'      => (string) $order->_id,
                    'remarks'      => 'Order cancelled - owed quantity no longer needed: ' . (string) $order->_id,
                    'createdAt'    => now(),
                ]);
            } catch (\Throwable $e) {
                Log::warning('Backorder::releaseForCancel failed', ['orderId' => (string) $order->_id, 'error' => $e->getMessage()]);
            }
        }
    }

    /** Owed quantity per material, for the cancel path's arithmetic. */
    public static function owedMap(Order $order): array
    {
        $map = [];
        foreach ($order->backorders ?? [] as $entry) {
            $id = (string) ($entry['inventoryId'] ?? '');
            if ($id === '') continue;
            $map[$id] = ($map[$id] ?? 0) + (int) ($entry['qty'] ?? 0);
        }
        return $map;
    }
}
