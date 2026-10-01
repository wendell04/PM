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
    /**
     * The email's Pay button, when paying is what happens next: the no-sign-in pay page, with the
     * same deposit and delivery-fee choices as My Orders. Empty on COD, a settled or cancelled order,
     * or with online payment off - the email then keeps just the My Orders link.
     *
     * The breakdown is worked out from the same summary the pay page uses, so the email and the
     * page can never show two different amounts.
     *
     * @return array{0:string,1:string,2:string,3:array} [payUrl, payLabel, payNote, breakdown]
     */
    private static function payButton(Order $order): array
    {
        try {
            $s = app(\App\Http\Controllers\PayLinkController::class)->summary($order);
            if ($s['balance'] <= 0 || $s['cod'] || $s['cancelled'] || !$s['methods']) return ['', '', '', []];
            $dp    = (bool) $s['downpaymentPercent'];
            $first = $dp ? $s['downpaymentAmount'] : $s['balance'];
            // The delivery fee sits outside the total, so it gets its own line saying where it stands.
            $fee = (float) ($order->courierFee ?? 0);
            $delivery = null;
            if ($order->freeDelivery ?? false) {
                $delivery = ['amount' => 0.0, 'note' => 'Free on this order'];
            } elseif (($order->courierFeePaid ?? false) && $fee > 0) {
                $delivery = ['amount' => (float) ($order->courierFeePaidAmount ?? $fee), 'note' => 'Paid'];
            } elseif ($fee > 0) {
                $delivery = ['amount' => $fee, 'note' => ($order->courierFeeOnDelivery ?? true)
                    ? 'Not paid - add it when you pay, or hand it to the rider in cash'
                    : 'Not paid - due with this payment (parcel courier)'];
            }
            return [
                \App\Support\PayLink::url($order),
                $dp ? 'Pay ₱' . number_format($first, 2) : 'Pay the ₱' . number_format($s['balance'], 2) . ' balance',
                ($dp ? 'Or pay the full ₱' . number_format($s['balance'], 2) . '. ' : '')
                    . self::methodsText($s['methods']) . ' - no sign-in needed.',
                ['total' => $s['total'], 'paid' => $s['paid'], 'balance' => $s['balance'], 'delivery' => $delivery],
            ];
        } catch (\Throwable $e) {
            return ['', '', '', []];
        }
    }

    /** Only the methods the shop has on, as a customer reads them: "GCash, Maya or card". */
    private static function methodsText(array $methods): string
    {
        $names = array_values(array_map(fn ($m) => ['gcash' => 'GCash', 'paymaya' => 'Maya', 'card' => 'card'][$m] ?? $m, $methods));
        if (count($names) <= 1) return $names ? ucfirst($names[0]) : 'Online payment';
        return implode(', ', array_slice($names, 0, -1)) . ' or ' . end($names);
    }

    /**
     * "You approved the design - pay to start production", in the bell and by email.
     *
     * The only word of it used to be a card in the chat. A customer who approved from the proof
     * EMAIL never opens the chat, so they were never told the order now waits on them - it sat in
     * awaiting_payment until the hold lapsed. Separate from statusChanged on purpose: that one would
     * also announce awaiting_payment on paths where nothing was approved (an unpaid checkout).
     */
    public static function paymentDueAfterApproval(Order $order, string $dueNow, ?string $heldUntil, bool $reminder = false): void
    {
        try {
            $ref      = strtoupper(substr((string) $order->_id, -8));
            $headline = $reminder
                // The night before the hold runs out (orders:expire-unpaid-proofs).
                ? 'Reminder: order #' . $ref . ' is held until ' . $heldUntil . '. Pay ' . $dueNow
                    . ' before then to start production - after that the order is cancelled and the held materials are released.'
                // A status, not a bill: it leaves the moment they approve, usually while they are
                // paying on the proof page, so a Pay button here arrived for money already paid.
                // Where to pay is said in words; the reminder below carries the button.
                : 'Thanks for approving the design for order #' . $ref . '. Production starts once the ' . $dueNow
                    . ' payment clears' . ($heldUntil ? ' - we hold your order until ' . $heldUntil : '')
                    . '. If you have not paid yet, use the Pay button on the proof page or in My Orders. Your delivery days count from the day it clears.';
            try {
                Notification::create([
                    'user_id'    => (string) $order->userId,
                    'type'       => 'order_status',
                    'title'      => $reminder ? 'Payment Due Tomorrow' : 'Design Approved - Payment Due',
                    'message'    => $headline,
                    'is_read'    => false,
                    'data'       => ['orderId' => (string) $order->_id, 'status' => 'awaiting_payment'],
                    'created_at' => now(),
                ]);
            } catch (\Exception $e) {
                Log::warning('OrderNotifier@paymentDueAfterApproval bell: ' . $e->getMessage());
            }

            $email = $order->userSnapshot['email'] ?? optional(User::find($order->userId))->email;
            if ($email) {
                $name = trim((string) ($order->userSnapshot['name'] ?? ''));
                $base = rtrim((string) config('app.frontend_url', ''), '/');
                // Only the reminder (the night before the hold runs out) carries the Pay button.
                [$payUrl, $payLabel, $payNote] = $reminder && $base !== '' ? self::payButton($order) : ['', '', '', []];
                Mail::to($email)->send(new \App\Mail\OrderStatusMail(
                    firstName:   $name !== '' ? explode(' ', $name)[0] : 'Customer',
                    orderId:     (string) $order->_id,
                    newStatus:   'awaiting_payment',
                    totalAmount: (float) ($order->totalAmount ?? 0),
                    headline:    $headline,
                    orderUrl:    $base !== '' ? $base . '/shop/orders-history?order=' . $order->_id : '',
                    payUrl:      $payUrl,
                    payLabel:    $payLabel,
                    payNote:     $payNote,
                    showTotal:   false
                ));
            }
        } catch (\Throwable $e) {
            Log::error('OrderNotifier@paymentDueAfterApproval: ' . $e->getMessage(), ['order_id' => (string) $order->_id]);
        }
    }

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
                $amount  = '₱' . number_format($fee, 2);
                // Once it has left, "pay it before we send the order out" is a promise already broken,
                // and My Orders closes the online option for a rider who collects - so the only thing
                // left to say is the cash.
                $feeNote = $rider
                    ? ($key === 'for_delivery'
                        ? 'The ' . $amount . ' delivery fee is still unpaid - please have ' . $amount . ' ready in cash for the rider.'
                        : 'The ' . $amount . ' delivery fee is still unpaid. Pay it in My Orders before we send the order out, or have ' . $amount . ' ready in cash for the rider.')
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
            // A cancellation says why and what happens to the money, in the same one notice. The shop's
            // cancel path wrote a second bell of its own with those two facts, so the customer got two.
            if ($key === 'cancelled') {
                $why = trim((string) ($order->cancelledReason ?? ''));
                if (($order->cancelledBy ?? null) === 'admin') $headline = 'Order #' . $ref . ' was cancelled by the shop.';
                if ($why !== '') $headline .= ' Reason: ' . mb_substr($why, 0, 200) . '.';
                $owed = (float) ($order->refundOwed ?? 0);
                if ($owed > 0) $headline .= ' A refund of P' . number_format($owed, 2) . ' is being arranged.';
            }
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
                // When paying is what happens next, the email carries the button for it: the no-sign-in
                // pay page, with the same deposit and delivery-fee choices as My Orders.
                [$payUrl, $payLabel, $payNote, $breakdown] = $key === 'ready_for_delivery' && $base !== ''
                    ? self::payButton($order) : ['', '', '', []];
                // The breakdown carries the delivery fee line, so the separate note would say it twice.
                if ($breakdown) $feeNote = '';
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
                    orderUrl:       $base !== '' ? $base . '/shop/orders-history?order=' . $order->_id : '',
                    payUrl:         $payUrl,
                    payLabel:       $payLabel,
                    payNote:        $payNote,
                    breakdown:      $breakdown
                ));
            }

            $order->lastStatusNotified = $key;
            $order->save();
        } catch (\Throwable $e) {
            Log::error('OrderNotifier@statusChanged: ' . $e->getMessage(), ['order_id' => (string) $order->_id]);
        }
    }
}
