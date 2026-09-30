<?php

namespace App\Http\Controllers;

use App\Models\Product;
use App\Models\Sale;
use App\Models\SaleImportBatch;
use App\Support\CostResolver;
use Carbon\Carbon;
use Illuminate\Http\Request;

/**
 * Sales made outside the system: recorded one at a time, or imported from the owner's spreadsheet.
 *
 * Both land in `sales` as source "manual" ("Recorded by hand" on Reports), which is also what the
 * forecast reads - so a missed sale added here counts in revenue, profit and the SSA like any other.
 * Only these lines can be edited or removed here; an online or counter sale belongs to its order.
 *
 * Dates are whole days in Manila time. The import takes YYYY-MM-DD (or a real Excel date) and refuses
 * 01/05/2023: that is how the 2023-2025 history ended up with 127 sales in the wrong month, when a
 * spreadsheet set to day/month read month/day dates.
 */
class ManualSaleController extends Controller
{
    private const TZ = 'Asia/Manila';
    public const CHANNELS = ['Walk-in', 'Online', 'Bulk/B2B', 'Other'];
    private const MAX_ROWS = 2000;

    private function mayView(Request $r): bool   { return (bool) $this->hasPermission($r, 'sales.view'); }
    private function mayRecord(Request $r): bool { return \App\Support\Rbac::allows($r->user(), 'sales.record'); }

    /** GET /admin/sales/manual - the hand-recorded lines, newest sale first, plus the recent imports. */
    public function index(Request $request)
    {
        if (!$this->mayView($request)) return $this->unauthorizedResponse();

        $q = Sale::where('source', 'manual');
        if ($s = trim((string) $request->query('search', ''))) {
            $q->where('productName', 'regex', new \MongoDB\BSON\Regex(preg_quote(mb_substr($s, 0, 80), '/'), 'i'));
        }
        if ($from = $this->day((string) $request->query('from', ''))) $q->where('saleDate', '>=', $from);
        if ($to = $this->day((string) $request->query('to', ''))) $q->where('saleDate', '<=', $to->copy()->endOfDay());
        if ($b = (string) $request->query('batch', '')) $q->where('importBatch', $b);

        $per   = in_array((int) $request->query('perPage'), [10, 25, 50], true) ? (int) $request->query('perPage') : 10;
        $page  = max(1, min(1000, (int) $request->query('page', 1)));
        $total = (clone $q)->count();
        $sum   = (clone $q)->get(['totalPrice', 'cost', 'totalCost', 'costPerUnit', 'quantity']);
        $rows  = $q->orderBy('saleDate', 'desc')->skip(($page - 1) * $per)->take($per)->get()->map(fn ($s) => $this->row($s));

        return $this->successResponse('Recorded sales.', [
            'rows'    => $rows,
            'total'   => $total,
            'page'    => $page,
            'perPage' => $per,
            'revenue' => round($sum->sum(fn ($s) => (float) $s->totalPrice), 2),
            'cost'    => round($sum->sum(fn ($s) => Sale::costOf($s)), 2),
            'batches' => SaleImportBatch::orderBy('createdAt', 'desc')->limit(10)->get()->map(fn ($b) => [
                'id' => (string) $b->id, 'fileName' => $b->fileName, 'rows' => $b->rows, 'revenue' => $b->revenue,
                'firstDate' => $b->firstDate, 'lastDate' => $b->lastDate, 'byName' => $b->byName,
                'createdAt' => $b->createdAt?->toIso8601String(), 'undoneAt' => $b->undoneAt?->toIso8601String(),
            ]),
            'canRecord' => $this->mayRecord($request),
            'channels'  => self::CHANNELS,
        ]);
    }

