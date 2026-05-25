<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use App\Models\Order;
use App\Models\StockHistory;
use Illuminate\Support\Facades\DB;

class FixStockHistoryMeta extends Command
{
    protected $signature   = 'inventory:fix-history-meta {--dry-run : Preview without making changes}';
    protected $description = 'Fix StockHistory records with missing customerName or zero totalCost';

    public function handle(): int
    {
        $dryRun = $this->option('dry-run');

        if ($dryRun) {
            $this->info('[DRY RUN] No changes will be made.');
        }

        $bad = StockHistory::whereNotNull('orderId')
            ->where(function ($q) {
                $q->whereNull('customerName')
                  ->orWhere('customerName', '')
                  ->orWhere('customerName', 'Unknown');
            })
            ->get();

        $this->info("Found {$bad->count()} records to fix.");

        $fixed = 0;

        foreach ($bad as $record) {
            $order = Order::find($record->orderId);
            if (!$order) {
                $this->line("  [SKIP] Order not found: {$record->orderId}");
                continue;
            }

            $customerName = $order->userSnapshot['name'] ?? trim(($order->firstName ?? '') . ' ' . ($order->lastName ?? ''));
            $totalCost    = (float) ($record->unitCost ?? 0) * (float) ($record->quantity ?? 0);

            $this->line("  [{$record->_id}] '{$record->customerName}' → '{$customerName}' | cost: {$record->totalCost} → {$totalCost}");

            if (!$dryRun) {
                DB::connection('mongodb')
                    ->getCollection('stock_histories')
                    ->updateOne(
                        ['_id' => new \MongoDB\BSON\ObjectId((string) $record->_id)],
                        ['$set' => [
                            'customerName' => $customerName,
                            'totalCost'    => $totalCost,
                        ]]
                    );
            }

            $fixed++;
        }

        $this->newLine();
        $this->info($dryRun ? "[DRY RUN] Would fix {$fixed} records." : "Fixed {$fixed} records.");

        return 0;
    }
}
