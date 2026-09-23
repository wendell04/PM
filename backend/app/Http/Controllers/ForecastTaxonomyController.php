<?php

namespace App\Http\Controllers;

use App\Models\BillOfMaterial;
use App\Models\Inventory;
use App\Models\Product;
use App\Models\Sale;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

/**
 * Forecast taxonomy.
 *
 * The SSA forecast page needs to turn a sale into material demand, and nothing
 * in the sales collection points at a material: no inventoryId, no productId,
 * no jobOrderId on any of the 370 rows. The link has to be rebuilt from names
 * and from the bill of materials.
 *
 * This endpoint does that rebuilding once, server-side, and hands the page
 * three things:
 *
 *   motherItems     the product -> variant -> material tree, for the picker
 *   saleResolution  every distinct productName in sales, already resolved to
 *                   a product and (where known) a variant, so the page never
 *                   parses a name itself
 *   variantShares   how to split a legacy family-level sale across variants
 *
 * Aggregation stays on the page so ssa.py and the evaluation notebooks keep
 * seeing the same shaped series.
 */
class ForecastTaxonomyController extends Controller
{
    /**
     * Receipts a supplier needs before its measured lead time outranks the
     * typed one on the material. A dozen deliveries a year gives a dozen
     * points; a mean and a spread are the honest estimator, not a model.
     */
    const LEAD_TIME_MIN_RECEIPTS = 10;

    /**
     * Measured lead time per supplier, from stock-in rows that recorded both
     * the order date and the receipt date. Computed on read rather than stored
     * on the supplier, so it is never stale and there is no second write path
     * to keep honest.
     *
     * Per supplier and not per material, because one supplier ships the mug
     * and the box together: one delivery is one observation for both.
     */
    private function supplierLeadTimes(): array
    {
        $rows = \App\Models\StockHistory::where('type', 'addition')
            ->whereNotNull('leadTimeDays')
            ->get(['supplierId', 'supplierName', 'leadTimeDays']);

        $samples = [];
        foreach ($rows as $r) {
            $sid = (string) ($r->supplierId ?? '');
            if ($sid === '') {
                continue;
            }
            $samples[$sid]['name']   = $r->supplierName ?? $samples[$sid]['name'] ?? null;
            $samples[$sid]['days'][] = (float) $r->leadTimeDays;
        }

        $out = [];
        foreach ($samples as $sid => $s) {
            $d = $s['days'];
            $n = count($d);
            $mean = array_sum($d) / $n;
            $var  = $n > 1 ? array_sum(array_map(fn ($x) => ($x - $mean) ** 2, $d)) / ($n - 1) : 0.0;
            $out[$sid] = [
                'name'       => $s['name'],
                'receipts'   => $n,
                'meanDays'   => round($mean, 1),
                'sigmaDays'  => round(sqrt($var), 1),
                'sufficient' => $n >= self::LEAD_TIME_MIN_RECEIPTS,
            ];
        }

        return $out;
    }