    /** GET /admin/sales/manual/catalog - products with their variants, price and cost, for the form. */
    public function catalog(Request $request)
    {
        if (!$this->mayRecord($request)) return $this->unauthorizedResponse();
        // Prices through the same resolver checkout uses, per quantity band: a tiered product's price
        // depends on how many were sold, so the form re-prices when the qty changes.
        $bands = function (Product $p, ?string $vid): array {
            $tiers = collect((array) ($p->priceTiers ?? []))->map(fn ($t) => (array) $t)->sortBy(fn ($t) => (int) ($t['minQty'] ?? 1))->values();
            if ($tiers->isEmpty()) {
                return [['min' => 1, 'max' => null, 'price' => round((float) (\App\Services\PriceResolver::resolve($p, 1, $vid) ?? 0), 2)]];
            }
            return $tiers->map(fn ($t) => [
                'min' => (int) ($t['minQty'] ?? 1),
                'max' => isset($t['maxQty']) && $t['maxQty'] !== '' ? (int) $t['maxQty'] : null,
                'price' => round((float) (\App\Services\PriceResolver::resolve($p, max(1, (int) ($t['minQty'] ?? 1)), $vid) ?? 0), 2),
            ])->all();
        };
        $out = Product::where('isArchived', '!=', true)->orderBy('name')->get()->map(function (Product $p) use ($bands) {
            $variants = collect((array) ($p->combinations ?? []))->map(function ($c) use ($p, $bands) {
                $c = (array) $c;
                $id = (string) ($c['id'] ?? $c['_id'] ?? '');
                $b = $bands($p, $id ?: null);
                return ['id' => $id, 'name' => (string) ($c['name'] ?? ''), 'price' => $b[0]['price'] ?? 0, 'bands' => $b,
                    'cost' => round(CostResolver::unitCost($p, $id ?: null), 2)];
            })->filter(fn ($v) => $v['name'] !== '')->values();
            $b = $bands($p, null);
            return [
                'id' => (string) $p->id, 'name' => (string) $p->name, 'category' => (string) ($p->category ?? ''),
                'price' => $b[0]['price'] ?? 0, 'bands' => $b, 'cost' => round(CostResolver::unitCost($p), 2),
                'variants' => $variants,
            ];
        })->values();
        return $this->successResponse('Catalog.', $out);
    }

    /**
     * POST /admin/sales/manual - one sale made outside the system, like one receipt: a date, a channel
     * and one or more items. The items share a reference (MAN-...), so Reports counts one order.
     */
    public function store(Request $request)
    {
        if (!$this->mayRecord($request)) return $this->unauthorizedResponse();
        $items = array_values((array) $request->input('items', []));
        if (!$items) return $this->errorResponse('Add at least one item.', 422);
        if (count($items) > 50) return $this->errorResponse('Up to 50 items in one sale. Use Import sales for more.', 422);

        $shared = ['date' => $request->input('date'), 'channel' => $request->input('channel'), 'notes' => $request->input('notes')];
        $clean = [];
        foreach ($items as $i => $item) {
            [$c, $errors] = $this->clean(array_merge((array) $item, $shared));
            if ($errors) {
                return $this->errorResponse((count($items) > 1 ? 'Item ' . ($i + 1) . ': ' : '') . $errors[0], 422, ['item' => $i, 'errors' => $errors]);
            }
            $clean[] = $c;
        }
        $ref = 'MAN-' . strtoupper(substr(bin2hex(random_bytes(4)), 0, 7));
        $rows = [];
        foreach ($clean as $c) $rows[] = $this->row(Sale::create(array_merge($this->attributes($c, $request, null), ['orderRef' => $ref])));

        $total = array_sum(array_column($clean, 'total'));
        $what = count($clean) === 1 ? "{$clean[0]['quantity']} x {$clean[0]['productName']}" : count($clean) . ' items';
        $this->logActivity($request, 'sale.recorded', 'sale', $ref,
            "Recorded a sale by hand ({$ref}): {$what} on {$clean[0]['date']}, ₱" . number_format($total, 2));
        return $this->successResponse('Sale recorded. It now counts in Sales, Reports and the forecast.', ['ref' => $ref, 'rows' => $rows], 201);
    }

    /** PUT /admin/sales/manual/{id} - fix a hand-recorded line. */
    public function update(Request $request, string $id)
    {
        if (!$this->mayRecord($request)) return $this->unauthorizedResponse();
        $sale = Sale::find($id);
        if (!$sale || $sale->source !== 'manual') return $this->notFoundResponse('Recorded sale');
        [$clean, $errors] = $this->clean($request->all());
        if ($errors) return $this->errorResponse($errors[0], 422, ['errors' => $errors]);

        $before = $this->row($sale);
        // Who recorded it and when stay as they were; the change itself goes to the audit log.
        $attrs = array_diff_key($this->attributes($clean, $request, $sale->importBatch), array_flip(['createdAt', 'recordedById', 'recordedByName']));
        $sale->fill($attrs)->save();
        $this->logActivity($request, 'sale.updated', 'sale', (string) $sale->id,
            "Changed a recorded sale: {$before['productName']} on {$before['date']}", ['before' => $before, 'after' => $this->row($sale)]);
        return $this->successResponse('Sale updated.', $this->row($sale));
    }

