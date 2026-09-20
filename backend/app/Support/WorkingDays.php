<?php

namespace App\Support;

use Carbon\Carbon;

/**
 * Which days the shop actually works, in one place.
 *
 * Every delivery promise counts forward in "business days", and three copies of that loop existed
 * - order creation, the clock restart, and the job-order screen - each skipping Sundays and
 * nothing else. Christmas Day counted as a working day: an order placed on 23 December promised
 * delivery on the 29th, straight through the 25th.
 *
 * Saturday is a working day here. That is deliberate and matches how the shop runs; it is not an
 * oversight inherited from a calendar library.
 *
 * Holidays come from Settings so the shop keeps its own list - the Philippines moves several of
 * them every year by proclamation, and a hardcoded table is wrong by February.
 */
class WorkingDays
{
    /**
     * Regular Philippine holidays that fall on the same date every year. Ones that move -
     * Holy Week, Eid, and anything moved by proclamation - belong in the Settings list, which
     * is why this stays short rather than pretending to be complete.
     */
    private const FIXED = [
        '01-01',  // New Year's Day
        '04-09',  // Araw ng Kagitingan
        '05-01',  // Labor Day
        '06-12',  // Independence Day
        '08-21',  // Ninoy Aquino Day
        '11-01',  // All Saints' Day
        '11-30',  // Bonifacio Day
        '12-25',  // Christmas Day
        '12-30',  // Rizal Day
        '12-31',  // New Year's Eve
    ];

    /** 0=Sunday .. 6=Saturday. Default: closed Sunday, open Monday to Saturday. */
    private const DEFAULT_OPEN = [1, 2, 3, 4, 5, 6];

    public static function openWeekdays(): array
    {
        $raw = ShopSettings::get('workingDays', null);
        if (!is_array($raw) || $raw === []) return self::DEFAULT_OPEN;
        $out = [];
        foreach ($raw as $v) {
            $n = (int) $v;
            if ($n >= 0 && $n <= 6) $out[] = $n;
        }
        // An empty list would mean the shop never opens and every estimate would run to the
        // guard limit. Treat it as "not configured" instead.
        return $out === [] ? self::DEFAULT_OPEN : array_values(array_unique($out));
    }

    public static function isWorkingDay(Carbon $d): bool
    {
        if (!in_array((int) $d->dayOfWeek, self::openWeekdays(), true)) return false;
        if (in_array($d->format('m-d'), self::FIXED, true)) return false;
        return !in_array($d->toDateString(), self::extraHolidays(), true);
    }

    /**
     * N working days after $from. Never counts the starting day itself - a job accepted today
     * starts tomorrow, which is what "three days" means to the person waiting.
     */
    public static function add(Carbon $from, int $days): Carbon
    {
        $d = $from->copy();
        $guard = 0;
        while ($days > 0 && $guard < 400) {
            $d = $d->addDay();
            $guard++;
            if (self::isWorkingDay($d)) $days--;
        }
        return $d;
    }

    /** N working days before $from - used to schedule a job backwards from its delivery date. */
    public static function subtract(Carbon $from, int $days): Carbon
    {
        $d = $from->copy();
        $guard = 0;
        while ($days > 0 && $guard < 400) {
            $d = $d->subDay();
            $guard++;
            if (self::isWorkingDay($d)) $days--;
        }
        return $d;
    }

    /** The shop's own closures: proclaimed holidays, Holy Week, stock-taking, anything. */
    public static function extraHolidays(): array
    {
        $raw = ShopSettings::get('holidays', null);
        if (!is_array($raw)) return [];
        $out = [];
        foreach ($raw as $v) {
            $s = is_string($v) ? trim($v) : '';
            if ($s !== '') $out[] = substr($s, 0, 10);
        }
        return $out;
    }
}
