<?php

namespace App\Console\Commands;

use Carbon\CarbonImmutable;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use MongoDB\BSON\UTCDateTime;

/**
 * php artisan sales:normalize-dates [--apply]
 *
 * The imported sales history stored `saleDate` as a string ("2023-05-01"); the rows the shop
 * writes itself store a real date. Mongo compares by type first, so a string never falls inside
 * a date range - every date-ranged sales query (the Sales module's summary, the reports) silently
 * dropped the entire history and showed only the rows written since go-live.
 *
 * Each string is read as a date in Asia/Manila (a sale "on May 1" is May 1 in the shop's day),
 * stored as a real date, and the original text is kept in `saleDateRaw`. Dry run by default.
 */
class NormalizeSaleDates extends Command
{
    protected $signature   = 'sales:normalize-dates {--apply : Write the converted dates (default is a dry run)}';
    protected $description = 'Convert string saleDate values on the sales ledger into real dates (Asia/Manila)';

    public function handle(): int
    {
        $col   = DB::connection('mongodb')->getCollection('sales');
        $apply = (bool) $this->option('apply');
        $seen = $bad = $done = 0;
        $sample = [];

        foreach ($col->find(['saleDate' => ['$type' => 'string']], ['projection' => ['saleDate' => 1]]) as $doc) {
            $seen++;
            $raw = (string) $doc['saleDate'];
            try {
                $when = CarbonImmutable::parse($raw, 'Asia/Manila');
            } catch (\Throwable) {
                $bad++;
                $this->warn("Unreadable saleDate on {$doc['_id']}: {$raw}");
                continue;
            }
            if (count($sample) < 5) $sample[] = "{$raw} -> {$when->toIso8601String()}";
            if ($apply) {
                $col->updateOne(['_id' => $doc['_id']], ['$set' => [
                    'saleDate'    => new UTCDateTime($when->getTimestampMs()),
                    'saleDateRaw' => $raw,
                ]]);
                $done++;
            }
        }

        $this->info(($apply ? 'Converted' : 'Would convert') . " {$seen} string dates" . ($bad ? " ({$bad} unreadable, left alone)" : ''));
        foreach ($sample as $s) $this->line('  ' . $s);
        if (!$apply) $this->line('Dry run. Re-run with --apply to write.');
        else $this->info("Written: {$done}");
        return self::SUCCESS;
    }
}
