<?php

namespace App\Console\Commands;

use App\Models\Order;
use App\Models\User;
use App\Models\Notification;
use App\Models\RawMaterial;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;

/**
 * Release orders whose approved proof was never paid for.
 *
 * A request-design order pays only the design fee up front. Once the customer approves the proof the
 * goods fall due, and until they are paid the shop is holding stock it cannot sell - reservedQty is
 * taken at order creation, and a ready-made line is cut from stockQty outright. Without this the shelf
 * drains one abandoned order at a time, and the owner never sees why.
 *
 * The design fee is NOT refunded: the work was done and the fee is non-refundable by the terms the
 * customer accepted. Only the goods side is unwound.
 */
class ExpireUnpaidProofs extends Command
{
    protected $signature   = 'orders:expire-unpaid-proofs {--dry-run : List what would expire without touching anything}';
    protected $description = 'Cancel approved-but-unpaid custom orders past their payment due date and release reserved stock';

    public function handle(): int
    {
        $dry = (bool) $this->option('dry-run');

        $due = Order::where('orderStatus', 'awaiting_payment')
            ->where('paymentStatus', 'unpaid')
            ->whereNotNull('paymentDueAt')
            ->where('paymentDueAt', '<', now())
            ->get();

        // Orders that were placed and then simply never paid for. These hold stock exactly as hard as
        // an approved order does, and nothing else in the system ever lets go of it.
        //
        // The trap this deliberately avoids: on a request-design order `paymentStatus` stays 'unpaid'
        // AFTER the design fee clears, because the fee is accounted separately from the goods. Timing
        // out on paymentStatus alone would kill orders the designer is actively working on and that the
        // customer has already paid for. So this only touches orders where NOTHING has been received -
        // no design fee, no deposit, no payment history at all - and never one that has moved past
        // placement into the design or production workflow.
        $days = max(1, (int) (User::where('role', 'owner')->first()->unpaidOrderDays ?? 3));
        $cutoff = now()->subDays($days);

        $stale = Order::where('paymentStatus', 'unpaid')
            ->where(function ($q) {
                $q->whereNull('designFeePaid')->orWhere('designFeePaid', false);
            })
            ->whereIn('orderStatus', ['Pending', 'pending', 'awaiting_payment'])
            ->where('createdAt', '<', $cutoff)
            ->get()
            ->filter(fn ($o) => empty($o->paymentHistory))
            ->reject(fn ($o) => $due->contains(fn ($d) => (string) $d->_id === (string) $o->_id));

        if ($stale->isNotEmpty()) {
            $this->line("Also expiring {$stale->count()} order(s) unpaid for more than {$days} day(s).");
            $due = $due->concat($stale);
        }

        if ($due->isEmpty()) {
            $this->info('Nothing to expire.');
            return self::SUCCESS;
        }

        $released = 0;
        foreach ($due as $order) {
            $orderId = (string) $order->_id;
            $this->line(($dry ? '[dry] ' : '') . "Expiring {$orderId} (due {$order->paymentDueAt})");
            if ($dry) { continue; }

            try {
                // Give back only what was actually held. A line that never reserved anything - because
                // the material is on-demand, or the record has since gone - is skipped rather than
                // guessed at; inventing stock is worse than leaving it short.
                foreach (($order->items ?? []) as $item) {
                    foreach (($item['materials'] ?? []) as $mat) {
                        $raw = RawMaterial::find($mat['materialId'] ?? null);
                        if (!$raw || ($raw->isOnDemand ?? false)) continue;
                        $qty = (int) ($mat['qty'] ?? 0);
                        if ($qty <= 0) continue;
                        $raw->reservedQty = max(0, (int) ($raw->reservedQty ?? 0) - $qty);
                        $raw->save();
                        $released++;
                    }
                }

                $history   = $order->statusHistory ?? [];
                $history[] = ['status' => 'cancelled', 'at' => now()->toISOString(), 'note' => 'Deposit not paid before the hold expired.'];

                $order->orderStatus    = 'cancelled';
                $order->statusHistory  = $history;
                $order->cancelledAt    = now();
                $order->cancelReason   = 'The deposit was not paid before the approved proof expired.';
                $order->updatedAt      = now();
                $order->save();

                try {
                    Notification::create([
                        'userId'  => (string) $order->userId,
                        'type'    => 'order_expired',
                        'title'   => 'Order expired',
                        'message' => $order->paymentDueAt
                            ? 'Your approved design was held until ' . \Carbon\Carbon::parse($order->paymentDueAt)->format('M j, Y')
                                . ', but the payment was not completed, so the order has been released. Message us and we can set it up again.'
                            : 'This order was not paid for, so it has been released and the stock returned. Message us and we can set it up again.',
                        'orderId' => $orderId,
                        'read'    => false,
                    ]);
                } catch (\Throwable $e) {
                    Log::warning('ExpireUnpaidProofs: notification failed', ['order' => $orderId, 'error' => $e->getMessage()]);
                }
            } catch (\Throwable $e) {
                Log::warning('ExpireUnpaidProofs: failed', ['order' => $orderId, 'error' => $e->getMessage()]);
            }
        }

        $this->info(($dry ? 'Would expire ' : 'Expired ') . $due->count() . ' order(s)'
            . ($dry ? '' : ", released {$released} material reservation(s)"));
        return self::SUCCESS;
    }
}
