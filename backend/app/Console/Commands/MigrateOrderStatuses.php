<?php

namespace App\Console\Commands;

use App\Models\JobOrder;
use App\Models\Order;
use App\Support\OrderStatus;
use Illuminate\Console\Command;

/**
 * Phase 1 — one-time remap of legacy/mixed order statuses to the canonical machine.
 * Idempotent + re-runnable. DRY-RUN by default; pass --apply to write.
 * BACK UP the `orders` collection before running with --apply.
 *
 *   php artisan orders:migrate-statuses            # dry run (counts only)
 *   php artisan orders:migrate-statuses --apply    # write changes
 */
class MigrateOrderStatuses extends Command
{
    protected $signature = 'orders:migrate-statuses {--apply : Persist changes (otherwise dry-run)}';
    protected $description = 'Remap legacy order/JO statuses to the canonical status machine (Phase 1).';

    // Design states currently kept in orderStatus. Phase 1 LEAVES these as-is (normalize() bridges
    // them for filtering/badges). Fully separating them into designStatus is Phase 1b — it requires
    // updating every read site first, so this migration intentionally skips them.
    private array $designStates = [
        'pending_design', 'pending_review', 'proof_sent',
        'revision_requested', 'design_approved', 'awaiting_payment', 'awaiting_production',
    ];

    private array $joMap = [
        'queued'       => 'queued',
        'in progress'  => 'in_progress',
        'in_progress'  => 'in_progress',
        'qc_pending'   => 'for_qc',
        'qc_passed'    => 'qc_passed',
        'qc_failed'    => 'qc_failed',
        'completed'    => 'completed',
        'cancelled'    => 'cancelled',
        'canceled'     => 'cancelled',
    ];

    public function handle(): int
    {
        $apply = (bool) $this->option('apply');
        $this->info($apply ? 'APPLYING status migration…' : 'DRY RUN (no writes). Use --apply to persist.');

        $orderChanges = 0; $skippedDesign = 0; $joChanges = 0;
        $summary = [];

        foreach (Order::cursor() as $order) {
            $legacy = $order->orderStatus;
            $legacyKey = strtolower(trim(str_replace([' ', '-'], '_', (string) $legacy)));
            $changed = false;

            // Skip design states (Phase 1b separates them) — only canonicalize fulfillment casing.
            if (in_array($legacyKey, $this->designStates, true)) {
                $skippedDesign++;
            } else {
                $canonical = OrderStatus::normalize($legacy);
                if ($canonical !== $legacy) {
                    $summary[$legacy . ' -> ' . $canonical] = ($summary[$legacy . ' -> ' . $canonical] ?? 0) + 1;
                    if ($apply) $order->orderStatus = $canonical;
                    $orderChanges++; $changed = true;
                }
            }

            // Lowercase the denormalized joStatus copy on the order, if present.
            if (!empty($order->joStatus)) {
                $joKey = strtolower(trim(str_replace([' ', '-'], '_', (string) $order->joStatus)));
                $joNew = $this->joMap[$joKey] ?? $joKey;
                if ($joNew !== $order->joStatus) {
                    if ($apply) $order->joStatus = $joNew;
                    $changed = true;
                }
            }

            if ($apply && $changed) {
                $order->updatedAt = now();
                $order->save();
            }
        }

        foreach (JobOrder::cursor() as $jo) {
            $joKey = strtolower(trim(str_replace([' ', '-'], '_', (string) $jo->joStatus)));
            $joNew = $this->joMap[$joKey] ?? $joKey;
            if ($joNew !== $jo->joStatus) {
                if ($apply) { $jo->joStatus = $joNew; $jo->save(); }
                $joChanges++;
            }
        }

        $this->newLine();
        $this->info("Orders re-coded:        {$orderChanges}");
        $this->info("Design states skipped:  {$skippedDesign} (left as-is for Phase 1b)");
        $this->info("JobOrders re-coded:     {$joChanges}");
        if (!empty($summary)) {
            $this->newLine();
            $this->line('orderStatus remaps:');
            foreach ($summary as $k => $n) $this->line("  {$k}  ({$n})");
        }
        if (!$apply) $this->warn('Dry run only — nothing written. Re-run with --apply after backing up `orders`.');

        return self::SUCCESS;
    }
}
