<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

class EnsureIndexes extends Command
{
    protected $signature = 'db:ensure-indexes';

    protected $description = 'Create MongoDB indexes for performance';

    public function handle()
    {
        $db = DB::connection('mongodb')->getMongoDB();

        // Orders
        $db->orders->createIndex(['orderStatus' => 1]);
        $db->orders->createIndex(['createdAt' => -1]);
        $db->orders->createIndex(['userId' => 1]);
        $db->orders->createIndex(['orderId' => 1], ['unique' => true, 'sparse' => true]);

        // Inventory (collection name matches Inventory model)
        $db->inventory->createIndex(['isActive' => 1]);
        $db->inventory->createIndex(['category' => 1]);
        $db->inventory->createIndex(['name' => 1]);
        $db->inventory->createIndex(['isActive' => 1, 'stockQty' => 1]);

        // Sales
        $db->sales->createIndex(['createdAt' => -1]);
        $db->sales->createIndex(['status' => 1]);

        // StockHistory
        $db->stock_history->createIndex(['inventoryId' => 1]);
        $db->stock_history->createIndex(['createdAt' => -1]);
        $db->stock_history->createIndex(['inventoryId' => 1, 'createdAt' => -1]);

        // Products
        $db->products->createIndex(['isPublished' => 1]);
        $db->products->createIndex(['category' => 1]);

        // Notifications
        $db->notifications->createIndex(['userId' => 1, 'is_read' => 1]);
        $db->notifications->createIndex(['createdAt' => -1]);

        // Job Orders
        $db->job_orders->createIndex(['status' => 1]);
        $db->job_orders->createIndex(['orderId' => 1]);

        // Audit Logs
        $db->audit_logs->createIndex(['createdAt' => -1]);
        $db->audit_logs->createIndex(['userId' => 1]);

        $this->info('All indexes created successfully.');

        return 0;
    }
}
