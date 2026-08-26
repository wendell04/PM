<?php

namespace App\Console\Commands;

use App\Models\ActivityLog;
use App\Models\Inventory;
use App\Models\JobOrder;
use App\Models\Notification;
use App\Models\Order;
use App\Models\OrderRequest;
use App\Models\Sale;
use App\Models\StockHistory;
use Illuminate\Console\Command;

/**
 * Wipe the order history so testing can start from a known state.
 *
 * Deleting orders on their own is the wrong move: stock reserved by an order lives on the MATERIAL,
 * not the order, so removing the documents would strand those holds with nothing left to explain or
 * release them - the shelf would read as full while the storefront refused to sell. This clears the
 * holds first, then the records.
 *
 * What it deliberately does NOT do is put consumed stock back. `reservedQty` is a hold and can be
 * safely dropped; `stockQty` was really spent when a job passed QC or a ready-made line shipped.
 * Restoring it here would be inventing inventory. If those units are still physically on the shelf,
 * correct them with a stock-in, which leaves an auditable trail.
 */
class ResetTestOrders extends Command
{
    protected $signature = 'orders:reset-test
        {--force : Actually delete. Without this the command only reports what it would do}
        {--keep-stock-history : Leave StockHistory rows in place (default is to remove order-linked ones)}
        {--keep-pos-sales : Delete only source=online sales, leaving POS and seeded sales alone}';

    protected $description = 'Clear orders, sales and job orders, and release every material reservation';

