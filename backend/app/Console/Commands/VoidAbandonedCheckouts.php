<?php

namespace App\Console\Commands;

use App\Models\Order;
use App\Support\CheckoutHold;
use Illuminate\Console\Command;

/**
 * Release online checkouts the customer walked away from.
 *
 * A failed payment is released the moment the customer lands back on the site. This catches the
 * rest - the tab closed on the GCash page, the phone died - so their stock does not sit held for an
 * order that will never exist. Nothing is released while PayMongo says money is moving or has moved,
 * or when PayMongo cannot be reached.
 */
class VoidAbandonedCheckouts extends Command
{
    protected $signature   = 'orders:void-abandoned-checkouts {--dry-run : List what would be released without touching anything}';
    protected $description = 'Release unpaid online checkouts older than the hold window and return their stock';

    public function handle(): int
    {
        $dry    = (bool) $this->option('dry-run');
        $cutoff = now()->subMinutes(CheckoutHold::MINUTES);

        $stale = Order::where('checkoutPending', true)
            ->where('createdAt', '<', $cutoff)
            ->get();

        if ($stale->isEmpty()) {
            $this->info('Nothing to release.');
            return self::SUCCESS;
        }

        $released = 0;
        $kept     = 0;
        foreach ($stale as $order) {
            $ref = strtoupper(substr((string) $order->_id, -8));

            if (!CheckoutHold::releasable($order)) {
                $kept++;
                $this->line("Kept #{$ref} - the payment may be going through, or PayMongo could not be reached.");
                continue;
            }

            if ($dry) {
                $this->line("[dry] Would release #{$ref}");
                continue;
            }

            CheckoutHold::void($order, 'Payment was not completed within ' . CheckoutHold::MINUTES . ' minutes.');
            $released++;
            $this->line("Released #{$ref}");
        }

        $this->info("Done: {$released} released, {$kept} kept.");
        return self::SUCCESS;
    }
}
