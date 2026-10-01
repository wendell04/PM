<?php

namespace App\Support;

use App\Models\Order;

/**
 * An approved proof holds the order (and its materials) until paymentDueAt. After that the order is
 * let go - orders:expire-unpaid-proofs cancels it at 3 AM - so nothing may start a payment for it,
 * and the customer is told why rather than seeing a generic failure.
 */
class PaymentHold
{
    public static function lapsed(Order $order): bool
    {
        if (($order->paymentStatus ?? 'unpaid') !== 'unpaid' || empty($order->paymentDueAt)) return false;
        try {
            return now()->greaterThan(\Carbon\Carbon::parse((string) $order->paymentDueAt));
        } catch (\Throwable $e) {
            return false;
        }
    }

    public static function until(Order $order): ?string
    {
        if (empty($order->paymentDueAt)) return null;
        try { return \Carbon\Carbon::parse((string) $order->paymentDueAt)->timezone('Asia/Manila')->format('M j, Y'); }
        catch (\Throwable $e) { return null; }
    }

    public static function message(Order $order): string
    {
        $until = self::until($order);
        return 'The hold on this order ended' . ($until ? " on {$until}" : '') . ', so it can no longer be paid. '
            . 'Message us in your order chat if you still want it - we can set it up again.';
    }
}
