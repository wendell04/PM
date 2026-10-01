<?php

namespace App\Support;

use App\Models\SiteContent;
use Illuminate\Support\Facades\Cache;

/**
 * Which provider order emails try first - a switch in Settings > Integrations.
 *
 * The notification lane is a failover chain, and a failover only moves on when a provider REFUSES.
 * On 2026-10-01 Brevo accepted every email ("Sent") and delivered none, so nothing ever reached
 * Resend. The fix that day was a code change and a redeploy; this makes it a switch the developer
 * can flip and flip back, with the other provider still behind it as the fallback.
 */
class MailRoute
{
    public const KEY = 'mail_routing';
    private const CACHE = 'mail_routing.first';
    private const PROVIDERS = ['brevo', 'resend'];

    /** 'brevo' or 'resend', or null when no choice was made (the config order stands). */
    public static function first(): ?string
    {
        try {
            return Cache::remember(self::CACHE, 30, function () {
                $v = SiteContent::where('key', self::KEY)->first()?->data['first'] ?? null;
                return in_array($v, self::PROVIDERS, true) ? $v : null;
            });
        } catch (\Throwable $e) {
            return null;   // no database, no cache: the config order is a safe default
        }
    }

    public static function set(string $first): void
    {
        $row = SiteContent::where('key', self::KEY)->first();
        $data = ['first' => $first, 'at' => now()->toIso8601String()];
        if ($row) { $row->data = $data; $row->save(); } else { SiteContent::create(['key' => self::KEY, 'data' => $data]); }
        try { Cache::forget(self::CACHE); } catch (\Throwable $e) { /* expires in 30 s anyway */ }
    }

    /**
     * A failover chain in the order it will be tried. Only the order-email lane (the default
     * mailer) follows the switch; the security lane is a different list and is returned as is.
     */
    public static function ordered(array $chain): array
    {
        $lane = (string) config('mail.default');
        $isOrderLane = config("mail.mailers.{$lane}.transport") === 'failover'
            && array_values((array) config("mail.mailers.{$lane}.mailers", [])) === array_values($chain);
        $first = $isOrderLane ? self::first() : null;
        if (!$first || !in_array($first, $chain, true)) return array_values($chain);
        return array_values(array_unique(array_merge([$first], array_diff($chain, [$first]))));
    }
}
