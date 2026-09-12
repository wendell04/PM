<?php

namespace App\Support;

use App\Mail\AdminNewOrderMail;
use App\Mail\OrderConfirmationMail;
use App\Models\Notification;
use App\Models\Order;
use App\Models\User;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;

/**
 * Telling both sides that an order exists.
 *
 * This lived only inside OrderController@store, which is the COD and cart-created path. Every
 * order born in PaymentController - a request-design order the moment its design fee clears, and
 * every quote converted on payment - was created in silence: no confirmation to the customer, no
 * mail or in-app notice to the shop. The customer had paid and been told nothing, and the shop
 * only found out by looking.
 *
 * Every send is wrapped: a mail server having a bad afternoon must never take an order down with
 * it, and by the time this runs the money has already moved.
 */
final class OrderNotifier
{
    public static function placed(Order $order): void
    {
        self::owner($order);
        self::adminInApp($order);
        self::customer($order);
    }

    private static function owner(Order $order): void
    {
        try {
            // env() outside a config file returns null once config is cached, so in production this
            // was addressing owner mail to nothing at all.
            $ownerEmail = config('mail.admin_recipient');
            if (!$ownerEmail) return;

            Mail::to($ownerEmail)->send(new AdminNewOrderMail(
                orderId:       (string) $order->_id,
                customerName:  $order->userSnapshot['name']  ?? 'Unknown',
                customerEmail: $order->userSnapshot['email'] ?? '',
                customerPhone: $order->userSnapshot['phone'] ?? '',
                items:         $order->items ?? [],
                totalAmount:   (float) ($order->totalAmount ?? 0),
                notes:         $order->notes ?? ''
            ));
        } catch (\Exception $e) {
            Log::error('OrderNotifier@owner: ' . $e->getMessage());
        }
    }

    private static function adminInApp(Order $order): void
    {
        try {
            $admin = User::where('role', 'admin')->first();
            if (!$admin) return;

            Notification::create([
                'user_id'    => (string) $admin->_id,
                'type'       => 'new_order',
                'title'      => 'New Order Received',
                'message'    => 'Order #' . strtoupper(substr((string) $order->_id, -8)) .
                                ' placed by ' . ($order->userSnapshot['name'] ?? 'Unknown') . '.',
                'is_read'    => false,
                'data'       => ['orderId' => (string) $order->_id],
                'created_at' => now(),
            ]);
        } catch (\Exception $e) {
            Log::warning('OrderNotifier@adminInApp: ' . $e->getMessage());
        }
    }

    /**
     * What has to happen next, and who does it.
     *
     * Six order shapes - request design, upload, ready-made, and the three mixes - do not need six
     * templates. Six templates is six things to keep in step, which is how three field lists and
     * two address blocks drifted apart in this codebase already. What actually differs is one
     * sentence, and it comes off the lines.
     *
     * The second sentence is the one that earns its place: a mixed order ships together, so the
     * stocked mug waits on the printed hoodie. Unsaid, it arrives later as "why has my mug not
     * shipped, it was in stock".
     *
     * @return array{0:string,1:?string}  headline, and the shipping note when the order is mixed
     */
    private static function nextStep(Order $order): array
    {
        $requested = false;   // artwork we have to draw
        $uploaded  = false;   // artwork they sent, we have to check
        $made      = false;   // made to order with no artwork of its own
        $stocked   = false;   // picked off a shelf

        foreach ($order->items ?? [] as $item) {
            if (!empty($item['designRequested']) || ($item['designMode'] ?? null) === 'request') {
                $requested = true;
            } elseif (!empty($item['designUrl']) || !empty($item['designFiles'])) {
                $uploaded = true;
            } elseif (!empty($item['isCustom']) || !empty($item['isMadeToOrder'])) {
                $made = true;
            } else {
                $stocked = true;
            }
        }

        // Ordered by what the customer is waiting on. Drawing comes before checking, checking
        // before making, and packing is what is left when nothing has to be made at all.
        if ($requested) {
            $headline = 'Our designer is drawing your proof. We will send it in chat, and it also '
                      . 'appears in My Orders waiting for you to approve it.';
        } elseif ($uploaded) {
            $headline = 'We are checking the file you sent. If it is ready to print we start '
                      . 'production, and we message you if anything needs changing.';
        } elseif ($made) {
            $headline = 'Your order is made after it is placed, so it goes into our production '
                      . 'queue now. We will message you as it moves.';
        } else {
            $headline = 'We are packing your order. We will message you when it is on its way.';
        }

        $mixedNote = ($stocked && ($requested || $uploaded || $made))
            ? 'Your order has both printed and ready-made items. They ship together, so the whole '
            . 'order follows the printed part.'
            : null;

        return [$headline, $mixedNote];
    }

