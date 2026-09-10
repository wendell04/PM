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

            Mail::to($email)->send(new OrderConfirmationMail(
                firstName:     $firstName,
                orderId:       (string) $order->_id,
                items:         $order->items ?? [],
                totalAmount:   $total,
                status:        $order->orderStatus ?? 'Pending',
                notes:         $order->notes ?? '',
                amountPaid:    round($paid, 2),
                balanceDue:    round(max(0, $total - $paid), 2),
                designFeeOnly: (bool) ($order->designFeePaid ?? false) && ($order->paymentStatus ?? '') !== 'paid',
                nextStep:      $next[0],
                mixedNote:     $next[1]
            ));
        } catch (\Exception $e) {
            Log::error('OrderNotifier@customer: ' . $e->getMessage(), ['order_id' => (string) $order->_id]);
        }
    }
}
