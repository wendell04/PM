<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        $db = DB::connection('mongodb')->getMongoDB();

        $orders = $db->selectCollection('orders');
        $orders->createIndex(['userId' => 1]);
        $orders->createIndex(['orderStatus' => 1]);
        $orders->createIndex(['status' => 1]);
        $orders->createIndex(['createdAt' => -1]);
        $orders->createIndex(
            ['userId' => 1, 'createdAt' => -1],
            ['name' => 'orders_userId_createdAt']
        );

        $carts = $db->selectCollection('carts');
        $carts->createIndex(
            ['userId' => 1],
            ['unique' => true, 'name' => 'carts_userId_unique']
        );

        $inventory = $db->selectCollection('inventory');
        $inventory->createIndex(['isActive' => 1]);
        $inventory->createIndex(['isOnDemand' => 1]);
        $inventory->createIndex(['supplierId' => 1]);
        $inventory->createIndex(
            ['isActive' => 1, 'supplierId' => 1],
            ['name' => 'inventory_isActive_supplierId']
        );
    }

    public function down(): void
    {
        $db = DB::connection('mongodb')->getMongoDB();

        $orders = $db->selectCollection('orders');
        $orders->dropIndex('orders_userId_createdAt');
        $orders->dropIndex(['userId' => 1]);
        $orders->dropIndex(['orderStatus' => 1]);
        $orders->dropIndex(['status' => 1]);
        $orders->dropIndex(['createdAt' => -1]);

        $carts = $db->selectCollection('carts');
        $carts->dropIndex('carts_userId_unique');

        $inventory = $db->selectCollection('inventory');
        $inventory->dropIndex('inventory_isActive_supplierId');
        $inventory->dropIndex(['isActive' => 1]);
        $inventory->dropIndex(['isOnDemand' => 1]);
        $inventory->dropIndex(['supplierId' => 1]);
    }
};
