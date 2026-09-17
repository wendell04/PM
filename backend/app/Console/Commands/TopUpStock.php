<?php

namespace App\Console\Commands;

use App\Http\Controllers\InventoryController;
use App\Models\BillOfMaterial;
use App\Models\Inventory;
use App\Models\Product;
use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Http\Request;

/**
 * Receive stock for every material a published product is made from - one batch each, exactly as
 * the Receive Stock button records it (batch, invoice, unit cost, stock history, audit log).
 *
 * For a test run with many orders at once. Materials bought per order (on-demand) never run out
 * and are skipped; a material shared by several products is topped up once.
 */
class TopUpStock extends Command
{
    protected $signature = 'inventory:top-up
        {--qty=100 : Units to receive for each material}
        {--invoice=TOPUP : Invoice / reference written on every batch (the date is appended)}
        {--apply : Make the changes (without it, only shows what would happen)}';

    protected $description = 'Receive stock for every material used by a published product, through the normal Receive Stock path';

    public function handle(): int
    {
        $qty = (int) $this->option('qty');
        if ($qty < 1) {
            $this->error('Quantity must be at least 1.');
            return self::FAILURE;
        }
        $admin = User::whereIn('role', ['superAdmin', 'admin', 'owner'])->orderBy('role')->first();
        if (!$admin) {
            $this->error('No admin account to act as.');
            return self::FAILURE;
        }

        // Every BOM a published product can resolve to: its own, or one per variant.
        $bomIds = [];
        foreach (Product::where('isPublished', true)->where('isArchived', '!=', true)->get() as $p) {
            if (!empty($p->bomId)) $bomIds[] = (string) $p->bomId;
            foreach ((array) ($p->combinations ?? []) as $c) {
                if (!empty($c['bomId'])) $bomIds[] = (string) $c['bomId'];
            }
        }
        $materials = [];
        foreach (BillOfMaterial::whereIn('_id', array_unique($bomIds))->get() as $bom) {
            foreach ((array) ($bom->components ?? []) as $comp) {
                if (!empty($comp['inventoryId'])) $materials[(string) $comp['inventoryId']] = true;
            }
        }

        $invoice = $this->option('invoice') . '-' . now()->format('Ymd');
        $rows = [];
        $already = [];
        foreach (Inventory::whereIn('_id', array_keys($materials))->get() as $inv) {
            if ($inv->isOnDemand || !$inv->isActive) continue;
            // Run twice in a day and the second run would add another hundred; the invoice on the
            // batch is what says it was already done.
            if (collect($inv->batches ?? [])->contains(fn ($b) => ($b['invoiceNumber'] ?? null) === $invoice)) {
                $already[] = $inv->name;
                continue;
            }
            $rows[] = $inv;
        }
        usort($rows, fn ($a, $b) => strcmp($a->name, $b->name));
        foreach ($already as $name) $this->line("Skip  {$name} - already received under {$invoice}");

        if (!$rows) {
            $this->info($already ? 'Every material was already received under ' . $invoice . '.' : 'No counted materials behind any published product.');
            return self::SUCCESS;
        }

        $this->table(['Material', 'On hand', 'Receive', 'After', 'Unit cost', 'Vendor'],
            array_map(fn ($i) => [$i->name, (int) $i->stockQty, $qty, (int) $i->stockQty + $qty,
                'P' . number_format((float) ($i->lastUnitCost ?? $i->baseCost ?? $i->averageCost ?? 0), 2), $i->supplierName ?? '-'], $rows));

        if (!$this->option('apply')) {
            $this->warn(count($rows) . ' material(s) would receive ' . $qty . ' each under invoice ' . $invoice . '. Run again with --apply to do it.');
            return self::SUCCESS;
        }

        $controller = app(InventoryController::class);
        $done = 0;
        foreach ($rows as $inv) {
            $request = Request::create('/api/admin/inventory/' . $inv->_id . '/adjust-stock', 'POST', [
                'quantity'       => $qty,
                'adjustmentType' => 'add',
                'reason'         => 'restock',
                'supplierId'     => $inv->supplierId ? (string) $inv->supplierId : null,
                'supplierName'   => $inv->supplierName,
                'unitCost'       => (float) ($inv->lastUnitCost ?? $inv->baseCost ?? $inv->averageCost ?? 0),
                'invoiceNumber'  => $invoice,
                'deliveryDate'   => now()->toISOString(),
                'remarks'        => 'Stock top-up for the test run',
                'performedBy'    => trim(($admin->firstName ?? '') . ' ' . ($admin->lastName ?? '')) ?: 'admin',
            ]);
            $request->setUserResolver(fn () => $admin);

            $response = $controller->adjustStock($request, (string) $inv->_id);
            $body     = json_decode($response->getContent(), true) ?: [];
            if ($response->getStatusCode() >= 300 || empty($body['success'])) {
                $this->error($inv->name . ': ' . ($body['message'] ?? $body['error'] ?? ('HTTP ' . $response->getStatusCode())));
                continue;
            }
            $done++;
        }

        $this->info("Done: {$done} of " . count($rows) . " material(s) received {$qty} each. Invoice {$invoice} in Overview > Stock In.");
        return self::SUCCESS;
    }
}
