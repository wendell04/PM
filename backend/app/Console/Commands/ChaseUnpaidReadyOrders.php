<?php

namespace App\Console\Commands;

use App\Models\Order;
use App\Models\Notification;
use App\Models\User;
use App\Support\OrderStatus;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;

/**
 * Chase finished orders whose balance was never paid.
 *
 * Deliberately does NOT cancel or write anything off. Destroying personalised goods and forfeiting
 * someone's deposit is a decision a person makes, not a cron job - and a customer who pays on day 40
 * should still get their order. What automation IS good for is the part the shop forgets: telling
 * them, on a schedule, before the deadline arrives.
 *
 * That matters beyond courtesy. Forfeiting a deposit is only defensible if the customer was actually
 * warned, with a date, before it happened.
 */
class ChaseUnpaidReadyOrders extends Command
{
    protected $signature   = 'orders:chase-unpaid-ready {--dry-run : Show what would be sent without sending it}';
    protected $description = 'Remind customers whose finished order is waiting on its balance, and flag the ones past the holding period';

    public function handle(): int
    {
        $dry   = (bool) $this->option('dry-run');
        $owner = User::where('role', 'owner')->first();
        $hold  = max(1, (int) ($owner->unpaidReadyHoldDays ?? 14));

        // Escalating, then silence. A reminder every day is noise people learn to ignore, and the
        // final one has to name the deadline or the forfeiture is a surprise.
        $milestones = [3, 7, $hold - 3, $hold];

        $orders = Order::whereIn('orderStatus', [OrderStatus::READY_FOR_DELIVERY, OrderStatus::FOR_DELIVERY])
            ->whereNotNull('readyAt')
            ->get()
            ->filter(function ($o) {
                if (!empty($o->writeOff)) return false;
                if (strtolower((string) ($o->paymentMethod ?? '')) === 'cod') return false;
                if (($o->paymentStatus ?? '') === 'paid') return false;
                $paid = collect($o->paymentHistory ?? [])->sum(fn ($p) => (float) ($p['amount'] ?? 0));
                return round(max(0, (float) ($o->totalAmount ?? 0) - $paid), 2) > 0;
            });

        $sent = 0; $flagged = 0;

        foreach ($orders as $order) {
            $days = (int) floor(now()->diffInDays(\Carbon\Carbon::parse($order->readyAt), true));
            $paid = collect($order->paymentHistory ?? [])->sum(fn ($p) => (float) ($p['amount'] ?? 0));
            $owed = round(max(0, (float) ($order->totalAmount ?? 0) - $paid), 2);
            $ref  = $order->orderNumber ?: ('ORD-' . strtoupper(substr((string) $order->_id, -8)));

            if ($days >= $hold && empty($order->holdExpiredAt)) {
                // Past the deadline: surface it for a human, never act on it here.
                if (!$dry) {
                    $order->holdExpiredAt = now();
                    $order->save();
                }
                $flagged++;
                $this->warn("  {$ref}: {$days} days, P{$owed} owed - PAST the {$hold}-day hold, needs a decision");
                continue;
            }

            if (!in_array($days, $milestones, true)) continue;

            $isFinal = $days >= $hold - 3;
            $deadline = \Carbon\Carbon::parse($order->readyAt)->addDays($hold)->format('M j, Y');
            $message = $isFinal
                ? "Your order {$ref} is finished and still has a balance of P" . number_format($owed, 2) .
                  ". We can only hold it until {$deadline}. After that the downpayment is forfeited and the items may be disposed of, as set out in the order terms."
                : "Your order {$ref} is finished and waiting on a balance of P" . number_format($owed, 2) .
                  ". Settle it in My Orders and we will release it for delivery.";

            $this->line("  {$ref}: day {$days}, P{$owed} owed" . ($isFinal ? '  [final notice]' : ''));

            if ($dry) { $sent++; continue; }

            try {
                Notification::create([
                    'user_id'    => (string) $order->userId,
                    'type'       => 'balance_due_before_delivery',
                    'title'      => $isFinal ? 'Final notice - balance due' : 'Your order is ready',
                    'message'    => $message,
                    'is_read'    => false,
                    'data'       => ['orderId' => (string) $order->_id, 'balance' => $owed, 'deadline' => $deadline],
                    'created_at' => now(),
                ]);
                $order->balanceReminderAt = now();
                $order->save();
                $sent++;
            } catch (\Throwable $e) {
                Log::warning('chase-unpaid-ready failed', ['order' => (string) $order->_id, 'error' => $e->getMessage()]);
            }
        }

        $this->info(($dry ? '[dry run] ' : '') . "{$sent} reminder(s), {$flagged} order(s) past the {$hold}-day hold.");
        return self::SUCCESS;
    }
}
