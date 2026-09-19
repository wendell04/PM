<?php

namespace App\Console\Commands;

use App\Models\Inventory;
use App\Models\JobOrder;
use App\Models\Order;
use App\Models\Product;
use App\Support\OrderLine;
use Illuminate\Console\Command;

/**
 * php artisan inventory:reconcile-reservations [--apply]
 *
 * reservedQty is "held for open orders": raised when a produced order is placed, lowered when
 * the order is cancelled or the job passes QC. Anything that removes an order without going
 * through those paths (a test record deleted by hand, an old bug) leaves a phantom hold - the
 * shelf says "25 held" when only 20 mugs are really promised, and every "can build" is short
 * by the difference.
 *
 * This recomputes what SHOULD be held from the open orders themselves - every produced line
 * on an order that is not delivered/cancelled/returned and whose job order has not yet consumed
 * the material at QC - and reports the difference per material. Dry run by default.
 */
class ReconcileReservations extends Command
{
    protected $signature   = 'inventory:reconcile-reservations {--apply : Write the recomputed reservedQty}';
    protected $description = 'Recompute reservedQty per material from the open orders and fix phantom holds';

    public function handle(): int
    {
        $done   = ['delivered', 'Delivered', 'cancelled', 'Cancelled', 'returned', 'Returned'];
        $expect = [];   // inventoryId => qty
        $why    = [];   // inventoryId => [order refs]

        foreach (Order::whereNotIn('orderStatus', $done)->get() as $order) {
            $jobs = JobOrder::where('orderId', (string) $order->_id)->get();
            foreach ($order->items ?? [] as $idx => $item) {
                $product = Product::find($item['productId'] ?? null);
                if (!$product || !OrderLine::isProduced($product, (array) $item)) continue;
                // A job that passed QC (or finished) already consumed its material.
                $jo = $jobs->first(fn ($j) => (int) ($j->itemIndex ?? -1) === (int) $idx) ?? ($jobs->count() === 1 ? $jobs->first() : null);
                if ($jo && in_array($jo->joStatus, ['QC_Passed', 'Completed'], true)) continue;

                $materials = $item['materials'] ?? null;
                if (!$materials) {
                    $bom = $product->resolveBom($item['variantId'] ?? null);
                    $qty = max(1, (int) ($item['qty'] ?? 1));
                    $materials = array_map(fn ($c) => ['inventoryId' => $c['inventoryId'] ?? null, 'qty' => (float) ($c['qty'] ?? 0) * $qty], $bom->components ?? []);
                }
                foreach ($materials as $m) {
                    $id = (string) ($m['inventoryId'] ?? '');
                    if ($id === '' || (float) ($m['qty'] ?? 0) <= 0) continue;
                    $expect[$id] = ($expect[$id] ?? 0) + (float) $m['qty'];
                    $why[$id][] = strtoupper(substr((string) $order->_id, -8));
                }
            }
        }

        $rows = 0; $fixed = 0;
        foreach (Inventory::all() as $inv) {
            $id = (string) $inv->_id;
            if ($inv->isOnDemand) continue;   // never reserved; bought per order
            $have = (int) ($inv->reservedQty ?? 0);
            $want = (int) round($expect[$id] ?? 0);
            if ($have === $want) continue;
            $rows++;
            $this->line(sprintf('%-34s held %3d  should be %3d  (%s)', $inv->name, $have, $want, implode(', ', array_unique($why[$id] ?? [])) ?: 'no open orders'));
            if ($this->option('apply')) {
                $inv->reservedQty = $want;
                $inv->save();
                $fixed++;
            }
        }
        if ($rows === 0) $this->info('Every reservation matches its open orders.');
        elseif ($this->option('apply')) $this->info("Fixed {$fixed} material(s).");
        else $this->line('Dry run. Re-run with --apply to write.');
        return self::SUCCESS;
    }
}
