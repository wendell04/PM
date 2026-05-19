<?php

namespace Database\Seeders;

use App\Models\BillOfMaterial;
use App\Models\Inventory;
use App\Models\Order;
use App\Models\Product;
use App\Models\StockHistory;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Log;

/**
 * One-time seeder: retroactively creates StockHistory deduction records
 * and decrements inventory stockQty for scrunchie orders placed before
 * the per-combination bomId fix was applied to OrderController.
 *
 * Run once: php artisan db:seed --class=RetroactiveScrunchieStockDeductionSeeder
 * Safe to re-run: skips orders already processed (checks existing StockHistory).
 */
class RetroactiveScrunchieStockDeductionSeeder extends Seeder
{
    public function run(): void
    {
        // Find all orders containing a scrunchie product
        $orders = Order::all()->filter(function ($order) {
            return collect($order->items ?? [])->contains(function ($item) {
                $prod = Product::find($item['productId'] ?? null);
                return $prod && stripos($prod->name, 'scrunchie') !== false;
            });
        });

        if ($orders->isEmpty()) {
            $this->command->info('No scrunchie orders found.');
            return;
        }

        foreach ($orders as $order) {
            $orderId      = (string) $order->_id;
            $customerName = $order->userSnapshot['name'] ?? 'Unknown';

            // Skip if this order already has StockHistory records
            $alreadyProcessed = StockHistory::where('orderId', $orderId)->exists();
            if ($alreadyProcessed) {
                $this->command->warn("Order {$orderId} already has StockHistory records — skipping.");
                continue;
            }

            $this->command->info("Processing order {$orderId} — {$customerName}");

            foreach ($order->items ?? [] as $item) {
                $prod      = Product::find($item['productId'] ?? null);
                $variantId = $item['variantId'] ?? null;
                $itemQty   = (int) ($item['qty'] ?? 1);

                if (!$prod || stripos($prod->name, 'scrunchie') === false) continue;

                // Resolve BOM — same three-path logic as OrderController
                $bom = null;
                if (!empty($prod->bomGroupName) && $variantId) {
                    $bom = BillOfMaterial::find($variantId);
                } elseif (!empty($prod->bomId)) {
                    $bom = BillOfMaterial::find($prod->bomId);
                }
                if (!$bom && $variantId && !empty($prod->combinations)) {
                    foreach ($prod->combinations as $combo) {
                        if ((string) ($combo['id'] ?? $combo['_id'] ?? '') === (string) $variantId && !empty($combo['bomId'])) {
                            $bom = BillOfMaterial::find($combo['bomId']);
                            break;
                        }
                    }
                }

                if (!$bom || empty($bom->components)) {
                    $this->command->warn("  No BOM found for product {$prod->name} variant {$variantId} — skipping.");
                    continue;
                }

                $this->command->line("  Product: {$prod->name} × {$itemQty}");

                foreach ($bom->components as $component) {
                    $inv = Inventory::find($component['inventoryId'] ?? null);
                    if (!$inv || $inv->isOnDemand) continue;

                    $deductQty = (int) round(($component['qty'] ?? 0) * $itemQty);
                    if ($deductQty <= 0) continue;

                    $newStockQty = max(0, (int) ($inv->stockQty ?? 0) - $deductQty);

                    // Decrement actual stockQty
                    $inv->stockQty  = $newStockQty;
                    $inv->updatedAt = now();
                    $inv->save();

                    // Write StockHistory record
                    StockHistory::create([
                        'inventoryId'  => (string) $inv->_id,
                        'quantity'     => $deductQty,
                        'remainingQty' => $newStockQty,
                        'unitCost'     => (float) ($inv->averageCost ?? 0),
                        'totalCost'    => (float) ($inv->averageCost ?? 0) * $deductQty,
                        'reason'       => 'sale_reserved',
                        'type'         => 'deduction',
                        'performedBy'  => 'system_retroactive',
                        'orderId'      => $orderId,
                        'productId'    => (string) $prod->_id,
                        'productName'  => $prod->name ?? '',
                        'customerName' => $customerName,
                        'remarks'      => "Retroactive — Order: {$orderId}",
                        'createdAt'    => $order->createdAt ?? now(),
                    ]);

                    $this->command->line("    {$inv->name}: -{$deductQty} → {$newStockQty} remaining");
                }
            }

            $this->command->info("  Done: order {$orderId}");
        }

        $this->command->info('Retroactive scrunchie deduction complete.');
    }
}
