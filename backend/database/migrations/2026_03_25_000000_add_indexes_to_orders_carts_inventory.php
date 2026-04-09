<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        // Orders collection indexes
        DB::connection('mongodb')->getCollection('orders')->createIndex(['userId' => 1]);
        DB::connection('mongodb')->getCollection('orders')->createIndex(['orderStatus' => 1]);
        DB::connection('mongodb')->getCollection('orders')->createIndex(['status' => 1]);
        DB::connection('mongodb')->getCollection('orders')->createIndex(['createdAt' => -1]);
        DB::connection('mongodb')->getCollection('orders')->createIndex(
            ['userId' => 1, 'createdAt' => -1],
            ['name' => 'orders_userId_createdAt']
        );

        // Carts collection indexes (unique on userId)
        DB::connection('mongodb')->getCollection('carts')->createIndex(
            ['userId' => 1],
            ['unique' => true, 'name' => 'carts_userId_unique']
        );

        // Inventory collection indexes
        DB::connection('mongodb')->getCollection('inventory')->createIndex(['isActive' => 1]);
        DB::connection('mongodb')->getCollection('inventory')->createIndex(['isOnDemand' => 1]);
        DB::connection('mongodb')->getCollection('inventory')->createIndex(['supplierId' => 1]);
        DB::connection('mongodb')->getCollection('inventory')->createIndex(
            ['isActive' => 1, 'supplierId' => 1],
            ['name' => 'inventory_isActive_supplierId']
        );
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        // Drop named compound indexes
        DB::connection('mongodb')->getCollection('orders')->dropIndex('orders_userId_createdAt');
        DB::connection('mongodb')->getCollection('carts')->dropIndex('carts_userId_unique');
        DB::connection('mongodb')->getCollection('inventory')->dropIndex('inventory_isActive_supplierId');

        // Drop simple indexes (by key pattern)
        DB::connection('mongodb')->getCollection('orders')->dropIndex(['userId' => 1]);
        DB::connection('mongodb')->getCollection('orders')->dropIndex(['orderStatus' => 1]);
        DB::connection('mongodb')->getCollection('orders')->dropIndex(['status' => 1]);
        DB::connection('mongodb')->getCollection('orders')->dropIndex(['createdAt' => -1]);

        DB::connection('mongodb')->getCollection('carts')->dropIndex(['userId' => 1]);

        DB::connection('mongodb')->getCollection('inventory')->dropIndex(['isActive' => 1]);
        DB::connection('mongodb')->getCollection('inventory')->dropIndex(['isOnDemand' => 1]);
        DB::connection('mongodb')->getCollection('inventory')->dropIndex(['supplierId' => 1]);
    }
};
