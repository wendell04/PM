<?php

namespace App\Support;

use App\Models\Order;
use App\Models\Sale;
use App\Models\StockHistory;
use Illuminate\Support\Carbon;

/**
 * Daily demand for one material, in material units - the series the forecast
 * plans against.
 *
 * This is the server-side twin of buildMaterialDemand in the SSA forecast
 * page, kept rule-for-rule identical so the nightly plan and the page never
 * disagree about what was consumed:
 *
 *   1. The stock ledger wins wherever it reaches. A deduction is consumption
 *      when its reason is "production", or "sale_reserved" on an order that
 *      stood (ready-made stock, where the hold IS the sale). Scrap, damage,
 *      and holds on cancelled or returned orders are not demand.
 *
 *   2. Before the ledger existed, sales x bill of materials: each sale is
 *      resolved to a product and variant through the forecast taxonomy, then
 *      to the materials that variant's recipe consumes. Allocation is exact
 *      where the material is used by every variant at the same rate, by
 *      recent variant share where the sale names no variant and there are
 *      enough recent orders to trust a split, and divided evenly below that
 *      floor - labelled, never dropped.
 *
 * Deliberately NOT MaterialUsage. That helper sums every deduction over the
 * last 90 days as a plain rate for To Buy's cover figure; this one keeps the
 * daily shape and excludes what was not actually consumed.
 */
class MaterialDemand
{
    /** @var array<string, string> orderId => normalised status, loaded once */
    private array $orderStatus = [];

    /** @var array<string, array<string,mixed>> the forecast taxonomy, built once */
    private array $taxonomy;

    /** @var array<int, array<string,mixed>> completed sales, loaded once */
    private array $sales;

    public function __construct(array $taxonomy)
    {
        $this->taxonomy = $taxonomy;
        $this->sales = Sale::where('status', 'completed')
            ->get(['productName', 'productId', 'variantName', 'quantity', 'saleDate'])
            ->map(fn ($s) => [
                'productName' => (string) $s->productName,
                'productId'   => $s->productId ? (string) $s->productId : null,
                'variantName' => $s->variantName ?? null,
                'quantity'    => (int) ($s->quantity ?? 0),
                'date'        => $s->saleDate ? Carbon::parse($s->saleDate)->format('Y-m-d') : null,
            ])
            ->filter(fn ($s) => $s['date'] !== null && $s['quantity'] > 0)
            ->values()
            ->all();

        // Raw distinct, not the Eloquent distinct()->pluck() chain: on this
        // driver that chain hands back a list of nulls, and a silently empty
        // map would let every cancelled-order hold count as consumption.
        $ids = \Illuminate\Support\Facades\DB::connection('mongodb')
            ->getCollection('stock_histories')
            ->distinct('orderId', ['type' => 'deduction', 'orderId' => ['$ne' => null]]);
        $objectIds = [];
        foreach ($ids as $oid) {
            if ($oid === null || $oid === '') {
                continue;
            }
            try { $objectIds[] = new \MongoDB\BSON\ObjectId((string) $oid); } catch (\Throwable $e) {}
        }
        if (count($ids) > 0 && count($objectIds) === 0) {
            throw new \RuntimeException('MaterialDemand: could not read any order id from the ledger - refusing to build a map that would count cancelled holds as demand.');
        }
        if ($objectIds) {
            foreach (Order::whereIn('_id', $objectIds)->get(['_id', 'orderStatus']) as $o) {
                $this->orderStatus[(string) $o->_id] = (string) OrderStatus::normalize($o->orderStatus);
            }
        }
    }

    /**
     * @return array{rows: array<int, array{date:string,value:float}>, linked: bool, source: string, basis: array<string,mixed>}
     */
    public function seriesFor(string $inventoryId): array
    {
        $entry = $this->taxonomy['materialIndex'][$inventoryId] ?? null;
        if (! $entry) {
            return ['rows' => [], 'linked' => false, 'source' => 'none', 'basis' => []];
        }

        $ledger = $this->ledgerRows($inventoryId);
        if (count($ledger) > 0) {
            return ['rows' => $ledger, 'linked' => true, 'source' => 'ledger',
                    'basis' => ['ledgerFrom' => $ledger[0]['date'], 'consumers' => $this->consumerNames($entry)]];
        }

        $sales = $this->salesRows($inventoryId, $entry);
        return ['rows' => $sales, 'linked' => true, 'source' => 'sales',
                'basis' => ['consumers' => $this->consumerNames($entry)]];
    }

    // ── ledger ────────────────────────────────────────────────────────────

    private function isConsumption(StockHistory $h): bool
    {
        $reason = (string) ($h->reason ?? '');
        if ($reason === 'production') {
            return true;
        }
        if ($reason === 'sale_reserved') {
            $st = $this->orderStatus[(string) ($h->orderId ?? '')] ?? null;
            return $st !== 'cancelled' && $st !== 'returned';
        }
        return false;
    }

