<?php

namespace App\Console\Commands;

use App\Models\Order;
use Illuminate\Console\Command;

/**
 * One-off repair for orders whose proof was answered before 13105cd reached the live site.
 *
 * Until that fix, answering a proof at ORDER level - through the emailed link, or the order-level
 * Approve - set order.designStatus and stopped there. The screens that ask a customer to decide
 * read the LINE, so the order carried an Approved badge while My Orders still offered Approve and
 * Request changes on every item. One decision, two answers.
 *
 * The code has been right since 2026-09-24 09:53 (when the deploy landed). The orders answered in
 * the window between the commit and the deploy are still carrying lines that were left behind, and
 * nothing will move them: the customer has already answered, so no second answer is coming.
 *
 * This applies the same rule the fix applies, and nothing else: a line still sitting at draft_ready
 * or proof_sent takes the decision the ORDER already carries. A line that was answered on its own -
 * approved, rejected, anything else - is left exactly as it is.
 *
 * Idempotent. Re-running it changes nothing once the lines agree.
 *
 *   php artisan orders:sync-item-designs             # dry run: says what it would change
 *   php artisan orders:sync-item-designs --apply     # write it
 *   php artisan orders:sync-item-designs --order=ORD-77024967
 */
class SyncItemDesignDecisions extends Command
{
    protected $signature = 'orders:sync-item-designs
        {--apply : Persist the changes (otherwise dry-run)}
        {--order= : A single order number or id, for checking one before doing the lot}';

    protected $description = 'Bring item design statuses into line with an order-level proof decision (one-off, pre-13105cd orders).';

    /** A line in one of these is still waiting on the customer, so an order-level answer covers it. */
    private const WAITING = ['draft_ready', 'proof_sent'];

    /**
     * Only a real decision propagates - an order still at proof_sent has nothing to hand down.
     * These four are what the app actually writes to Order.designStatus (approved and rejected in
     * OrderController, revision_requested on the revision path, design_approved on the older
     * spelling some rows still carry).
     */
    private const DECIDED = ['approved', 'design_approved', 'revision_requested', 'rejected'];

    public function handle(): int
    {
        $apply = (bool) $this->option('apply');
        $only  = trim((string) $this->option('order'));

        $query = Order::query()->whereIn('designStatus', self::DECIDED);
        if ($only !== '') {
            $query->where(function ($q) use ($only) {
                $q->where('orderNumber', $only)->orWhere('orderNo', $only)->orWhere('_id', $only);
            });
        }

        $orders  = $query->get(['_id', 'orderNumber', 'orderNo', 'designStatus', 'items', 'designDecisionAt', 'updatedAt']);
        $touched = 0;
        $lines   = 0;

        foreach ($orders as $order) {
            $items   = $order->items ?? [];
            if (!is_array($items) || $items === []) continue;

            $status  = (string) $order->designStatus;
            $changed = [];
            foreach ($items as $i => $it) {
                $cur = (string) ($it['designStatus'] ?? '');
                if (!in_array($cur, self::WAITING, true)) continue;
                $items[$i]['designStatus'] = $status;
                $changed[] = ($it['productName'] ?? ('line ' . ($i + 1))) . ": {$cur} -> {$status}";
            }
            if ($changed === []) continue;

            $touched++;
            $lines += count($changed);
            $no = $order->orderNumber ?? $order->orderNo ?? (string) $order->_id;
            $this->line(($apply ? 'FIXING  ' : 'would fix  ') . $no);
            foreach ($changed as $c) $this->line('    ' . $c);

            if ($apply) {
                $order->items = array_values($items);
                $order->save();
            }
        }

        $this->newLine();
        if ($touched === 0) {
            $this->info('Nothing to do - every answered proof already reaches its lines.');
            return self::SUCCESS;
        }

        $this->info(($apply ? 'Fixed ' : 'Would fix ') . $touched . ' order(s), ' . $lines . ' line(s).');
        if (!$apply) {
            $this->comment('Dry run. Re-run with --apply to write it. Back up the orders collection first.');
        }
        return self::SUCCESS;
    }
}
