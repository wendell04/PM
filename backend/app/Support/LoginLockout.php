<?php

namespace App\Support;

use App\Models\User;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cache;

/**
 * The sign-in lockout (manuscript p. 11, "account lockout mechanisms after multiple failed login
 * attempts"), done the way the OWASP Authentication Cheat Sheet asks:
 *
 * - Time-based, never permanent: 5 wrong passwords lock the account for 15 minutes. Each lock
 *   after that, without a good sign-in in between, lasts longer: 30 minutes, 1 hour, then 24 hours.
 * - The ladder starts over after a successful sign-in, a password reset, an unlock by the shop,
 *   or a full day with no wrong password.
 * - The owner can always get in now by resetting the password (proves they own the email), so
 *   someone guessing on purpose cannot keep a customer out.
 * - An email with no account walks the same ladder and gets the same message, so "locked" never
 *   tells a guesser that the address is registered.
 */
final class LoginLockout
{
    public const MAX_ATTEMPTS = 5;

    /** Minutes for the 1st, 2nd, 3rd and every later lock. */
    public const LADDER = [15, 30, 60, 1440];

    /** A day with no wrong password forgets the earlier ones. */
    public const QUIET_HOURS = 24;

    /** Minutes left on an active lock, or 0. */
    public static function minutesLeft(?Carbon $until): int
    {
        if (!$until || now()->gte($until)) return 0;
        return max(1, (int) ceil(now()->diffInSeconds($until) / 60));
    }

    /**
     * Count one wrong password against a real account. Returns the minutes of the lock it just
     * started, or null when it did not lock. The caller saves the user.
     */
    public static function recordFailure(User $user): ?int
    {
        $last = $user->last_failed_login_at;
        if ($last && Carbon::parse($last)->lt(now()->subHours(self::QUIET_HOURS))) {
            $user->failed_login_attempts = 0;
            $user->lockout_level = 0;
        }

        $user->failed_login_attempts = (int) ($user->failed_login_attempts ?? 0) + 1;
        $user->last_failed_login_at  = now();
        if ($user->failed_login_attempts < self::MAX_ATTEMPTS) return null;

        $level   = (int) ($user->lockout_level ?? 0);
        $minutes = self::LADDER[min($level, count(self::LADDER) - 1)];
        $user->login_locked_until    = now()->addMinutes($minutes);
        $user->lockout_level         = $level + 1;
        $user->failed_login_attempts = 0;
        return $minutes;
    }

    /** Good sign-in, password reset, or the shop's Unlock: start over. The caller saves. */
    public static function clear(User $user): void
    {
        $user->failed_login_attempts = 0;
        $user->login_locked_until    = null;
        $user->lockout_level         = 0;
        $user->last_failed_login_at  = null;
    }

    // An email with no account. Same ladder, kept in the cache, never in the database.

    private static function key(string $email): string
    {
        return 'login-lock:' . sha1(strtolower(trim($email)));
    }

    public static function unknownMinutesLeft(string $email): int
    {
        $s = Cache::get(self::key($email));
        return $s && !empty($s['until']) ? self::minutesLeft(Carbon::createFromTimestamp($s['until'])) : 0;
    }

    public static function recordUnknownFailure(string $email): ?int
    {
        $s = Cache::get(self::key($email)) ?: ['attempts' => 0, 'level' => 0, 'until' => null, 'last' => null];
        if ($s['last'] && $s['last'] < now()->subHours(self::QUIET_HOURS)->getTimestamp()) {
            $s['attempts'] = 0;
            $s['level'] = 0;
        }
        $s['attempts']++;
        $s['last'] = now()->getTimestamp();
        $minutes = null;
        if ($s['attempts'] >= self::MAX_ATTEMPTS) {
            $minutes = self::LADDER[min($s['level'], count(self::LADDER) - 1)];
            $s['until'] = now()->addMinutes($minutes)->getTimestamp();
            $s['level']++;
            $s['attempts'] = 0;
        }
        Cache::put(self::key($email), $s, now()->addHours(self::QUIET_HOURS + 25));
        return $minutes;
    }

    /** "15 minutes", "1 hour", "24 hours". */
    public static function duration(int $minutes): string
    {
        if ($minutes < 60) return $minutes . ' minute' . ($minutes === 1 ? '' : 's');
        $h = (int) ceil($minutes / 60);
        return $h . ' hour' . ($h === 1 ? '' : 's');
    }

    /** One message for every locked sign-in, account or not. */
    public static function message(int $minutes): string
    {
        return 'Too many wrong passwords. Try again in ' . self::duration($minutes)
            . ', or reset your password to get in now.';
    }
}
