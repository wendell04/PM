<?php

namespace App\Http\Controllers;

use App\Models\Order;
use App\Models\User;
use App\Support\PayLink;
use App\Support\PaymentMethod;
use Illuminate\Http\Request;

/**
 * Pay the balance from the reminder email, without signing in (PUBLIC, token-gated).
 *
 * Every payment step is the one My Orders already uses - createOrderPayLink starts the PayMongo
 * checkout and verifyIntent records it - run as the order's own customer, so the money is booked,
 * receipted and announced exactly as if they had signed in. Only where PayMongo sends them back
 * differs: to this page, which needs no session.
 */
class PayLinkController extends Controller
{
    /** GET /pay/{token} - what is owed. Never charges: mail scanners open every link. */
    public function show(string $token)
    {
        $order = PayLink::resolve($token);
        if (!$order) return $this->errorResponse('This payment link has expired or is not valid.', 410);
        return $this->successResponse('Balance.', $this->summary($order));
    }

    /** POST /pay/{token}/checkout - start a PayMongo checkout for the balance. */
    public function checkout(Request $request, string $token)
    {
        $order = PayLink::resolve($token);
        if (!$order) return $this->errorResponse('This payment link has expired or is not valid.', 410);
        $s = $this->summary($order);
        if ($s['cancelled']) return $this->errorResponse('This order was cancelled - there is nothing to pay.', 422);
        if ($s['cod']) return $this->errorResponse('This order is paid on delivery - there is nothing to pay online.', 422);
        if ($s['balance'] <= 0) return $this->errorResponse('This order is already fully paid.', 422);
        $owner = User::find($order->userId);
        if (!$owner) return $this->errorResponse('This order cannot be paid online. Contact the shop.', 422);

        $base = rtrim((string) config('app.frontend_url', ''), '/');
        $sub = Request::create('/api/payment/create-order-pay-link', 'POST', ['orderId' => (string) $order->_id, 'payFull' => true]);
        $sub->setUserResolver(fn () => $owner);
        // Where PayMongo sends them back: here, not My Orders, which needs a session they do not have.
        $sub->attributes->set('pay_link_return', [
            'success' => "{$base}/pay/{$token}?done=1",
            'failed'  => "{$base}/pay/{$token}?failed=1",
            'cancel'  => "{$base}/pay/{$token}",
        ]);
        $res = app(PaymentController::class)->createOrderPayLink($sub);
        $data = json_decode($res->getContent(), true) ?? [];
        if ($res->getStatusCode() >= 300 || empty($data['data']['checkoutUrl'])) {
            return $this->errorResponse($data['message'] ?? 'Could not start the payment. Try again.', $res->getStatusCode() >= 300 ? $res->getStatusCode() : 502);
        }
        return $this->successResponse('Checkout ready.', ['checkoutUrl' => $data['data']['checkoutUrl']]);
    }

    /** POST /pay/{token}/verify - back from PayMongo: record it now rather than wait for the webhook. */
    public function verify(string $token)
    {
        $order = PayLink::resolve($token);
        if (!$order) return $this->errorResponse('This payment link has expired or is not valid.', 410);
        $owner = User::find($order->userId);
        if ($owner && $this->summary($order)['balance'] > 0 && ($order->paymongoLinkId || $order->paymongoIntentId)) {
            $sub = Request::create('/api/payment/verify-intent', 'POST', ['orderId' => (string) $order->_id]);
            $sub->setUserResolver(fn () => $owner);
            try { app(PaymentController::class)->verifyIntent($sub); } catch (\Throwable $e) { /* the webhook still records it */ }
        }
        return $this->successResponse('Checked.', $this->summary(Order::find($order->_id)));
    }

    /** Only what the page needs: no address, phone, email or items beyond names. */
    private function summary(Order $order): array
    {
        $total = round((float) ($order->totalAmount ?? 0), 2);
        $paid  = round((float) collect($order->paymentHistory ?? [])->sum(fn ($p) => (float) ($p['amount'] ?? 0)), 2);
        $name  = trim((string) ($order->userSnapshot['name'] ?? ''));
        return [
            'orderRef'  => $order->orderNumber ?: ('ORD-' . strtoupper(substr((string) $order->_id, -8))),
            'firstName' => $name !== '' ? explode(' ', $name)[0] : '',
            'total'     => $total,
            'paid'      => $paid,
            'balance'   => ($order->paymentStatus ?? '') === 'paid' ? 0.0 : round(max(0, $total - $paid), 2),
            'cod'       => PaymentMethod::isCod($order->paymentMethod),
            'items'     => collect($order->items ?? [])->take(6)->map(fn ($i) => trim(($i['productName'] ?? $i['name'] ?? 'Item') . (!empty($i['variantName']) ? ' - ' . $i['variantName'] : '')) . ' x' . (int) ($i['quantity'] ?? 1))->values(),
            'methods'   => PaymentMethod::enabledOnline(),
            'cancelled' => in_array(strtolower((string) ($order->orderStatus ?? '')), ['cancelled', 'returned'], true),
        ];
    }
}
