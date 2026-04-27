<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use App\Models\Product;
use App\Models\Order;
use App\Models\Sale;
use App\Models\OrderRequest;

class CleanupTestProducts extends Command
{
    protected $signature   = 'cleanup:test-products';
    protected $description = 'Hard-delete test products Vinyl and Gig plus their associated orders/sales';

    public function handle(): int
    {
        /*
        $targets = ['Vinyl', 'Gig'];

        $products = Product::whereIn('name', $targets)->get();

        if ($products->isEmpty()) {
            $this->warn('No products named Vinyl or Gig found. Nothing to delete.');
            return 0;
        }

        $idStrs = $products->map(fn($p) => (string) $p->_id)->toArray();

        foreach ($products as $p) {
            $this->line("Found: {$p->name} — _id={$p->_id}");
        }

        $this->newLine();

        $orderCount = Order::where(function ($q) use ($idStrs) {
            $q->whereIn('productId', $idStrs)
              ->orWhereIn('product_id', $idStrs)
              ->orWhereIn('items.productId', $idStrs);
        })->delete();
        $this->line("orders: deleted {$orderCount} record(s)");

        $saleCount = Sale::where(function ($q) use ($idStrs) {
            $q->whereIn('productId', $idStrs)
              ->orWhereIn('product_id', $idStrs)
              ->orWhereIn('items.productId', $idStrs);
        })->delete();
        $this->line("sales: deleted {$saleCount} record(s)");

        $orCount = OrderRequest::where(function ($q) use ($idStrs) {
            $q->whereIn('productId', $idStrs)
              ->orWhereIn('product_id', $idStrs)
              ->orWhereIn('items.productId', $idStrs);
        })->delete();
        $this->line("order_requests: deleted {$orCount} record(s)");

        $prodCount = Product::whereIn('name', $targets)->delete();
        $this->line("products: deleted {$prodCount} product(s)");

        $this->newLine();
        $this->info('Done.');
        return 0;
        */
    }
}