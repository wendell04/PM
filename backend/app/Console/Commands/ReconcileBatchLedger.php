<?php

namespace App\Console\Commands;

use App\Models\Inventory;
use Illuminate\Console\Command;

/**
 * Bring the batch ledger back in line with stockQty.
 *
 * Job order QC passes, scrap and spoilage all moved stockQty and never touched batches, so the two
 * numbers drifted apart by exactly the amount every job order has ever consumed. Master Data sums
 * batch remainingQty and Product Stock reads stockQty, which is why the same material read 50 on one
 * screen and 30 on the other.
 *
 * The code no longer creates the drift. This closes the gap that already exists.
 *
 * WHICH NUMBER IS TRUSTED: stockQty. Every consumption path decremented it, so it is the one that
 * tracked what actually left the shelf. The batch ledger is the one that stopped listening.
 *
 * The excess is taken from the OLDEST batches first, because that is the order the material would
 * have been consumed in had the ledger been written correctly, and it leaves the newest unit costs
 * standing for future FIFO pricing.
 *
 * If the ledger holds LESS than stockQty this reports and does not touch it. That is the opposite
 * fault and inventing batch quantity to cover it would be manufacturing stock that was never
 * received.
 */
class ReconcileBatchLedger extends Command
{
    protected $signature   = 'inventory:reconcile-batches
                              {--dry-run : Show what would change without writing}
                              {--opening-balance : Give SHORT materials an "Opening balance" batch for the gap - only when the owner confirms the counted stock is real}';
    protected $description = 'Align batch remainingQty with stockQty after job orders bypassed the batch ledger';

    public function handle(): int
    {
        $dry = (bool) $this->option('dry-run');
        $opening = (bool) $this->option('opening-balance');

        $items   = Inventory::all();
        $fixed   = 0;
        $short   = 0;
        $ok      = 0;
        $totalPc = 0;
        $opened  = 0;

        foreach ($items as $inv) {
            $batches = $inv->batches ?? [];
            if (!is_array($batches)) $batches = [];
            // No batches at all is the extreme SHORT case, not "correct": stock seeded before batches
            // existed has a count and nothing behind it. Only a material with nothing on hand is fine.
            if (!count($batches) && (int) ($inv->stockQty ?? 0) <= 0) { $ok++; continue; }

            $ledger = 0;
            foreach ($batches as $b) {
                $ledger += (int) ($b['remainingQty'] ?? $b['goodQty'] ?? 0);
            }
            $stock = (int) ($inv->stockQty ?? 0);
            $gap   = $ledger - $stock;

            if ($gap === 0) { $ok++; continue; }

            if ($gap < 0) {
                $short++;
                if (!$opening) {
                    $this->warn(sprintf('  SHORT  %-42s ledger %d < stockQty %d (left alone)', $inv->name ?? '?', $ledger, $stock));
                    continue;
                }
                // Opening balance: the accepted way to bring stock that predates the records into
                // them. Costed at what the material is known to cost, dated when it was created, and
                // labelled so nobody mistakes it for a delivery.
                $gapUp = $stock - $ledger;
                $cost  = (float) ($inv->averageCost ?: ($inv->lastUnitCost ?: ($inv->baseCost ?: 0)));
                $this->line(sprintf('  open   %-42s + %d as opening balance at %.2f', $inv->name ?? '?', $gapUp, $cost));
                if (!$dry) {
                    $batches[] = [
                        'batchId'       => (string) \Illuminate\Support\Str::uuid(),
                        'invoiceNumber' => 'OPENING-BALANCE',
                        'supplierId'    => $inv->supplierId ?? null,
                        'vendorName'    => $inv->supplierName ?? null,
                        'goodQty'       => $gapUp,
                        'remainingQty'  => $gapUp,
                        'qtyDamaged'    => 0,
                        'unitCost'      => $cost,
                        'dateReceived'  => optional($inv->createdAt)->toISOString() ?? now()->toISOString(),
                        'notes'         => 'Opening balance - stock on hand before deliveries were recorded',
                        'createdAt'     => now()->toISOString(),
                    ];
                    $inv->batches   = $batches;
                    $inv->updatedAt = now();
                    $inv->save();
                }
                $short--;      // counted as SHORT above; it is an opening balance, not left alone
                $opened++;
                continue;
            }

            $this->line(sprintf('  fix    %-42s ledger %d -> %d  (removing %d)', $inv->name ?? '?', $ledger, $stock, $gap));
            $fixed++;
            $totalPc += $gap;

            if ($dry) continue;

            usort($batches, fn ($x, $y) => strtotime($x['dateReceived'] ?? '0') <=> strtotime($y['dateReceived'] ?? '0'));

            $left = $gap;
            foreach ($batches as &$batch) {
                if ($left <= 0) break;
                $have = (int) ($batch['remainingQty'] ?? $batch['goodQty'] ?? 0);
                if ($have <= 0) continue;
                $take = min($have, $left);
                $batch['remainingQty'] = $have - $take;
                $left -= $take;
            }
            unset($batch);

            $inv->batches   = $batches;
            $inv->updatedAt = now();
            $inv->save();
        }

        $this->newLine();
        $this->info(($dry ? '[dry run] ' : '') . sprintf(
            '%d already correct, %d reconciled (%d units removed from the ledger), %d given an opening balance, %d short and left alone.',
            $ok, $fixed, $totalPc, $opened, $short
        ));

        if ($short > 0) {
            $this->newLine();
            $this->warn('SHORT means the batch ledger holds less than stockQty - stock the system thinks you have');
            $this->warn('but that no batch accounts for. Usually a stock-in that was recorded on the item and not as');
            $this->warn('a batch. Check those by hand; this command will not invent batch quantity to cover them.');
        }

        return self::SUCCESS;
    }
}
