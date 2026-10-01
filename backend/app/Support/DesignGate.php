<?php

namespace App\Support;

use App\Models\Order;

/**
 * A request-design order is paid for in two parts: the design fee at checkout, the goods once the
 * customer approves the proof. Until then the goods are not payable - the design can still change,
 * be redrawn or be cancelled, and the deposit hold and the delivery countdown both start at approval.
 * My Orders offered "Pay P315" on an order still being drawn; this is the one rule every payment
 * path asks. (Mirrored in My Orders as awaitingProofApproval.)
 */
class DesignGate
{
    public static function awaitingApproval(Order $order): bool
    {
        // A quotation's design is inside the quoted price and paid with it.
        if (!empty($order->orderRequestId) || ($order->orderSource ?? null) === 'inquiry') return false;
        $items = (array) ($order->items ?? []);
        $requested = array_filter($items, fn ($i) => !empty($i['designRequested']) || ($i['designMode'] ?? null) === 'request');
        if (!$requested) return false;
        $orderApproved = strtolower((string) ($order->designStatus ?? '')) === 'approved';
        foreach ($requested as $i) {
            $s = strtolower((string) ($i['designStatus'] ?? ''));
            if ($s === 'approved') continue;
            // Older single-design orders only carry the order-level status.
            if ($s === '' && $orderApproved) continue;
            return true;
        }
        return false;
    }

    public const MESSAGE = 'You pay for this order after you approve the proof. We will email you as soon as it is ready - only the design fee is due until then.';
}