    public function index(Request $request)
    {
        try {
            if (! $this->hasAnyPermission($request, ['masterData.view', 'forecast.view', 'reports.view'])) {
                return $this->unauthorizedResponse();
            }

            return $this->successResponse('Forecast taxonomy built.', $this->build());
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'Could not build the forecast taxonomy.');
        }
    }

    /**
     * The taxonomy itself, with no request attached, so the nightly
     * inventory:forecast command can use the same resolution the page does
     * rather than carrying a second copy of the name map and the BOM walk.
     */
    public function build(): array
    {
        {
            $cfg         = config('forecast');
            $legacyMap   = $cfg['legacy_map'] ?? [];
            $legacyVar   = $cfg['legacy_variant'] ?? [];
            $aliases     = $cfg['product_aliases'] ?? [];
            $unresolved  = $cfg['unresolved'] ?? [];
            $windowDays  = (int) ($cfg['variant_share']['window_days'] ?? 90);
            $minOrders   = (int) ($cfg['variant_share']['min_orders'] ?? 5);

            $products  = Product::all();
            $boms      = BillOfMaterial::all()->keyBy(fn ($b) => (string) $b->_id);
            $materials = Inventory::all();

            $materialNames = [];
            foreach ($materials as $m) {
                $materialNames[(string) $m->_id] = $m->name;
            }

            // ── product -> variants -> BOM -> materials ──────────────────────
            $motherItems   = [];
            $materialIndex = [];   // inventoryId => [ {productId, productName, variantName, qtyPerUnit} ]
            $productByName = [];

            foreach ($products as $p) {
                $pid   = (string) $p->_id;
                $pname = (string) $p->name;
                $productByName[mb_strtolower($pname)] = $pid;

                // combinations[] are the variants; a product with none uses its base bomId
                $combos = $this->toArray($p->combinations);
                $rows   = [];

                if (count($combos) > 0) {
                    foreach ($combos as $c) {
                        $c = $this->toArray($c);
                        $rows[] = [
                            'variant' => (string) ($c['name'] ?? ''),
                            'bomId'   => (string) ($c['bomId'] ?? ''),
                        ];
                    }
                } else {
                    $rows[] = ['variant' => null, 'bomId' => (string) ($p->bomId ?? '')];
                }

                $matsForProduct = [];

                foreach ($rows as $row) {
                    $bom = $row['bomId'] !== '' ? ($boms[$row['bomId']] ?? null) : null;
                    if (! $bom) {
                        continue;   // printing services carry no BOM - legitimately material-free
                    }

                    foreach ($this->toArray($bom->components) as $comp) {
                        $comp  = $this->toArray($comp);
                        $invId = (string) ($comp['inventoryId'] ?? '');
                        if ($invId === '') {
                            continue;
                        }
                        $qty = (float) ($comp['qty'] ?? 0);
                        if ($qty <= 0) {
                            continue;
                        }

                        $materialIndex[$invId][] = [
                            'productId'   => $pid,
                            'productName' => $pname,
                            'variantName' => $row['variant'],
                            'qtyPerUnit'  => $qty,
                        ];

                        if (! isset($matsForProduct[$invId])) {
                            $matsForProduct[$invId] = [
                                'inventoryId' => $invId,
                                'name'        => $materialNames[$invId] ?? ($comp['materialName'] ?? 'Unknown material'),
                                'qtyPerUnit'  => $qty,
                                'variants'    => [],
                            ];
                        }
                        if ($row['variant'] !== null && ! in_array($row['variant'], $matsForProduct[$invId]['variants'], true)) {
                            $matsForProduct[$invId]['variants'][] = $row['variant'];
                        }
                    }
                }

                $motherItems[] = [
                    'productId'   => $pid,
                    'name'        => $pname,
                    'category'    => (string) ($p->category ?? ''),
                    'variants'    => array_values(array_filter(array_map(fn ($r) => $r['variant'], $rows))),
                    'materials'   => array_values($matsForProduct),
                    'legacyNames' => array_values(array_keys(array_filter(
                        $legacyMap,
                        fn ($target) => mb_strtolower($target) === mb_strtolower($pname)
                    ))),
                ];
            }

            // A material used by more than one mother item is a shared consumable
            // (Sublimation Transfer Paper A3 sits in 17 BOMs). Its demand is only
            // visible when summed across every product that draws on it.
            foreach ($materialIndex as $invId => $consumers) {
                $distinct = array_unique(array_column($consumers, 'productId'));
                $materialIndex[$invId] = [
                    'consumers' => $consumers,
                    'shared'    => count($distinct) > 1,
                ];
            }

            $unlinked = [];
            foreach ($materials as $m) {
                $id = (string) $m->_id;
                if (! isset($materialIndex[$id])) {
                    $unlinked[] = ['inventoryId' => $id, 'name' => $m->name];
                }
            }

            // ── resolve every distinct productName that appears in sales ─────
            $saleNames = \Illuminate\Support\Facades\DB::connection('mongodb')
                ->getCollection('sales')
                ->distinct('productName', []);
            $saleNames = array_values(array_filter(array_map(
                fn ($n) => is_string($n) && trim($n) !== '' ? $n : null,
                is_array($saleNames) ? $saleNames : iterator_to_array($saleNames)
            )));

            $nameByProductId = [];
            foreach ($products as $p) {
                $nameByProductId[(string) $p->_id] = (string) $p->name;
            }

            $resolution = [];
            foreach ($saleNames as $name) {
                $r = $this->resolveSaleName(
                    $name, $productByName, $aliases, $legacyMap, $legacyVar, $unresolved
                );
                if ($r !== null) {
                    // Always report the mother item's own name, never the raw sale string
                    $r['productName'] = $nameByProductId[$r['productId']] ?? $r['productName'];

                    // A sale can name a combination across two variant groups
                    // ("Glossy · Diecut"); only one part names a BOM-bearing
                    // variant, so pin it to the one the product actually has.
                    if (! empty($r['variant'])) {
                        $known = [];
                        foreach ($motherItems as $mi) {
                            if ($mi['productId'] === $r['productId']) {
                                $known = $mi['variants'];
                                break;
                            }
                        }
                        $r['variantRaw'] = $r['variant'];
                        $r['variant']    = $this->pinVariant($r['variant'], $known);
                    }
                }
                $resolution[$name] = $r;
            }

            // ── variant share, from recent online orders ─────────────────────
            $since  = Carbon::now()->subDays($windowDays);
            $recent = Sale::where('source', 'online')->get();

            $tally = [];   // productId => [variant => qty]
            $count = [];   // productId => order rows
            foreach ($recent as $s) {
                $d = $s->saleDate ? Carbon::parse($s->saleDate) : null;
                if (! $d || $d->lt($since)) {
                    continue;
                }
                $r = $resolution[$s->productName] ?? null;
                if (! $r || empty($r['productId']) || empty($r['variant'])) {
                    continue;
                }
                $tally[$r['productId']][$r['variant']] = ($tally[$r['productId']][$r['variant']] ?? 0) + (int) ($s->quantity ?? 0);
                $count[$r['productId']] = ($count[$r['productId']] ?? 0) + 1;
            }

            $variantShares = [];
            foreach ($tally as $pid => $byVariant) {
                $total  = array_sum($byVariant);
                $orders = $count[$pid] ?? 0;
                $variantShares[$pid] = [
                    'orders'     => $orders,
                    'windowDays' => $windowDays,
                    // Below the floor a split built on a couple of orders is noise,
                    // so the page is told to offer only the combined series.
                    'sufficient' => $orders >= $minOrders,
                    'shares'     => $total > 0
                        ? array_map(fn ($q) => round($q / $total, 4), $byVariant)
                        : [],
                ];
            }

            return [
                'motherItems'       => $motherItems,
                'materialIndex'     => $materialIndex,
                'unlinked'          => $unlinked,
                'saleResolution'    => $resolution,
                'variantShares'     => $variantShares,
                'supplierLeadTimes' => $this->supplierLeadTimes(),
                'config'            => [
                    'windowDays'          => $windowDays,
                    'minOrders'           => $minOrders,
                    'leadTimeMinReceipts' => self::LEAD_TIME_MIN_RECEIPTS,
                ],
            ];
        }
    }

    /**
     * Resolve one sales productName to a product and, where the name carries it,
     * a variant. Returns null when the name is genuinely ambiguous, so the page
     * can report it rather than silently attaching the rows to one product.
     */
    private function resolveSaleName(
        string $name,
        array $productByName,
        array $aliases,
        array $legacyMap,
        array $legacyVar,
        array $unresolved
    ): ?array {
        $trim  = trim($name);
        $lower = mb_strtolower($trim);

        foreach ($unresolved as $u) {
            if (mb_strtolower(trim($u)) === $lower) {
                return null;
            }
        }

        // Exact product name - an online sale with no variant
        if (isset($productByName[$lower])) {
            return ['productId' => $productByName[$lower], 'productName' => $trim, 'variant' => null, 'era' => 'online'];
        }

        // "Product Name (Variant)" - the shape OrderController writes
        $names = array_keys($productByName);
        foreach ($aliases as $from => $to) {
            $names[] = mb_strtolower($from);
        }
        usort($names, fn ($a, $b) => mb_strlen($b) <=> mb_strlen($a));

        foreach ($names as $candidate) {
            $prefix = $candidate . ' (';
            if (str_starts_with($lower, $prefix) && str_ends_with($trim, ')')) {
                $variant = mb_substr($trim, mb_strlen($candidate) + 2, -1);
                $pid     = $productByName[$candidate] ?? null;
                if ($pid === null) {
                    foreach ($aliases as $from => $to) {
                        if (mb_strtolower($from) === $candidate) {
                            $pid = $productByName[mb_strtolower($to)] ?? null;
                        }
                    }
                }
                if ($pid !== null) {
                    return ['productId' => $pid, 'productName' => $trim, 'variant' => trim($variant), 'era' => 'online'];
                }
            }
        }

        // Alias with no variant
        foreach ($aliases as $from => $to) {
            if (mb_strtolower($from) === $lower) {
                $pid = $productByName[mb_strtolower($to)] ?? null;
                if ($pid !== null) {
                    return ['productId' => $pid, 'productName' => $trim, 'variant' => null, 'era' => 'online'];
                }
            }
        }

        // Imported 2023-2025 history, recorded at mother-item level
        foreach ($legacyMap as $from => $to) {
            if (mb_strtolower(trim($from)) === $lower) {
                $pid = $productByName[mb_strtolower($to)] ?? null;
                if ($pid !== null) {
                    return [
                        'productId'   => $pid,
                        'productName' => $to,
                        'variant'     => $legacyVar[$from] ?? null,
                        'era'         => 'legacy',
                    ];
                }
            }
        }

        return null;
    }

    /**
     * Reduce a sale's variant string to one of the product's real combination
     * names. Returns the original when nothing matches, so the caller can see
     * that it went unmatched rather than silently getting null.
     */
    private function pinVariant(string $variant, array $known): string
    {
        if (count($known) === 0) {
            return $variant;
        }

        foreach ($known as $k) {
            if (mb_strtolower(trim($k)) === mb_strtolower(trim($variant))) {
                return $k;
            }
        }

        // Combination labels join variant groups with a middle dot or slash
        $parts = preg_split('/\s*[·•\/,]\s*/u', $variant) ?: [];
        foreach ($parts as $part) {
            foreach ($known as $k) {
                if (mb_strtolower(trim($k)) === mb_strtolower(trim($part))) {
                    return $k;
                }
            }
        }

        // A shorthand from the imported history ("Medium") against a fuller
        // combination label ("Medium (12x14\")").
        foreach ($parts as $part) {
            $part = mb_strtolower(trim($part));
            if ($part === '') {
                continue;
            }
            foreach ($known as $k) {
                if (str_starts_with(mb_strtolower(trim($k)), $part)) {
                    return $k;
                }
            }
        }

        return $variant;
    }

    /** MongoDB hands back BSONArray/BSONDocument, which is not a PHP array. */
    private function toArray($v): array
    {
        if (is_array($v)) {
            return $v;
        }
        if ($v instanceof \Traversable) {
            return iterator_to_array($v);
        }
        if (is_object($v)) {
            return (array) $v;
        }

        return [];
    }
}
