<?php

namespace App\Support;

use App\Models\Order;
use Illuminate\Support\Facades\Log;

/**
 * A one-order, time-limited link that lets a customer answer a proof without signing in.
 *
 * Approving a proof is the step the whole order waits on, and until now it required the customer
 * to find the email, remember they have an account, sign in, find the order and then approve.
 * Every one of those is a place a job stalls for a day. Trade printers send the proof with an
 * approve button in the mail, and that is the practice this copies.
 *
 * Three rules it will not bend on:
 *
 *  - The link NEVER approves on its own. Opening it only shows the proof. Mail scanners,
 *    link-preview bots and corporate security appliances fetch every URL in an email; a link that
 *    approves on GET would approve proofs nobody has looked at. Approval is a POST from the page.
 *  - It is signed, so it cannot be guessed or edited into someone else's order, and it carries
 *    its own expiry so a forwarded mail from last month is dead.
 *  - It grants exactly two actions on exactly one order. It is not a session.
 */
class ProofLink
{
    /** How long a proof link stays usable. Long enough for a weekend, short enough to matter. */
    private const TTL_DAYS = 14;

    public static function tokenFor(Order $order): string
    {
        $payload = [
            'o'   => (string) $order->_id,
            'exp' => now()->addDays(self::TTL_DAYS)->timestamp,
        ];
        $body = rtrim(strtr(base64_encode(json_encode($payload)), '+/', '-_'), '=');
        return $body . '.' . self::sign($body);
    }

    /**
     * @return Order|null  the order this token is for, or null when it is invalid, expired,
     *                     tampered with, or the order has moved past needing an answer.
     */
    public static function resolve(?string $token): ?Order
    {
        if (!is_string($token) || !str_contains($token, '.')) return null;

        [$body, $sig] = explode('.', $token, 2);
        if (!hash_equals(self::sign($body), $sig)) return null;

        $json = base64_decode(strtr($body, '-_', '+/'), true);
        if ($json === false) return null;

        $payload = json_decode($json, true);
        if (!is_array($payload) || empty($payload['o']) || empty($payload['exp'])) return null;
        if (now()->timestamp > (int) $payload['exp']) return null;

        try {
            return Order::find((string) $payload['o']);
        } catch (\Throwable $e) {
            Log::warning('ProofLink::resolve failed', ['error' => $e->getMessage()]);
            return null;
        }
    }

    /** The full URL that goes in the email. */
    public static function url(Order $order): string
    {
        $base = rtrim((string) config('app.frontend_url', ''), '/');
        if ($base === '') return '';
        return $base . '/proof/' . self::tokenFor($order);
    }

    private static function sign(string $body): string
    {
        return rtrim(strtr(base64_encode(hash_hmac('sha256', $body, config('app.key'), true)), '+/', '-_'), '=');
    }
}