    private static function customer(Order $order): void
    {
        try {
            $email = $order->userSnapshot['email'] ?? null;
            if (!$email) return;

            $name      = $order->userSnapshot['name'] ?? '';
            $firstName = explode(' ', trim($name))[0] ?: 'Customer';

            // Sum what has actually been collected rather than trusting a single field: a
            // design-fee-first order carries its hundred pesos in paymentHistory while
            // paymentStatus still says unpaid, and both are correct.
            $paid = collect($order->paymentHistory ?? [])
                ->sum(fn ($p) => (float) ($p['amount'] ?? 0));
            $total = (float) ($order->totalAmount ?? 0);
            $next  = self::nextStep($order);

            // The design fee is inside totalAmount but not inside any line, which is why the items
            // summed to 1,000 under a total of 1,100 with nothing to account for the gap.
            $designFee = (float) ($order->designFee ?? 0);
            if ($designFee <= 0 && !empty($order->designFeePaidAmount)) {
                $designFee = (float) $order->designFeePaidAmount;
            }

            $paid       = round($paid, 2);
            $balanceDue = round(max(0, $total - $paid), 2);
            $feeOnly    = (bool) ($order->designFeePaid ?? false) && ($order->paymentStatus ?? '') !== 'paid';

            $label = $feeOnly            ? 'Design Fee Paid - Order Unpaid'
                   : ($balanceDue <= 0.009 ? 'Paid in full'
                   : ($paid > 0            ? 'Partly paid' : 'Unpaid'));

            $base    = rtrim((string) config('app.frontend_url', ''), '/');
            $orderId = (string) $order->_id;

            Mail::to($email)->send(new OrderConfirmationMail(
                firstName:     $firstName,
                orderId:       (string) $order->_id,
                items:         $order->items ?? [],
                totalAmount:   $total,
                status:        $order->orderStatus ?? 'Pending',
                notes:         $order->notes ?? '',
                amountPaid:    $paid,
                balanceDue:    $balanceDue,
                designFeeOnly: $feeOnly,
                nextStep:      $next[0],
                mixedNote:     $next[1],
                designFee:     round($designFee, 2),
                paymentLabel:  $label,
                orderUrl:      $base ? "{$base}/shop/orders-history" : '',
                // A URL that says receipt. It used to point at payment-success?view=1, which
                // announces a payment succeeded on an order where a thousand pesos have not been
                // paid - and it was the first thing the customer read.
                receiptUrl:    $base ? "{$base}/shop/receipt/{$orderId}" : ''
            ));
        } catch (\Exception $e) {
            Log::error('OrderNotifier@customer: ' . $e->getMessage(), ['order_id' => (string) $order->_id]);
        }
    }

    /** The stages worth telling a customer about. Anything else moves quietly. */
    private const ANNOUNCED = [
        'processing', 'in_production', 'for_qc', 'ready_for_delivery',
        'for_delivery', 'delivered', 'returned', 'cancelled',
    ];

    private static function statusKey(?string $status): string
    {
        return strtolower(str_replace([' ', '-'], '_', trim((string) $status)));
    }

    /**
     * A link the customer can actually open.
     *
     * A parcel courier gives a number; Lalamove and Grab give a share link and no number at all.
     * Both are accepted. A link is only built for a courier whose URL is known - a guessed one is
     * worse than none, because it looks like tracking and opens on an error page.
     */
    public static function trackingLink(?string $courier, ?string $number, ?string $url = null): string
    {
        $url = trim((string) $url);
        if ($url !== '' && preg_match('~^https?://~i', $url)) {
            return $url;
        }
        $number  = trim((string) $number);
        $courier = strtolower(trim((string) $courier));
        if ($number === '' || $courier === '') {
            return '';
        }
        if (str_contains($courier, 'j&t') || str_contains($courier, 'jt express')) {
            return 'https://www.jtexpress.ph/trajectoryQuery?waybillNo=' . rawurlencode($number);
        }
        if (str_contains($courier, 'lbc')) {
            return 'https://www.lbcexpress.com/track/';
        }
        return '';
    }