    /** @return array<int, array{date:string,value:float}> */
    private function ledgerRows(string $inventoryId): array
    {
        $byDay = [];
        $rows = StockHistory::where('inventoryId', $inventoryId)->where('type', 'deduction')->get();
        foreach ($rows as $h) {
            if (! $this->isConsumption($h)) {
                continue;
            }
            $qty = abs((float) ($h->quantity ?? 0));
            if ($qty <= 0 || ! $h->createdAt) {
                continue;
            }
            $day = Carbon::parse($h->createdAt)->format('Y-m-d');
            $byDay[$day] = ($byDay[$day] ?? 0) + $qty;
        }
        ksort($byDay);
        return array_map(fn ($d, $v) => ['date' => $d, 'value' => round($v, 2)], array_keys($byDay), array_values($byDay));
    }

    // ── sales x BOM ───────────────────────────────────────────────────────

    /** @return array<int, array{date:string,value:float}> */
    private function salesRows(string $inventoryId, array $entry): array
    {
        $planByProduct = [];
        foreach ($entry['consumers'] as $c) {
            $planByProduct[$c['productId']]['covered'][] = $c;
        }

        $byDay = [];
        foreach ($this->sales as $s) {
            $r = $this->resolve($s);
            if (! $r) {
                continue;
            }
            $plan = $planByProduct[$r['productId']] ?? null;
            if (! $plan) {
                continue;
            }
            $qty = $s['quantity'];
            $variantsOfProduct = count($this->variantNamesFor($r['productId']));
            $coversEveryVariant = $variantsOfProduct === 0
                || count($plan['covered']) >= $variantsOfProduct
                || array_filter($plan['covered'], fn ($c) => $c['variantName'] === null);

            $units = 0.0;
            if ($r['variant'] !== null) {
                foreach ($plan['covered'] as $c) {
                    if ($c['variantName'] === null || $c['variantName'] === $r['variant']) {
                        $units = $qty * (float) $c['qtyPerUnit'];
                        break;
                    }
                }
            } elseif ($coversEveryVariant) {
                $units = $qty * (float) $plan['covered'][0]['qtyPerUnit'];
            } else {
                $vs = $this->taxonomy['variantShares'][$r['productId']] ?? null;
                if ($vs && ! empty($vs['sufficient'])) {
                    foreach ($plan['covered'] as $c) {
                        $units += $qty * (float) $c['qtyPerUnit'] * (float) ($vs['shares'][$c['variantName']] ?? 0);
                    }
                } elseif ($variantsOfProduct > 0) {
                    foreach ($plan['covered'] as $c) {
                        $units += ($qty * (float) $c['qtyPerUnit']) / $variantsOfProduct;
                    }
                }
            }
            if ($units <= 0) {
                continue;
            }
            $byDay[$s['date']] = ($byDay[$s['date']] ?? 0) + $units;
        }
        ksort($byDay);
        return array_map(fn ($d, $v) => ['date' => $d, 'value' => round($v, 2)], array_keys($byDay), array_values($byDay));
    }

    /** @return array{productId:string, variant:?string}|null */
    private function resolve(array $sale): ?array
    {
        // Sales written since the productId link resolve directly - but the
        // variant label is as the customer chose it ("Glossy · Diecut") and
        // must be pinned to a BOM-bearing variant just as the taxonomy does.
        if ($sale['productId']) {
            return [
                'productId' => $sale['productId'],
                'variant'   => $this->pinVariant($sale['variantName'], $this->variantNamesFor($sale['productId'])),
            ];
        }
        $r = $this->taxonomy['saleResolution'][$sale['productName']] ?? null;
        return $r ? ['productId' => $r['productId'], 'variant' => $r['variant'] ?? null] : null;
    }

    /** @return string[] */
    private function variantNamesFor(string $productId): array
    {
        foreach ($this->taxonomy['motherItems'] as $m) {
            if ($m['productId'] === $productId) {
                return $m['variants'] ?? [];
            }
        }
        return [];
    }

    private function pinVariant(?string $variant, array $known): ?string
    {
        if ($variant === null || $variant === '' || count($known) === 0) {
            return $variant;
        }
        $norm = fn ($s) => mb_strtolower(trim((string) $s));
        $v = $norm($variant);
        foreach ($known as $k) {
            if ($norm($k) === $v) return $k;
        }
        $parts = array_filter(array_map($norm, preg_split('/\s*[·•\/,]\s*/u', $variant) ?: []));
        foreach ($parts as $part) {
            foreach ($known as $k) {
                if ($norm($k) === $part) return $k;
            }
        }
        foreach ($parts as $part) {
            foreach ($known as $k) {
                if (str_starts_with($norm($k), $part)) return $k;
            }
        }
        return $variant;
    }

    /** @return string[] */
    private function consumerNames(array $entry): array
    {
        $names = [];
        foreach ($entry['consumers'] as $c) {
            $names[$c['variantName'] ? $c['productName'] . ' · ' . $c['variantName'] : $c['productName']] = true;
        }
        return array_keys($names);
    }
}
