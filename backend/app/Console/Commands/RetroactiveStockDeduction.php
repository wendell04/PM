<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use App\Models\Order;
use App\Models\Product;
use App\Models\BillOfMaterial;
use App\Models\Inventory;
use App\Models\StockHistory;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class RetroactiveStockDeduction extends Command
{
    protected $signature   = 'inventory:retroactive-deduct {--dry-run : Preview without making changes}';
    protected $description = 'Retroactively deduct inventory for orders that have no stock out history';

    public function handle(): int
    {
        $dryRun = $this->option('dry-run');

        if ($dryRun) {
            $this->info('[DRY RUN] No changes will be made.');
        }

        // Get all order IDs that already have stock history
        $coveredOrderIds = StockHistory::whereNotNull('orderId')
            ->pluck('orderId')
            ->unique()
            ->map(fn($id) => (string) $id)
            ->toArray();

        // Get all non-cancelled orders
        $orders = Order::whereNotIn('orderStatus', ['cancelled', 'Cancelled'])
            ->orderBy('createdAt', 'asc')
            ->get();

        $this->info("Total orders: {$orders->count()} | Already covered: " . count($coveredOrderIds));

        $processedOrders = 0;
        $skippedOrders   = 0;
        $totalDeductions = 0;

        foreach ($orders as $order) {
            $orderId = (string) $order->_id;

            if (in_array($orderId, $coveredOrderIds, true)) {
                $skippedOrders++;
                continue;
            }

            $items        = $order->items ?? [];
            $customerName = $order->userSnapshot['name'] ?? '';

            if (empty($items)) {
                $this->line("  [SKIP] Order {$orderId} — no items");
                $skippedOrders++;
                continue;
            }

            $this->line("\nOrder: " . strtoupper(substr($orderId, -8)) . " | Customer: {$customerName} | Items: " . count($items));

            $orderHadDeduction = false;

            foreach ($items as $item) {
                $prod      = Product::find($item['productId'] ?? null);
                $variantId = $item['variantId'] ?? null;

                if (!$prod) {
                    $this->line("  [SKIP] Product not found: " . ($item['productId'] ?? 'null'));
                    continue;
                }

                // ── BOM lookup (same 3-path logic as OrderController::store) ──
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
                    $this->line("  [SKIP] {$prod->name} — no BOM linked");
                    continue;
                }

                foreach ($bom->components as $component) {
                    $rawInv = Inventory::find($component['inventoryId'] ?? null);
                    if (!$rawInv || $rawInv->isOnDemand) continue;

                    $deductQty = (int) round(($component['qty'] ?? 0) * ($item['qty'] ?? 1));
                    if ($deductQty <= 0) continue;

                    $matName  = $rawInv->name ?? 'Unknown';
                    $unitCost = (float) ($rawInv->averageCost ?? 0);

                    $this->line("  → {$prod->name} | Material: {$matName} | Deduct: -{$deductQty}");

                    if (!$dryRun) {
                        // Decrement stockQty directly (no FIFO batch touch for retroactive)
                        $invId   = (string) $rawInv->_id;
                        $updated = DB::connection('mongodb')
                            ->getCollection('inventories')
                            ->findOneAndUpdate(
                                ['_id' => new \MongoDB\BSON\ObjectId($invId)],
                                ['$inc' => ['stockQty' => -$deductQty]],
                                ['returnDocument' => \MongoDB\Operation\FindOneAndUpdate::RETURN_DOCUMENT_AFTER]
                            );

                        $newQty = (int) ($updated->stockQty ?? max(0, ($rawInv->stockQty ?? 0) - $deductQty));

                        StockHistory::create([
                            'inventoryId'  => (string) $rawInv->_id,
                            'quantity'     => $deductQty,
                            'remainingQty' => $newQty,
                            'unitCost'     => $unitCost,
                            'totalCost'    => $unitCost * $deductQty,
                            'reason'       => 'sale_reserved',
                            'type'         => 'deduction',
                            'orderId'      => (string) $order->_id,
                            'productId'    => (string) $prod->_id,
                            'productName'  => $prod->name ?? '',
                            'customerName' => $customerName,
                            'performedBy'  => 'system_retroactive',
                            'remarks'      => 'Retroactive — Order: ' . (string) $order->_id,
                            'createdAt'    => $order->createdAt ?? now(),
                        ]);
                    }

                    $totalDeductions++;
                    $orderHadDeduction = true;
                }
            }

            if ($orderHadDeduction) {
                $processedOrders++;
            } else {
                $skippedOrders++;
            }
        }

        $this->newLine();
        $this->info("Done.");
        $this->table(
            ['Metric', 'Count'],
            [
                ['Orders processed',         $processedOrders],
                ['Orders skipped (no BOM)',   $skippedOrders],
                ['Total material deductions', $totalDeductions],
            ]
        );

        if ($dryRun) {
            $this->warn('This was a dry run. Re-run without --dry-run to apply changes.');
        }

        return 0;
    }
}