    /** DELETE /admin/sales/manual/{id}?reason= - take a hand-recorded line out. */
    public function destroy(Request $request, string $id)
    {
        if (!$this->mayRecord($request)) return $this->unauthorizedResponse();
        $sale = Sale::find($id);
        if (!$sale || $sale->source !== 'manual') return $this->notFoundResponse('Recorded sale');
        $reason = mb_substr(trim(strip_tags((string) $request->input('reason', ''))), 0, 200);
        if ($reason === '') return $this->errorResponse('Say why this sale is being removed.', 422);
        $row = $this->row($sale);
        $sale->delete();
        $this->logActivity($request, 'sale.deleted', 'sale', $id,
            "Removed a recorded sale: {$row['quantity']} x {$row['productName']} on {$row['date']} - {$reason}", ['sale' => $row, 'reason' => $reason]);
        return $this->successResponse('Sale removed.');
    }

    /** POST /admin/sales/manual/import/check - read the rows, say what is wrong, save nothing. */
    public function check(Request $request)
    {
        if (!$this->mayRecord($request)) return $this->unauthorizedResponse();
        $rows = (array) $request->input('rows', []);
        if (count($rows) === 0) return $this->errorResponse('The file has no sales rows.', 422);
        if (count($rows) > self::MAX_ROWS) return $this->errorResponse('Up to ' . self::MAX_ROWS . ' rows per file. Split it into smaller files.', 422);
        return $this->successResponse('Checked.', $this->checkRows($rows));
    }

    /** POST /admin/sales/manual/import - save the good rows as one batch that can be undone. */
    public function import(Request $request)
    {
        if (!$this->mayRecord($request)) return $this->unauthorizedResponse();
        $rows = (array) $request->input('rows', []);
        if (count($rows) === 0) return $this->errorResponse('Nothing to import.', 422);
        if (count($rows) > self::MAX_ROWS) return $this->errorResponse('Up to ' . self::MAX_ROWS . ' rows per file.', 422);
        $checked = $this->checkRows($rows);
        $good = array_values(array_filter($checked['rows'], fn ($r) => !$r['errors']));
        if (!$good) return $this->errorResponse('No row can be imported. Fix the rows marked in red.', 422);

        $me = $request->user();
        $batch = SaleImportBatch::create([
            'fileName'  => mb_substr(trim(strip_tags((string) $request->input('fileName', 'import'))), 0, 120),
            'rows'      => count($good),
            'revenue'   => round(array_sum(array_map(fn ($r) => $r['clean']['total'], $good)), 2),
            'firstDate' => min(array_map(fn ($r) => $r['clean']['date'], $good)),
            'lastDate'  => max(array_map(fn ($r) => $r['clean']['date'], $good)),
            'byId'      => (string) $me->id,
            'byName'    => trim(($me->firstName ?? '') . ' ' . ($me->lastName ?? '')),
            'createdAt' => now(),
        ]);
        foreach ($good as $r) Sale::create($this->attributes($r['clean'], $request, (string) $batch->id));

        $skipped = count($checked['rows']) - count($good);
        $this->logActivity($request, 'sale.imported', 'sale_import', (string) $batch->id,
            "Imported {$batch->rows} sales from {$batch->fileName} ({$batch->firstDate} to {$batch->lastDate}), ₱" . number_format($batch->revenue, 2)
            . ($skipped ? ", {$skipped} row(s) left out" : ''));
        return $this->successResponse("Imported {$batch->rows} sales." . ($skipped ? " {$skipped} row(s) with errors were left out." : ''),
            ['batchId' => (string) $batch->id, 'imported' => $batch->rows, 'skipped' => $skipped]);
    }

    /** POST /admin/sales/manual/import/{id}/undo - take a whole import back out. */
    public function undo(Request $request, string $id)
    {
        if (!$this->mayRecord($request)) return $this->unauthorizedResponse();
        $batch = SaleImportBatch::find($id);
        if (!$batch) return $this->notFoundResponse('Import');
        if ($batch->undoneAt) return $this->errorResponse('This import was already undone.', 422);
        $n = Sale::where('source', 'manual')->where('importBatch', (string) $batch->id)->delete();
        $me = $request->user();
        $batch->fill(['undoneAt' => now(), 'undoneBy' => trim(($me->firstName ?? '') . ' ' . ($me->lastName ?? ''))])->save();
        $this->logActivity($request, 'sale.import_undone', 'sale_import', (string) $batch->id,
            "Undid the import of {$batch->fileName}: {$n} sales removed");
        return $this->successResponse("Import undone: {$n} sales removed.");
    }

