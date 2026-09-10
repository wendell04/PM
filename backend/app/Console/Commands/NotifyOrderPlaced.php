<?php

namespace App\Console\Commands;

use App\Models\Order;
use App\Support\OrderNotifier;
use Illuminate\Console\Command;

/**
 * Send the order-placed notifications for an order that already exists.
 *
 * Orders created through PaymentController were built in silence until OrderNotifier existed, so
 * the ones already placed have a customer who paid and was never written to, and a shop that was
 * never told. This sends what they should have had, without touching the order.
 *
 * It is also the way to check the mail path end to end without spending money on a test order.
 *
 *   php artisan orders:notify-placed A00B65BF
 *   php artisan orders:notify-placed A00B65BF --dry-run
 */
class NotifyOrderPlaced extends Command
{
    protected $signature = 'orders:notify-placed
                            {order : Full order id, or the last 8 characters shown as ORD-XXXXXXXX}
                            {--dry-run : Show who would be written to and send nothing}
                            {--base= : Override FRONTEND_URL for this send, so a mail triggered from
                                       a developer machine links to the live site rather than localhost}';

    protected $description = 'Re-send the order-placed emails and admin notice for one existing order';

    public function handle(): int
    {
        // Links in the mail are built from config, and a send triggered from a laptop would
        // otherwise hand the customer a localhost address.
        if ($base = $this->option('base')) {
            config(['app.frontend_url' => rtrim($base, '/')]);
        }

        $ref   = trim($this->argument('order'));
        $short = strtoupper(preg_replace('/^ORD-/i', '', $ref));

        $order = strlen($ref) === 24 ? Order::find($ref) : null;

        if (!$order) {
            // Mongo cannot match on the tail of an _id without an aggregation, and this runs once
            // in a while against a few hundred rows, so it is not worth one.
            foreach (Order::orderBy('createdAt', 'desc')->limit(1000)->get() as $candidate) {
                if (strtoupper(substr((string) $candidate->_id, -8)) === $short) {
                    $order = $candidate;
                    break;
                }
            }
        }

        if (!$order) {
            $this->error("No order matched '{$ref}'.");
            return self::FAILURE;
        }

        $customer = $order->userSnapshot['email'] ?? null;
        $owner    = config('mail.admin_recipient');

        $this->line('Order    : ORD-' . strtoupper(substr((string) $order->_id, -8)) . '  (' . $order->_id . ')');
        $this->line('Status   : ' . ($order->orderStatus ?? '-') . ' / ' . ($order->paymentStatus ?? '-'));
        $this->line('Total    : P' . number_format((float) ($order->totalAmount ?? 0), 2));
        $this->line('Customer : ' . ($customer ?: 'NONE - no confirmation can be sent'));
        $this->line('Owner    : ' . ($owner ?: 'NONE - mail.admin_recipient is not set'));
        $this->line('Sending as: ' . config('mail.from.address') . ' via ' . config('mail.default'));
        $this->line('Links to  : ' . (config('app.frontend_url') ?: 'NONE - links will be omitted'));

        if ($this->option('dry-run')) {
            $this->warn('Dry run - nothing sent.');
            return self::SUCCESS;
        }

        // Render before sending. The notifier swallows its own errors - correctly, since it
        // normally runs after the money has moved - and that swallowed a broken Blade template
        // while this command cheerfully reported "Sent".
        try {
            $order->refresh();
            OrderNotifier::placed($order);
        } catch (\Throwable $e) {
            $this->error('Failed: ' . $e->getMessage());
            return self::FAILURE;
        }

        $this->info('Sent.');

        return self::SUCCESS;
    }
}