    /**
     * Say where the order has got to - in the bell and by email, on every path.
     *
     * Idempotent through `lastStatusNotified` on the order: the JO sync, a manual update and a
     * payment confirm can all land on the same move, and the customer should hear it once. The
     * dedupe is a field rather than a query because `where('data.orderId', ...)` matches nothing
     * against this driver - which is how a check once reported zero notifications for an order
     * that plainly had them.
     */
    public static function statusChanged(Order $order, ?string $previous = null): void
    {
        try {
            $key = self::statusKey($order->orderStatus);
            if (!in_array($key, self::ANNOUNCED, true)) return;
            if ($previous !== null && self::statusKey($previous) === $key) return;
            if (self::statusKey($order->lastStatusNotified ?? '') === $key) return;

            $ref   = strtoupper(substr((string) $order->_id, -8));
            $fee   = (float) ($order->courierFee ?? 0);
            $paid  = (bool) ($order->courierFeePaid ?? false);
            $rider = (bool) ($order->courierFeeOnDelivery ?? true);

            // The delivery fee is the one thing still owed on an order that is otherwise settled,
            // and the last moment to say so is before it leaves.
            $feeNote = '';
            if ($fee > 0.009 && !$paid && in_array($key, ['ready_for_delivery', 'for_delivery'], true)) {
                $amount  = 'P' . number_format($fee, 2);
                $feeNote = $rider
                    ? 'The ' . $amount . ' delivery fee is still unpaid. Pay it in My Orders before we send the order out, or have ' . $amount . ' ready in cash for the rider.'
                    : 'The ' . $amount . ' delivery fee is still unpaid. This one goes by parcel courier, which cannot take cash on arrival, so please settle it in My Orders.';
            }

            $courier  = (string) ($order->courierName ?? '');
            $tracking = (string) ($order->trackingNumber ?? '');
            $link     = self::trackingLink($courier, $tracking, $order->trackingUrl ?? '');

            $titles = [
                'processing'         => 'Order Accepted',
                'in_production'      => 'Your Order Is Being Made',
                'for_qc'             => 'Your Order Is In Quality Check',
                'ready_for_delivery' => 'Your Order Is Ready',
                'for_delivery'       => 'Your Order Is On Its Way',
                'delivered'          => 'Your Order Was Delivered',
                'returned'           => 'Your Order Was Marked Returned',
                'cancelled'          => 'Your Order Was Cancelled',
            ];
            $lines = [
                'processing'         => 'We have accepted order #' . $ref . ' and started work on it.',
                'in_production'      => 'Order #' . $ref . ' is now being made.',
                'for_qc'             => 'Order #' . $ref . ' is finished and being checked before it goes out.',
                'ready_for_delivery' => 'Order #' . $ref . ' passed quality check and is packed, waiting for the courier.',
                'for_delivery'       => 'Order #' . $ref . ' is on its way to you.',
                'delivered'          => 'Order #' . $ref . ' has been delivered. Thank you for your order.',
                'returned'           => 'Order #' . $ref . ' has been marked returned. Message us if that is not right.',
                'cancelled'          => 'Order #' . $ref . ' has been cancelled.',
            ];
            $headline = $lines[$key] ?? ('Order #' . $ref . ' has been updated.');
            if ($key === 'for_delivery' && $courier !== '') {
                $headline .= ' It is with ' . $courier . '.';
            }

            try {
                Notification::create([
                    'user_id'    => (string) $order->userId,
                    'type'       => 'order_status',
                    'title'      => $titles[$key] ?? 'Order Updated',
                    'message'    => trim($headline . ($feeNote !== '' ? ' ' . $feeNote : '')),
                    'is_read'    => false,
                    'data'       => ['orderId' => (string) $order->_id, 'status' => $key],
                    'created_at' => now(),
                ]);
            } catch (\Exception $e) {
                Log::warning('OrderNotifier@statusChanged bell: ' . $e->getMessage());
            }

            $email = $order->userSnapshot['email'] ?? optional(User::find($order->userId))->email;
            if ($email) {
                $name = trim((string) ($order->userSnapshot['name'] ?? ''));
                $base = rtrim((string) config('app.frontend_url', ''), '/');
                Mail::to($email)->send(new \App\Mail\OrderStatusMail(
                    firstName:      $name !== '' ? explode(' ', $name)[0] : 'Customer',
                    orderId:        (string) $order->_id,
                    newStatus:      (string) $order->orderStatus,
                    totalAmount:    (float) ($order->totalAmount ?? 0),
                    headline:       $headline,
                    feeNote:        $feeNote,
                    courierName:    $courier,
                    trackingNumber: $tracking,
                    trackingUrl:    $link,
                    orderUrl:       $base !== '' ? $base . '/shop/orders-history' : ''
                ));
            }

            $order->lastStatusNotified = $key;
            $order->save();
        } catch (\Throwable $e) {
            Log::error('OrderNotifier@statusChanged: ' . $e->getMessage(), ['order_id' => (string) $order->_id]);
        }
    }
}
