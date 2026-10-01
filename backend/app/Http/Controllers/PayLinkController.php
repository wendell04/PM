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
        if ($s['holdEnded']) return $this->errorResponse(\App\Support\PaymentHold::message($order), 422);
        if ($s['cod']) return $this->errorResponse('This order is paid on delivery - there is nothing to pay online.', 422);
        if ($s['balance'] <= 0) return $this->errorResponse('This order is already fully paid.', 422);
        $owner = User::find($order->userId);
        if (!$owner) return $this->errorResponse('This order cannot be paid online. Contact the shop.', 422);

        // The same two choices My Orders offers: the deposit, when this order takes one, and the
        // delivery fee, which a parcel courier cannot take at the door so it is not optional there.
        $payFull = !$s['downpaymentPercent'] || filter_var($request->input('payFull', true), FILTER_VALIDATE_BOOLEAN);
        $withFee = $s['deliveryFee'] > 0
            && (!$s['riderCollects'] || filter_var($request->input('includeDeliveryFee', false), FILTER_VALIDATE_BOOLEAN));

        // Chosen here, as in My Orders: GCash and Maya go straight to their own authorize page, a card
        // is entered on the pay page and goes to the bank's 3D Secure check. Only a method the shop has
        // on is taken; with none named, PayMongo's own page asks (the older links' behaviour).
        $method = $request->input('paymentMethod');
        if ($method !== null && !in_array($method, $s['methods'], true)) {
            return $this->errorResponse('That payment method is not available right now. Choose another.', 422);
        }
        if ($method === 'card' && !preg_match('/^pm_[A-Za-z0-9]{1,120}$/', (string) $request->input('paymentMethodId'))) {
            return $this->errorResponse('Enter your card details again.', 422);
        }

        $base = rtrim((string) config('app.frontend_url', ''), '/');
        $sub = Request::create('/api/payment/create-order-pay-link', 'POST', array_filter([
            'orderId' => (string) $order->_id,
            'payFull' => $payFull,
            'includeCourierFee' => $withFee ?: null,
            'paymentMethod'   => $method ?: null,
            'paymentMethodId' => $method === 'card' ? $request->input('paymentMethodId') : null,
        ], fn ($v) => $v !== null));
        $sub->setUserResolver(fn () => $owner);
        // Where PayMongo sends them back: here, not My Orders, which needs a session they do not have.
        $sub->attributes->set('pay_link_return', [
            'success' => "{$base}/pay/{$token}?done=1",
            'failed'  => "{$base}/pay/{$token}?failed=1",
            'cancel'  => "{$base}/pay/{$token}",
        ]);
        $res = app(PaymentController::class)->createOrderPayLink($sub);
        $data = json_decode($res->getContent(), true) ?? [];
        // A card that clears without 3D Secure is already recorded - there is nowhere to send them.
        if ($res->getStatusCode() < 300 && ($data['data']['status'] ?? null) === 'succeeded') {
            return $this->successResponse('Paid.', ['status' => 'succeeded']);
        }
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
        $attempt = null;
        if ($owner && $this->summary($order)['balance'] > 0 && ($order->paymongoLinkId || $order->paymongoIntentId)) {
            $sub = Request::create('/api/payment/verify-intent', 'POST', ['orderId' => (string) $order->_id]);
            $sub->setUserResolver(fn () => $owner);
            try {
                $r = json_decode(app(PaymentController::class)->verifyIntent($sub)->getContent(), true);
                // PayMongo puts a declined or cancelled wallet/card back to waiting for a method.
                if (($r['data']['paymentStatus'] ?? null) === 'awaiting_payment_method') $attempt = 'failed';
            } catch (\Throwable $e) { /* the webhook still records it */ }
        }
        return $this->successResponse('Checked.', $this->summary(Order::find($order->_id)) + ['attempt' => $attempt]);
    }

    /** Only what the page needs: no address or phone; the email only as card billing, never shown. Public for the emails' pay button. */
    public function summary(Order $order): array
    {
        $total = round((float) ($order->totalAmount ?? 0), 2);
        $paid  = round((float) collect($order->paymentHistory ?? [])->sum(fn ($p) => (float) ($p['amount'] ?? 0)), 2);
        $name  = trim((string) ($order->userSnapshot['name'] ?? ''));
        $balance = ($order->paymentStatus ?? '') === 'paid' ? 0.0 : round(max(0, $total - $paid), 2);
        $cod     = PaymentMethod::isCod($order->paymentMethod);
        // The deposit is offered on the same terms as My Orders: the first goods payment of an
        // order that takes one, at a single rate, as a share of what is still owed.
        $dpPct = (int) ($order->downpaymentPercent ?? 0);
        $dpOn  = $balance > 0
            && ($order->paymentStatus ?? '') === 'unpaid'
            && strtolower((string) ($order->orderStatus ?? '')) === 'awaiting_payment'
            && !((float) ($order->downPayment ?? 0) > 0)
            && ($order->requiresDownpayment ?? false)
            && !($order->downpaymentMixed ?? false)
            && $dpPct > 0 && $dpPct < 100;
        $fee   = round((float) ($order->courierFee ?? 0), 2);
        $feeOn = $fee > 0 && !($order->courierFeePaid ?? false) && !($order->freeDelivery ?? false) && !$cod && $balance > 0;
        return [
            'orderRef'  => $order->orderNumber ?: ('ORD-' . strtoupper(substr((string) $order->_id, -8))),
            'firstName' => $name !== '' ? explode(' ', $name)[0] : '',
            // PayMongo requires a billing name and email to take a card; not shown on the page.
            'billing'   => ['name' => $name, 'email' => (string) ($order->userSnapshot['email'] ?? optional(User::find($order->userId))->email ?? '')],
            'total'     => $total,
            'paid'      => $paid,
            'balance'   => $balance,
            'cod'       => $cod,
            // Before production the payment starts the work; after it, the payment releases the order.
            'beforeProduction'   => strtolower((string) ($order->orderStatus ?? '')) === 'awaiting_payment',
            'downpaymentPercent' => $dpOn ? $dpPct : 0,
            'downpaymentAmount'  => $dpOn ? round($balance * $dpPct / 100, 2) : 0,
            'deliveryFee'   => $feeOn ? $fee : 0,
            // A rider can be paid in cash at the door; a parcel courier is prepaid, so there the fee comes with this payment.
            'riderCollects' => (bool) ($order->courierFeeOnDelivery ?? true),
            // Orders store the count as qty; quantity is the older spelling.
            'items'     => collect($order->items ?? [])->take(6)->map(fn ($i) => trim(($i['productName'] ?? $i['name'] ?? 'Item') . (!empty($i['variantName']) ? ' - ' . $i['variantName'] : '')) . ' x' . (int) ($i['qty'] ?? $i['quantity'] ?? 1))->values(),
            'methods'   => PaymentMethod::enabledOnline(),
            'cancelled' => in_array(strtolower((string) ($order->orderStatus ?? '')), ['cancelled', 'returned'], true),
            // Past the hold but not yet swept by the 3 AM job: closed all the same.
            'holdEnded'    => \App\Support\PaymentHold::lapsed($order),
            'heldUntil'    => \App\Support\PaymentHold::until($order),
            'cancelReason' => (string) ($order->cancelReason ?? $order->cancelledReason ?? ''),
        ];
    }
}