    // ── helpers ──────────────────────────────────────────────────────────────

    /** One row as the page shows it. */
    private function row(Sale $s): array
    {
        $d = $s->saleDate ? Carbon::parse($s->saleDate)->timezone(self::TZ) : null;
        return [
            'id' => (string) $s->id, 'date' => $d?->toDateString(), 'productName' => (string) $s->productName,
            'category' => (string) ($s->category ?? ''), 'channel' => (string) ($s->salesChannel ?? ''),
            'quantity' => (int) $s->quantity, 'unitPrice' => (float) ($s->unitPrice ?? $s->pricePerUnit ?? 0),
            'total' => (float) $s->totalPrice, 'costPerUnit' => (float) ($s->costPerUnit ?? ($s->quantity ? Sale::costOf($s) / $s->quantity : 0)),
            'cost' => Sale::costOf($s), 'profit' => round((float) $s->totalPrice - Sale::costOf($s), 2),
            'notes' => (string) ($s->notes ?? ''), 'productId' => $s->productId ? (string) $s->productId : null,
            'variantName' => (string) ($s->variantName ?? ''), 'importBatch' => $s->importBatch ? (string) $s->importBatch : null,
            'recordedBy' => (string) ($s->recordedByName ?? ''), 'ref' => $s->orderRef ? (string) $s->orderRef : null,
        ];
    }

    /** What is stored. Written in both the app's names and the spreadsheet's, so every reader agrees. */
    private function attributes(array $c, Request $request, ?string $batch): array
    {
        $me = $request->user();
        $cost = round($c['costPerUnit'] * $c['quantity'], 2);
        return [
            'productName' => $c['productName'], 'productId' => $c['productId'], 'variantName' => $c['variantName'],
            'category' => $c['category'], 'salesChannel' => $c['channel'],
            'quantity' => $c['quantity'], 'unitPrice' => $c['unitPrice'], 'pricePerUnit' => $c['unitPrice'],
            'totalPrice' => $c['total'], 'costPerUnit' => $c['costPerUnit'], 'totalCost' => $cost, 'cost' => $cost,
            'profit' => round($c['total'] - $cost, 2),
            'saleDate' => Carbon::parse($c['date'], self::TZ)->startOfDay(),
            'source' => 'manual', 'status' => 'completed', 'notes' => $c['notes'], 'importBatch' => $batch,
            'recordedById' => (string) $me->id, 'recordedByName' => trim(($me->firstName ?? '') . ' ' . ($me->lastName ?? '')),
            'createdAt' => now(),
        ];
    }

