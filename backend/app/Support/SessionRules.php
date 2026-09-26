<?php

namespace App\Support;

use Carbon\Carbon;

/**
 * Whether a sign-in (a Sanctum token) can still be used. One rule for the guard that lets a
 * request in and for the Active Sessions list, so the list never shows a device that could not
 * actually get in - or hides one that could.
 *
 * Two limits, the way banks and Google do it:
 *   - its lifetime: expires_at, set at login (a day; with Remember me 30 days for staff, 90 for
 *     customers), under the global SANCTUM_TOKEN_EXPIRATION cap when one is set;
 *   - inactivity: a sign-in nobody has used for IDLE_DAYS is over, whatever its lifetime says.
 *
 * Without the second, a Remember me sign-in on a laptop last opened a month ago stayed valid
 * to the end of its 30 days - and sat in Active Sessions looking like a stale row nobody had
 * cleared, when it was in fact a working key to a staff account.
 */
class SessionRules
{
    public const IDLE_DAYS_STAFF    = 7;
    public const IDLE_DAYS_CUSTOMER = 30;

    public static function idleDays(?string $role): int
    {
        return ($role ?? 'customer') === 'customer' ? self::IDLE_DAYS_CUSTOMER : self::IDLE_DAYS_STAFF;
    }

    public static function isLive($token, ?string $role, ?Carbon $now = null): bool
    {
        $now = $now ?? now();

        if ($token->expires_at && Carbon::parse($token->expires_at)->lte($now)) return false;

        $cap = config('sanctum.expiration');
        if ($cap && $token->created_at && Carbon::parse($token->created_at)->lte($now->copy()->subMinutes((int) $cap))) return false;

        $seen = $token->last_used_at ?? $token->created_at;
        if ($seen && Carbon::parse($seen)->lte($now->copy()->subDays(self::idleDays($role)))) return false;

        return true;
    }
}
