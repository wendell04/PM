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

    private static function customer(Order $order): void
    {
        try {
            $email = $order->userSnapshot['email'] ?? null;
            if (!$email) return;

            $name      = $order->userSnapshot['name'] ?? '';
            $firstName = explode(' ', trim($name))[0] ?: 'Customer';

            Mail::to($email)->send(new OrderConfirmationMail(
                firstName:   $firstName,
                orderId:     (string) $order->_id,
                items:       $order->items ?? [],
                totalAmount: (float) ($order->totalAmount ?? 0),
                status:      $order->orderStatus ?? 'Pending',
                notes:       $order->notes ?? ''
            ));
        } catch (\Exception $e) {
            Log::error('OrderNotifier@customer: ' . $e->getMessage(), ['order_id' => (string) $order->_id]);
        }
    }
}
