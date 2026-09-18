<?php

namespace App\Support;

use App\Models\Notification;
use App\Models\Order;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use MongoDB\BSON\ObjectId;

/**
 * An online checkout while the customer is still paying.
 *
 * GCash, Maya and 3DS cards take the customer off the site, so an Order has to exist before they
 * leave: it holds the stock while they pay, and it is what the payment is matched to when they come
 * back. But until the money arrives it is not an order to anyone - the owner said so plainly: a
 * failed payment must not become an order. So it is created with `checkoutPending`: hidden from My
 * Orders and from the admin list, and not announced.
 *
 * - Payment lands     -> confirm(): it becomes an order, and the "order placed" mail and bell go out
 *                        once, saying paid.
 * - Payment fails     -> void(): cancelled, marked `voidedCheckout` so it never shows anywhere, stock
 *                        and promotions returned. The customer is back at checkout with their cart.
 * - Tab just closed   -> orders:void-abandoned-checkouts does the same after MINUTES.
 *
 * Nothing is voided while PayMongo says the money is moving or has moved.
 */
final class CheckoutHold
{
    /** How long an unfinished online checkout keeps its stock. */
    public const MINUTES = 60;

    /** PayMongo's status for a payment intent, or null when it could not be read. */
    public static function intentStatus(?string $intentId): ?string
    {
        if (!$intentId) return null;
        try {
            $res = Http::withBasicAuth((string) config('services.paymongo.secret_key', ''), '')
                ->timeout(10)
                ->get("https://api.paymongo.com/v1/payment_intents/{$intentId}");
            if (!$res->successful()) return null;
            return $res->json()['data']['attributes']['status'] ?? null;
        } catch (\Throwable $e) {
            Log::warning('CheckoutHold::intentStatus failed', ['intentId' => $intentId, 'error' => $e->getMessage()]);
            return null;
        }
    }

    /**
     * The payment was recorded. Idempotent across verifyIntent and the webhook: the flag is flipped
     * in one guarded write, so whichever path gets there first announces and the other does nothing.
     */
    public static function confirm(Order $order): void
    {
        // Money arrived for a checkout that had already been released (a customer finishing an old
        // GCash page long after leaving). Its stock went back and it is cancelled, so it cannot just
        // become an order again - but it must never stay hidden with money on it.
        if ((bool) ($order->voidedCheckout ?? false)) {
            $order->voidedCheckout = false;
            $order->save();
            self::tellStaff(
                'Payment arrived for a released checkout',
                'Order #' . strtoupper(substr((string) $order->_id, -8)) . ' was paid after its checkout had timed out and '
                . 'its stock was released. Check stock and either restore the order or refund the customer.',
                (string) $order->_id
            );
            return;
        }

        if (!(bool) ($order->checkoutPending ?? false)) return;

        $flipped = DB::connection('mongodb')->getCollection('orders')->updateOne(
            ['_id' => new ObjectId((string) $order->_id), 'checkoutPending' => true],
            ['$set' => ['checkoutPending' => false]]
        )->getModifiedCount();
        if ($flipped !== 1) return;

        $order->checkoutPending = false;
        // After the response, like the receipt: the mails are slow, and a payment request that
        // runs past the browser's timeout is how one click once became two charges.
        \Illuminate\Support\defer(fn () => OrderNotifier::placed($order));
    }

    /**
     * Whether an unfinished checkout may be released: nothing received, still at placement, and the
     * gateway has not taken money. A gateway we could not reach counts as "maybe paid" - releasing
     * a paid order is far worse than holding stock a little longer.
     */
    public static function releasable(Order $order): bool
    {
        $received = collect($order->paymentHistory ?? [])->sum(fn ($p) => (float) ($p['amount'] ?? 0));
        if ($received > 0 || !empty($order->designFeePaid)) return false;
        if (!in_array($order->paymentStatus ?? 'unpaid', ['unpaid', '', null], true)) return false;
        if (!in_array(OrderStatus::normalize($order->orderStatus), [OrderStatus::PENDING, 'awaiting_payment'], true)) return false;

        $intentId = $order->paymongoIntentId ?? null;
        if (!$intentId) return true;   // never reached PayMongo at all

        $status = self::intentStatus($intentId);
        if ($status === null) return false;
        return !in_array($status, ['succeeded', 'processing'], true);
    }

    /** Release it: cancelled, never shown, stock and promotions returned. */
    public static function void(Order $order, string $reason): void
    {
        $hidden = (bool) ($order->checkoutPending ?? false);

        $order->orderStatus     = OrderStatus::CANCELLED;
        $order->cancelledBy     = 'system';
        $order->cancelledReason = $reason;
        $order->cancelledAt     = now();
        $order->updatedAt       = now();
        if ($hidden) {
            $order->checkoutPending = false;
            $order->voidedCheckout  = true;
        }
        $order->save();

        // Same release as a cancelled order: BOM holds, ready-made deductions, owed quantities,
        // vouchers and flash-sale units.
        app(\App\Http\Controllers\OrderController::class)->releaseReservationsFor($order);
    }

    private static function tellStaff(string $title, string $message, string $orderId): void
    {
        try {
            foreach (User::whereIn('role', ['admin', 'owner'])->get() as $staff) {
                Notification::create([
                    'user_id'    => (string) $staff->_id,
                    'type'       => 'payment_attention',
                    'title'      => $title,
                    'message'    => $message,
                    'is_read'    => false,
                    'data'       => ['orderId' => $orderId],
                    'created_at' => now(),
                ]);
            }
        } catch (\Throwable $e) {
            Log::warning('CheckoutHold::tellStaff failed', ['error' => $e->getMessage()]);
        }
    }
}