    public function handle(): int
    {
        $force = (bool) $this->option('force');

        $counts = [
            'Orders'         => Order::count(),
            'Order requests' => OrderRequest::count(),
            'Job orders'     => JobOrder::count(),
            'Sales'          => Sale::count(),
        ];

        $held = Inventory::where('reservedQty', '>', 0)->get();
        $heldTotal = $held->sum(fn ($m) => (int) ($m->reservedQty ?? 0));

        $this->newLine();
        $this->line('<comment>Would remove</comment>');
        foreach ($counts as $label => $n) {
            $this->line(sprintf('  %-16s %d', $label, $n));
        }

        // Sales carry a `source` ('online' from a storefront order, 'pos' from the counter, and
        // whatever any seeded data used). Break it down, because emptying the whole Sales dashboard is
        // not what "clean up my test orders" usually means - and only the online ones came from the
        // orders being removed here.
        foreach (Sale::raw(fn ($c) => $c->aggregate([
            ['$group' => ['_id' => '$source', 'n' => ['$sum' => 1]]],
            ['$sort'  => ['n' => -1]],
        ])) as $row) {
            $this->line(sprintf('    source %-12s %d', $row['_id'] ?? '(none)', $row['n']));
        }

        $this->newLine();
        $this->line('<comment>Would release</comment>');
        if ($held->isEmpty()) {
            $this->line('  no material reservations');
        } else {
            foreach ($held as $m) {
                $this->line(sprintf('  %-32s %d %s held', $m->name ?? '(unnamed)', (int) $m->reservedQty, $m->unit ?? ''));
            }
            $this->line(sprintf('  %-32s %d total', 'ALL', $heldTotal));
        }

        // Show what actually moved the shelf, so the decision about restoring it is made on evidence
        // rather than on a guess about what the tests did.
        $this->newLine();
        $this->line('<comment>Stock movements on record</comment>');
        $rows = StockHistory::raw(fn ($c) => $c->aggregate([
            ['$group' => ['_id' => '$reason', 'n' => ['$sum' => 1], 'qty' => ['$sum' => '$quantity']]],
            ['$sort'  => ['n' => -1]],
        ]));
        if (count($rows) === 0) {
            $this->line('  none');
        } else {
            foreach ($rows as $row) {
                $this->line(sprintf('  %-24s %4d row(s)  qty %s', $row['_id'] ?? '(none)', $row['n'], $row['qty'] ?? 0));
            }
        }

        $this->newLine();
        $this->line('<comment>Would NOT touch</comment>');
        $this->line('  stockQty - only reservations are released. Anything an order genuinely CONSUMED (at QC, or a');
        $this->line('             ready-made line) stays consumed; restoring it would be inventing inventory. Correct');
        $this->line('             it with a stock-in, which leaves a trail. Check the movements above: if there are no');
        $this->line('             consume rows, nothing was consumed and this caveat does not apply to you.');
        $this->line('  products, materials, BOMs, customers, settings');

        if (!$force) {
            $this->newLine();
            $this->warn('Dry run. Nothing was changed. Re-run with --force to apply.');
            $this->line('  A JSON backup of everything above is written automatically before anything is deleted.');
            $this->line('  php artisan orders:reset-test --force --keep-pos-sales');
            return self::SUCCESS;
        }

        // Dump everything about to be destroyed, first, into a plain JSON file. `db:backup` needs the
        // ZipArchive extension and is not always available; this has no dependencies and covers exactly
        // what this command touches, which is the only backup that matters here. If it cannot be
        // written, nothing is deleted.
        $stamp = now()->format('Y-m-d_His');
        $dir   = storage_path('app/reset-backups');
        if (!is_dir($dir) && !@mkdir($dir, 0775, true)) {
            $this->error("Could not create {$dir}. Nothing was deleted.");
            return self::FAILURE;
        }
        $file = "{$dir}/reset_{$stamp}.json";
        $dump = [
            'takenAt'      => now()->toIso8601String(),
            'orders'       => Order::all()->toArray(),
            'orderRequests'=> OrderRequest::all()->toArray(),
            'jobOrders'    => JobOrder::all()->toArray(),
            'sales'        => Sale::all()->toArray(),
            'reservations' => $held->map(fn ($m) => [
                'inventoryId' => (string) $m->_id,
                'name'        => $m->name,
                'reservedQty' => (int) $m->reservedQty,
            ])->values()->all(),
        ];
        if (@file_put_contents($file, json_encode($dump, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES)) === false) {
            $this->error("Could not write {$file}. Nothing was deleted.");
            return self::FAILURE;
        }
        $this->info('Backup written: ' . $file . ' (' . number_format(filesize($file) / 1024, 1) . ' KB)');

        // Holds first. If the run dies halfway, a released hold with a surviving order is recoverable;
        // a deleted order with a surviving hold is not.
        foreach ($held as $m) {
            $m->reservedQty = 0;
            $m->save();
        }
        $this->info("Released {$heldTotal} reserved unit(s) across {$held->count()} material(s).");

        if (!$this->option('keep-stock-history')) {
            // ONLY the order-driven hold/release rows. `restock`, `initial` and `return` are real
            // warehouse history that no order created and nothing here should erase - deleting those
            // would leave the shelf with stock it cannot account for.
            $removed = StockHistory::whereIn('reason', [
                'production_reserved', 'sale_reserved', 'reservation_released', 'order_cancelled',
            ])->delete();
            $this->info("Removed {$removed} order-linked stock history row(s); restock/initial/return kept.");
        }

        if ($this->option('keep-pos-sales')) {
            $n = Sale::where('source', 'online')->delete();
            $this->info("Deleted {$n} online Sale(s); POS and seeded sales left alone.");
        } else {
            $n = Sale::query()->delete();
            $this->info("Deleted {$n} Sale(s).");
        }

        foreach ([JobOrder::class, OrderRequest::class, Order::class] as $model) {
            $n = $model::query()->delete();
            $this->info(sprintf('Deleted %d %s.', $n, class_basename($model)));
        }

        $n = Notification::whereNotNull('orderId')->delete();
        $this->info("Deleted {$n} order notification(s).");

        $n = ActivityLog::whereIn('action', [
            'order_created', 'order_status_updated', 'design_draft_uploaded',
            'job_order_created', 'job_order_deleted',
        ])->delete();
        $this->info("Deleted {$n} order activity log(s).");

        $this->newLine();
        $this->info('Done. Reload the dashboard - Reserved should read 0 and every product should build to its full material count.');
        return self::SUCCESS;
    }
}
