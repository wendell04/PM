<?php

namespace App\Console\Commands;

use App\Http\Controllers\ForecastTaxonomyController;
use App\Models\Inventory;
use App\Support\MaterialDemand;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * php artisan inventory:forecast [--dry] [--only=<inventoryId>]
 *
 * For every active material a recipe uses: build its demand series, send it
 * to the SSA service's /api/inventory-plan, and store the answer on the
 * material as `forecast`. To Buy, Home and the SSA page then read the same
 * stored plan, so the restock figure is one number everywhere, with one
 * computedAt.
 *
 * Never writes minStockLevel. The reorder point here is a suggestion beside
 * the owner's minimum, not a replacement for it.
 */
class InventoryForecast extends Command
{
    protected $signature = 'inventory:forecast
                            {--dry : Compute and print, write nothing}
                            {--only= : One inventoryId, for checking a single material}';

    protected $description = 'Compute the restock plan for every material with a recipe and store it on the material.';

    private const REVIEW_DAYS   = 7;     // the shop buys weekly
    private const SERVICE_LEVEL = 0.95;
    private const DEFAULT_LEAD  = 7;

    public function handle(): int
    {
        $base = rtrim((string) config('services.ssa.url', env('SSA_API_URL', 'http://127.0.0.1:8001')), '/');
        $dry  = (bool) $this->option('dry');
        $only = $this->option('only');

        $this->info('Building the taxonomy...');
        $taxonomy = (new ForecastTaxonomyController)->build();
        $demand   = new MaterialDemand($taxonomy);
        $leadTimes = $taxonomy['supplierLeadTimes'] ?? [];

        $query = Inventory::where('isActive', '!=', false);
        if ($only) {
            $query->where('_id', $only);
        }
        $materials = $query->get();

        $written = 0; $skipped = 0; $failed = 0;
        $table = [];

        foreach ($materials as $inv) {
            $id = (string) $inv->_id;
            $series = $demand->seriesFor($id);

            if (! $series['linked']) {
                $skipped++;
                continue;   // no recipe uses it; nothing to plan, and nothing to store
            }

            // Lead time: measured from this supplier's receipts if there are
            // enough, else the typed figure, else assumed - and say which.
            $sid = $inv->supplierId ? (string) $inv->supplierId : null;
            $measured = $sid ? ($leadTimes[$sid] ?? null) : null;
            if ($measured && ! empty($measured['sufficient'])) {
                $lead = (float) $measured['meanDays']; $leadSigma = (float) ($measured['sigmaDays'] ?? 0); $assumed = false;
            } elseif (($inv->leadTimeDays ?? 0) > 0) {
                $lead = (float) $inv->leadTimeDays; $leadSigma = 0.0; $assumed = false;
            } else {
                $lead = (float) self::DEFAULT_LEAD; $leadSigma = 0.0; $assumed = true;
            }

            $payload = [
                'material'             => ['id' => $id, 'name' => (string) $inv->name, 'uom' => (string) ($inv->uom ?? '')],
                'rows'                 => $series['rows'],
                'on_hand'              => (float) ($inv->stockQty ?? 0),
                'reserved'             => (float) ($inv->reservedQty ?? 0),
                'on_order'             => 0.0,
                'lead_time_days'       => $lead,
                'lead_time_assumed'    => $assumed,
                'lead_time_sigma_days' => $leadSigma,
                'review_days'          => self::REVIEW_DAYS,
                'service_level'        => self::SERVICE_LEVEL,
                'bucket'               => 'weekly',
                'history_used'         => $series['source'],
            ];

            try {
                $res = Http::timeout(60)->post($base . '/api/inventory-plan', $payload);
            } catch (\Throwable $e) {
                $failed++;
                Log::warning('inventory:forecast - service unreachable', ['material' => $inv->name, 'error' => $e->getMessage()]);
                $this->error("  {$inv->name}: service unreachable - {$e->getMessage()}");
                continue;
            }
            if (! $res->ok()) {
                $failed++;
                $this->error("  {$inv->name}: HTTP {$res->status()} " . mb_substr((string) $res->body(), 0, 120));
                continue;
            }
            $plan = $res->json();

            $stored = [
                'reorderPoint'     => $plan['policy']['reorder_point'] ?? null,
                'orderUpTo'        => $plan['policy']['order_up_to'] ?? null,
                'safetyStock'      => $plan['policy']['safety_stock'] ?? null,
                'restockQty'       => $plan['decision']['restock_qty'] ?? null,
                'reorderNow'       => $plan['decision']['reorder_now'] ?? false,
                'daysToReorder'    => $plan['decision']['days_to_reorder'] ?? null,
                'stockoutDate'     => $plan['decision']['stockout_date'] ?? null,
                'ratePerWeek'      => $plan['demand']['per_week'] ?? null,
                'demandClass'      => $plan['demand']['class'] ?? null,
                'method'           => $plan['demand']['method'] ?? null,
                'weeksOfHistory'   => $plan['demand']['n_weeks'] ?? 0,
                'lowConfidence'    => $plan['demand']['low_confidence'] ?? true,
                'historyUsed'      => $plan['demand']['history_used'] ?? $series['source'],
                'leadTimeDays'     => $lead,
                'leadTimeAssumed'  => $assumed,
                'basis'            => $plan['decision']['basis'] ?? ($plan['basis'] ?? null),
                'computedAt'       => now()->toIso8601String(),
            ];

            $table[] = [
                mb_substr((string) $inv->name, 0, 34),
                $series['source'],
                $stored['ratePerWeek'] ?? '-',
                $stored['reorderPoint'] ?? '-',
                $stored['restockQty'] ?? '-',
                $stored['reorderNow'] ? 'NOW' : '',
                $stored['lowConfidence'] ? 'low' : '',
            ];

            if (! $dry) {
                $inv->forecast = $stored;
                $inv->save();
            }
            $written++;
        }

        $this->table(['material', 'from', 'rate/wk', 'ROP', 'restock', '', 'conf'], $table);
        $this->info(($dry ? '[dry] would write ' : 'wrote ') . "$written plan(s); skipped $skipped with no recipe; $failed failed.");

        return $failed > 0 ? self::FAILURE : self::SUCCESS;
    }
}
