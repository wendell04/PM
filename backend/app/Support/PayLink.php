<?php

namespace App\Support;

use App\Models\Order;
use Illuminate\Support\Facades\Log;

/**
 * A one-order, time-limited link that lets a customer pay what is left on an order without signing in -
 * the "Pay now" button on an invoice email.
 *
 * Signed the same way as the proof link (ProofLink) but it says what it is for, so a proof link can
 * never be used to pay and a pay link can never answer a proof. It shows only the order reference, the
 * customer's first name and the amounts, and it can do exactly one thing: start a PayMongo checkout for
 * that order's balance. Opening it never charges anything (mail scanners open every link).
 */
class PayLink
{
    private const TTL_DAYS = 14;
    private const PURPOSE  = 'pay';

    public static function tokenFor(Order $order): string
    {
        $payload = ['o' => (string) $order->_id, 'p' => self::PURPOSE, 'exp' => now()->addDays(self::TTL_DAYS)->timestamp];
        $body = rtrim(strtr(base64_encode(json_encode($payload)), '+/', '-_'), '=');
        return $body . '.' . self::sign($body);
    }

    /** The order this token is for, or null when it is invalid, expired, tampered with or not a pay link. */
    public static function resolve(?string $token): ?Order
    {
        if (!is_string($token) || strlen($token) > 600 || !str_contains($token, '.')) return null;
        [$body, $sig] = explode('.', $token, 2);
        if (!hash_equals(self::sign($body), $sig)) return null;
        $payload = json_decode((string) base64_decode(strtr($body, '-_', '+/'), true), true);
        if (!is_array($payload) || ($payload['p'] ?? null) !== self::PURPOSE || empty($payload['o']) || empty($payload['exp'])) return null;
        if (now()->timestamp > (int) $payload['exp']) return null;
        try {
            return Order::find((string) $payload['o']);
        } catch (\Throwable $e) {
            Log::warning('PayLink::resolve failed', ['error' => $e->getMessage()]);
            return null;
        }
    }

    public static function url(Order $order): string
    {
        $base = rtrim((string) config('app.frontend_url', ''), '/');
        return $base === '' ? '' : $base . '/pay/' . self::tokenFor($order);
    }

    private static function sign(string $body): string
    {
        // Keyed with the purpose too, so the two link kinds cannot be swapped even by hand.
        return rtrim(strtr(base64_encode(hash_hmac('sha256', self::PURPOSE . '|' . $body, config('app.key'), true)), '+/', '-_'), '=');
    }
}
