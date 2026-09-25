<?php

namespace App\Support;

use Carbon\Carbon;

/**
 * The start and end of a date filter, as dates.
 *
 * Every list with a date filter was comparing the stored date against the TEXT of the request -
 * where('createdAt', '>=', '2026-09-19'). MongoDB stores these as dates and never matches a date
 * against a string, so every window came back empty: Audit Logs showed nothing for Today through
 * Last 90 days while the tiles above it, which did parse, counted sixty entries; Sales found 0 of
 * 27 sales in the last thirty days. Only "All time" worked, because it sends no date at all.
 *
 * One place, so the next filter written is not the sixth copy of the same mistake.
 */
final class RequestDates
{
    public static function start($value): Carbon
    {
        return Carbon::parse($value);
    }

    /**
     * A bare date as an END means the whole of that day. "Up to 26 Sep" parsed to midnight would
     * leave out everything that happened on the 26th.
     */
    public static function end($value): Carbon
    {
        $c = Carbon::parse($value);
        return preg_match('/^\d{4}-\d{2}-\d{2}$/', trim((string) $value)) ? $c->endOfDay() : $c;
    }
}
