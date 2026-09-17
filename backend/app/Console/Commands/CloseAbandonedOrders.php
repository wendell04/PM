<?php

namespace App\Console\Commands;

use App\Http\Controllers\OrderController;
use App\Models\JobOrder;
use App\Models\Order;
use App\Models\User;
use App\Support\OrderStatus;
use Illuminate\Console\Command;
use Illuminate\Http\Request;

/**
 * Close the orders a test run left behind, the way the Orders screen would close them one by one.
 *
 * An order whose promised date has passed is either finished or abandoned. This picks the outcome
 * that is true for each and applies it through the SAME code the dashboard buttons run, so stock,
 * job orders, sales rows, delivery fees and the audit trail all behave as if the owner had clicked:
 *
 *   - produced (every job order passed QC) and fully paid  -> Delivered
 *   - anything else (never produced, or never paid)         -> Cancelled, reason recorded
 *
 * Cancelling returns ready-made stock to the shelf. Nothing is refunded: every payment so far went
 * through PayMongo in test mode, so there is no money to give back - the reason says so. Customers
 * are not notified; a "your order is on its way" to a survey participant would only confuse.
 */
class CloseAbandonedOrders extends Command
{
    protected $signature = 'orders:close-abandoned
        {--before= : Close orders promised before this date (YYYY-MM-DD, default today)}
        {--apply : Make the changes (without it, only shows what would happen)}';

    protected $description = 'Deliver or cancel open orders that are past their promised delivery date, through the normal order-update path';

    public function handle(): int
    {
        $before = $this->option('before') ? \Carbon\Carbon::parse($this->option('before'))->startOfDay() : now()->startOfDay();
        $admin  = User::whereIn('role', ['superAdmin', 'admin', 'owner'])->orderBy('role')->first();
        if (!$admin) {
            $this->error('No admin account to act as.');
            return self::FAILURE;
        }

        $open = Order::where('checkoutPending', '!=', true)->where('voidedCheckout', '!=', true)->get()
            ->filter(fn ($o) => !in_array(OrderStatus::normalize($o->orderStatus), [OrderStatus::DELIVERED, OrderStatus::CANCELLED, OrderStatus::RETURNED], true));

        $plan = [];
        foreach ($open as $o) {
            $dueRaw = $o->estimatedDeliveryMax ?? $o->estimatedDelivery ?? null;
            $due    = $dueRaw ? \Carbon\Carbon::parse((string) $dueRaw)->startOfDay() : null;
            // No promised date at all: only an order older than two weeks counts as abandoned.
            $created = $o->createdAt ? \Carbon\Carbon::parse((string) $o->createdAt) : null;
            $stale   = $due ? $due->lt($before) : (!$created || $created->lt($before->copy()->subDays(14)));
            if (!$stale) continue;

            $jobs     = JobOrder::where('orderId', (string) $o->_id)->get();
            $produced = $jobs->isNotEmpty() && $jobs->every(fn ($j) => in_array($j->joStatus, ['QC_Passed', 'Completed'], true));
            $paid     = ($o->paymentStatus ?? '') === 'paid';
            $received = collect($o->paymentHistory ?? [])->sum(fn ($p) => (float) ($p['amount'] ?? 0));

            $plan[] = [
                'order'    => $o,
                'ref'      => strtoupper(substr((string) $o->_id, -8)),
                'action'   => ($produced && $paid) ? 'Delivered' : 'Cancelled',
                'why'      => ($produced && $paid) ? 'made, passed QC, paid'
                    : (!$jobs->isEmpty() && !$produced ? 'job order not finished'
                    : ($jobs->isEmpty() && ($o->isCustomOrder ?? false) ? 'never reached production' : 'ready-made, never shipped')),
                'status'   => (string) $o->orderStatus,
                'due'      => $due ? $due->toDateString() : '-',
                'received' => $received,
            ];
        }

        if (!$plan) {
            $this->info('Nothing past its promised date.');
            return self::SUCCESS;
        }

        $this->table(['Order', 'Now', 'Promised', 'Received', 'Will be', 'Because'],
            array_map(fn ($p) => [$p['ref'], $p['status'], $p['due'], 'P' . number_format($p['received'], 2), $p['action'], $p['why']], $plan));

        if (!$this->option('apply')) {
            $this->warn(count($plan) . ' order(s) would change. Run again with --apply to do it.');
            return self::SUCCESS;
        }

        $controller = app(OrderController::class);
        $done = 0;
        foreach ($plan as $p) {
            $payload = $p['action'] === 'Delivered'
                ? ['orderStatus' => 'Delivered', 'notifyCustomer' => false]
                : [
                    'orderStatus'    => 'Cancelled',
                    'cancelReason'   => 'Abandoned test order, closed by the shop. Test-mode payment - nothing to refund.',
                    'refundAmount'   => 0,
                    'notifyCustomer' => false,
                ];
            $request = Request::create('/api/admin/orders/' . $p['order']->_id, 'PUT', $payload);
            $request->setUserResolver(fn () => $admin);

            $response = $controller->adminUpdate($request, (string) $p['order']->_id);
            $body     = json_decode($response->getContent(), true) ?: [];
            if ($response->getStatusCode() >= 300 || empty($body['success'])) {
                $this->error("#{$p['ref']}: " . ($body['message'] ?? $body['error'] ?? ('HTTP ' . $response->getStatusCode())));
                continue;
            }
            $done++;
            $this->line("#{$p['ref']} -> {$p['action']}");
        }

        $this->info("Done: {$done} of " . count($plan) . ' closed.');
        return self::SUCCESS;
    }
}