    /** A Manila day from YYYY-MM-DD, or null. Nothing else is accepted: 01/05/2023 means two dates. */
    private function day(string $v): ?Carbon
    {
        $v = trim($v);
        if (!preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $v, $m) || !checkdate((int) $m[2], (int) $m[3], (int) $m[1])) return null;
        return Carbon::createFromFormat('Y-m-d', $v, self::TZ)->startOfDay();
    }

    private function channel($v): ?string
    {
        $k = strtolower(preg_replace('/[^a-z0-9]/i', '', (string) $v));
        return match (true) {
            $k === '' => 'Other',
            in_array($k, ['walkin', 'walkins', 'store', 'counter', 'shop'], true) => 'Walk-in',
            in_array($k, ['online', 'onlineshop', 'facebook', 'fb', 'shopee', 'lazada', 'messenger'], true) => 'Online',
            in_array($k, ['bulk', 'b2b', 'bulkb2b', 'wholesale'], true) => 'Bulk/B2B',
            $k === 'other' => 'Other',
            default => null,
        };
    }

    /** [clean fields, error list] for one sale, from the form or one import row. */
    private function clean(array $in): array
    {
        $e = [];
        $s = fn ($v, $n) => mb_substr(trim(strip_tags((string) $v)), 0, $n);
        $date = $this->day((string) ($in['date'] ?? ''));
        if (!$date) $e[] = 'Date: use YYYY-MM-DD, for example 2025-01-17.';
        elseif ($date->greaterThan(now(self::TZ)->startOfDay())) $e[] = 'Date: a sale cannot be in the future.';
        elseif ($date->lessThan(Carbon::create(2015, 1, 1, 0, 0, 0, self::TZ))) $e[] = 'Date: before 2015 - check the year.';
        $name = $s($in['productName'] ?? '', 160);
        if ($name === '') $e[] = 'Product: required.';
        $num = fn ($v) => is_numeric(str_replace([',', '₱', ' '], '', (string) $v)) ? (float) str_replace([',', '₱', ' '], '', (string) $v) : null;
        $qty = $num($in['quantity'] ?? null);
        if ($qty === null || $qty < 1 || floor($qty) != $qty || $qty > 100000) $e[] = 'Qty: a whole number from 1 to 100,000.';
        $price = $num($in['unitPrice'] ?? null);
        if ($price === null || $price < 0 || $price > 1000000) $e[] = 'Price per unit: a number from 0 to 1,000,000.';
        $cost = $num($in['costPerUnit'] ?? null);
        if ($cost === null || $cost < 0 || $cost > 1000000) $e[] = 'Cost per unit: a number from 0 to 1,000,000 (0 if it really cost nothing).';
        $channel = $this->channel($in['channel'] ?? '');
        if ($channel === null) $e[] = 'Channel: Walk-in, Online, Bulk/B2B or Other.';
        $productId = $s($in['productId'] ?? '', 64) ?: null;
        if ($productId && !Product::find($productId)) $productId = null;
        return [[
            'date' => $date?->toDateString(), 'productName' => $name, 'productId' => $productId,
            'variantName' => $s($in['variantName'] ?? '', 120) ?: null, 'category' => $s($in['category'] ?? '', 80) ?: 'Uncategorized',
            'channel' => $channel ?? 'Other', 'quantity' => (int) $qty, 'unitPrice' => round((float) $price, 2),
            'costPerUnit' => round((float) $cost, 2), 'total' => round((float) $qty * (float) $price, 2),
            'notes' => $s($in['notes'] ?? '', 500),
        ], $e];
    }

    /** Every row cleaned, with its errors (not imported) and warnings (imported, worth a look). */
    private function checkRows(array $rows): array
    {
        $catalog = Product::get(['name', 'category'])->mapWithKeys(fn ($p) => [mb_strtolower(trim((string) $p->name)) => $p]);
        $out = []; $seen = [];
        foreach (array_values($rows) as $i => $raw) {
            [$c, $errors] = $this->clean((array) $raw);
            $warn = [];
            if (!$errors) {
                $hit = $catalog[mb_strtolower($c['productName'])] ?? null;
                if ($hit) { $c['productId'] = (string) $hit->id; if ($c['category'] === 'Uncategorized' && $hit->category) $c['category'] = (string) $hit->category; }
                else $warn[] = 'Not in the catalog - saved under this name.';
                if ($c['costPerUnit'] == 0) $warn[] = 'Cost is 0 - profit will show as the whole sale.';
                if ($c['costPerUnit'] > $c['unitPrice']) $warn[] = 'Cost is higher than the price - sold at a loss?';
                $key = $c['date'] . '|' . mb_strtolower($c['productName']) . '|' . $c['quantity'] . '|' . $c['total'];
                if (isset($seen[$key])) $warn[] = 'Same as row ' . $seen[$key] . ' in this file.';
                $seen[$key] = $i + 2;
                $day = Carbon::parse($c['date'], self::TZ);
                $dupe = Sale::where('saleDate', '>=', $day->copy()->startOfDay())->where('saleDate', '<=', $day->copy()->endOfDay())
                    ->where('quantity', $c['quantity'])->where('totalPrice', $c['total'])->get(['productName'])
                    ->contains(fn ($s) => mb_strtolower(trim((string) $s->productName)) === mb_strtolower($c['productName']));
                if ($dupe) $warn[] = 'A sale with the same date, product, qty and amount is already recorded.';
            }
            $out[] = ['row' => $i + 2, 'clean' => $c, 'errors' => $errors, 'warnings' => $warn];
        }
        $ok = array_filter($out, fn ($r) => !$r['errors']);
        return [
            'rows'     => $out,
            'good'     => count($ok),
            'bad'      => count($out) - count($ok),
            'warned'   => count(array_filter($ok, fn ($r) => $r['warnings'])),
            'revenue'  => round(array_sum(array_map(fn ($r) => $r['clean']['total'], $ok)), 2),
        ];
    }
}
