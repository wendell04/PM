<?php

namespace App\Console\Commands;

use App\Models\Inventory;
use App\Models\StockHistory;
use Illuminate\Console\Command;

/**
 * Put a cost on stock-out rows that were written with none.
 *
 * deductInventoryFIFO priced each row from the batch it drew from and recorded zero when that batch
 * carried no unit cost of its own. Zero is not "unknown" to anything downstream - it is free. A real
 * sale of ten totebags went into the ledger at ₱0.00 against a material whose base cost is ₱32, and
 * the shop's cost of goods for the month is understated by exactly that.
 *
 * The writer no longer does this. This is for the rows already written.
 *
 * WHAT THIS CANNOT KNOW: which batch the units actually came from. The row never recorded it, and no
 * amount of arithmetic recovers it now. So the cost here is a RECONSTRUCTION from what the material
 * itself knows, and every row it touches says so in its remarks. A reconstructed figure the reader
 * can see is a reconstruction is worth having; one that pretends to be an original record is not.
 */
class BackfillStockOutCost extends Command
{
    protected $signature   = 'inventory:backfill-stockout-cost
                              {--dry-run : Show what would change without writing}';
    protected $description = 'Give a cost to stock-out rows recorded at zero, marked as reconstructed';

    public function handle(): int
    {
        $dry = (bool) $this->option('dry-run');

        $rows = StockHistory::where('type', 'deduction')->get()
            ->filter(fn ($r) => (float) ($r->unitCost ?? 0) <= 0 && abs((int) ($r->quantity ?? 0)) > 0);

        if ($rows->isEmpty()) {
            $this->info('Nothing to do - every deduction already carries a cost.');
            return self::SUCCESS;
        }

        $invCache = [];
        $done = 0; $skipped = 0; $total = 0.0;

        foreach ($rows as $r) {
            $id = (string) ($r->inventoryId ?? '');
            if (!$id) { $skipped++; continue; }

            if (!array_key_exists($id, $invCache)) {
                $invCache[$id] = Inventory::find($id);
            }
            $inv = $invCache[$id];
            if (!$inv) {
                $this->line("  skip (material gone): {$r->_id}");
                $skipped++;
                continue;
            }

            $unit = (float) ($inv->lastUnitCost ?: $inv->averageCost ?: $inv->baseCost ?: 0);
            if ($unit <= 0) {
                foreach (($inv->batches ?? []) as $b) {
                    if ((float) ($b['unitCost'] ?? 0) > 0) { $unit = (float) $b['unitCost']; break; }
                }
            }
            if ($unit <= 0) {
                $this->warn(sprintf('  skip (no cost anywhere): %-34s', $inv->name ?? $id));
                $skipped++;
                continue;
            }

            $qty  = abs((int) $r->quantity);
            $line = round($unit * $qty, 2);
            $total += $line;

            $this->line(sprintf('  %-34s %3d x P%-8s = P%-10s  %s',
                $inv->name ?? $id, $qty, number_format($unit, 2), number_format($line, 2), $r->reason ?? ''));

            if ($dry) { $done++; continue; }

            $r->unitCost  = $unit;
            $r->totalCost = $line;
            // Say what this figure is. A reader six months from now has no other way to tell it apart
            // from a cost that was recorded at the time.
            $note = trim((string) ($r->remarks ?? ''));
            $r->remarks = ($note ? $note . ' | ' : '')
                . 'Cost reconstructed ' . now()->toDateString() . ' from material cost (original row recorded no cost)';
            $r->save();
            $done++;
        }

        $this->newLine();
        $this->info(($dry ? '[dry run] ' : '') . sprintf(
            '%d row(s) costed, %d skipped. Total added to cost of goods: P%s',
            $done, $skipped, number_format($total, 2)
        ));
        $this->line('Every row touched is marked in its remarks as a reconstruction, not an original record.');

        return self::SUCCESS;
    }
}
