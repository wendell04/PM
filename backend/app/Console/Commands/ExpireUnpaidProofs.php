<?php

namespace App\Console\Commands;

use App\Models\Order;
use App\Support\PromotionRelease;
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

        // A proof nobody answered. Its own rule, run first: the path below returns as soon as it
        // has nothing to expire.
        $this->closeUnansweredProofs($dry);

        // A day's warning first. The customer was told the date when they approved, but the next
        // thing they heard was "cancelled". This runs nightly, so anything falling due within the
        // next 36 hours is warned once - the stamp stops a second reminder the night after.
        $soon = Order::where('orderStatus', 'awaiting_payment')
            ->where('paymentStatus', 'unpaid')
            ->whereNotNull('paymentDueAt')
            ->where('paymentDueAt', '>=', now())
            ->where('paymentDueAt', '<', now()->addHours(36))
            ->whereNull('paymentDueRemindedAt')
            ->get();
        foreach ($soon as $o) {
            $this->line(($dry ? '[dry] ' : '') . 'Reminding ' . (string) $o->_id . " (due {$o->paymentDueAt})");
            if ($dry) continue;
            $paid  = collect($o->paymentHistory ?? [])->sum('amount');
            $owed  = max(0, round((float) ($o->totalAmount ?? 0) - $paid, 2));
            $pct   = (int) ($o->downpaymentPercent ?? 0);
            $amount = 'P' . number_format($pct > 0 ? round($owed * $pct / 100, 2) : $owed, 2);
            \App\Support\OrderNotifier::paymentDueAfterApproval($o, $amount,
                \Carbon\Carbon::parse($o->paymentDueAt)->format('M j, Y'), true);
            $o->paymentDueRemindedAt = now();
            $o->save();
        }

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
        $days = max(1, (int) (\App\Support\ShopSettings::owner()->unpaidOrderDays ?? 3));
        $cutoff = now()->subDays($days);

        $stale = Order::where('paymentStatus', 'unpaid')
            ->where(function ($q) {
                $q->whereNull('designFeePaid')->orWhere('designFeePaid', false);
            })
            ->whereIn('orderStatus', ['Pending', 'pending', 'awaiting_payment'])
            ->where('createdAt', '<', $cutoff)
            ->get()
            ->filter(fn ($o) => empty($o->paymentHistory))
            // Unfinished online checkouts are orders:void-abandoned-checkouts' job, within the hour.
            ->reject(fn ($o) => (bool) ($o->checkoutPending ?? false) || (bool) ($o->voidedCheckout ?? false))
            // Cash on delivery is unpaid by definition until the rider collects. Left in, any COD
            // order still at Pending after the cut-off was cancelled overnight as "never paid".
            ->reject(fn ($o) => in_array(strtolower((string) ($o->paymentMethod ?? '')), array_map('strtolower', \App\Support\PaymentMethod::codAliases()), true))
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

                // What checkout actually claimed - BOM holds, ready-made deductions, owed quantities,
                // quote holds. The loop above only understands a legacy shape, so on its own it
                // released nothing for an order placed today.
                app(\App\Http\Controllers\OrderController::class)->releaseReservationsFor($order);

                $history   = $order->statusHistory ?? [];
                $history[] = ['status' => 'cancelled', 'at' => now()->toISOString(), 'note' => 'Deposit not paid before the hold expired.'];

                $order->orderStatus    = 'cancelled';
                $order->statusHistory  = $history;
                $order->cancelledAt    = now();
                $order->cancelReason   = 'The deposit was not paid before the approved proof expired.';
                $order->updatedAt      = now();
                $order->save();
                // This path cancels without restoreStockOnCancel, so it releases promotions itself.
                PromotionRelease::forCancelledOrder($order);

                try {
                    // user_id / is_read / data: the model's own names. This wrote userId, read and
                    // orderId, which are not fillable, so every one of these notices was saved with
                    // no recipient and no customer ever saw one.
                    Notification::create([
                        'user_id' => (string) $order->userId,
                        'type'    => 'order_expired',
                        'title'   => 'Order expired',
                        'message' => $order->paymentDueAt
                            ? 'Your approved design was held until ' . \Carbon\Carbon::parse($order->paymentDueAt)->format('M j, Y')
                                . ', but the payment was not completed, so the order has been released. Message us and we can set it up again.'
                            : 'This order was not paid for, so it has been released and the stock returned. Message us and we can set it up again.',
                        'data'    => ['orderId' => $orderId],
                        'is_read' => false,
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

    /**
     * Close a request-design order whose proof the customer never answered.
     *
     * The terms' "If you do not answer a proof" clause: {proofReplyDays} days after the latest proof
     * went out, with a reminder the day before, an order still waiting on the customer is closed.
     * Nothing was made, so there is nothing to refund but the goods deposit, if any was paid - and
     * the design fee stays with the designer for the work done.
     *
     * Only an order whose ACCEPTED terms (the snapshot taken at checkout) carry that clause. An order
     * placed before the clause existed was never told about it, so it is left for the owner.
     */
    private function closeUnansweredProofs(bool $dry): void
    {
        $days  = max(3, (int) (\App\Support\ShopSettings::owner()->proofReplyDays ?? 14));
        $title = 'If you do not answer a proof';

        $waiting = Order::whereIn('orderStatus', ['proof_sent', 'Proof Sent'])->get()->filter(function ($o) use ($title) {
            // Asked for changes = the shop's turn, not the customer's.
            if (in_array((string) ($o->designStatus ?? ''), ['revision_requested', 'rejected', 'approved'], true)) return false;
            foreach ((array) ($o->agreedTermsSnapshot ?? []) as $c) {
                if (trim((string) (((array) $c)['title'] ?? '')) === $title) return true;
            }
            return false;
        });

        foreach ($waiting as $o) {
            // When the latest proof went out: the last proof_sent entry in the status history.
            $sentAt = null;
            foreach ((array) ($o->statusHistory ?? []) as $h) {
                $h = (array) $h;
                if (($h['status'] ?? null) === 'proof_sent' && !empty($h['at'])) $sentAt = $h['at'];
            }
            if (!$sentAt) continue;
            try { $sent = \Carbon\Carbon::parse($sentAt); } catch (\Throwable $e) { continue; }
            $deadline = $sent->copy()->addDays($days);
            $id  = (string) $o->_id;
            $ref = 'ORD-' . strtoupper(substr($id, -8));

            // The day before: remind once per proof (a new proof resets the clock and the reminder).
            if (now()->lt($deadline)) {
                $reminded = $o->proofReplyRemindedAt ? \Carbon\Carbon::parse($o->proofReplyRemindedAt) : null;
                if (now()->gte($deadline->copy()->subDay()) && (!$reminded || $reminded->lt($sent))) {
                    $this->line(($dry ? '[dry] ' : '') . "Reminding {$ref}: proof unanswered, closes " . $deadline->format('M j'));
                    if ($dry) continue;
                    try {
                        Notification::create([
                            'user_id' => (string) $o->userId,
                            'type'    => 'proof_reply_due',
                            'title'   => 'Your proof is waiting for you',
                            'message' => "Please approve the proof for {$ref} or ask for changes by " . $deadline->format('M j, Y')
                                . '. If we do not hear from you, the order will be closed (the design fee is kept for the work done). Need more time? Message us.',
                            'data'    => ['orderId' => $id],
                            'is_read' => false,
                        ]);
                    } catch (\Throwable $e) {
                        Log::warning('closeUnansweredProofs: reminder failed', ['order' => $id, 'error' => $e->getMessage()]);
                    }
                    $o->proofReplyRemindedAt = now();
                    $o->save();
                }
                continue;
            }

            $this->line(($dry ? '[dry] ' : '') . "Closing {$ref}: proof sent " . $sent->format('M j') . ", no answer in {$days} days");
            if ($dry) continue;
            try {
                app(\App\Http\Controllers\OrderController::class)->releaseReservationsFor($o);
                $previous = $o->orderStatus;
                $history   = (array) ($o->statusHistory ?? []);
                $history[] = ['status' => 'cancelled', 'at' => now()->toISOString(), 'note' => "Proof not answered within {$days} days."];
                $o->orderStatus   = 'cancelled';
                $o->statusHistory = $history;
                $o->cancelledAt   = now();
                $o->cancelReason  = "The proof was not answered within {$days} days. The design fee is kept for the work done.";
                $o->updatedAt     = now();
                $o->save();
                PromotionRelease::forCancelledOrder($o);
                // The one announcer: email and bell to the customer, the same as any cancellation.
                try { \App\Support\OrderNotifier::statusChanged($o, $previous); } catch (\Throwable $e) {
                    Log::warning('closeUnansweredProofs: notify failed', ['order' => $id, 'error' => $e->getMessage()]);
                }
            } catch (\Throwable $e) {
                Log::warning('closeUnansweredProofs: failed', ['order' => $id, 'error' => $e->getMessage()]);
            }
        }
    }
}
