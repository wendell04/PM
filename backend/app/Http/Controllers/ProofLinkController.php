<?php

namespace App\Http\Controllers;

use App\Models\Order;
use App\Support\ProofLink;
use Illuminate\Http\Request;

/**
 * The no-login proof page: what the link in the proof email opens.
 *
 * Deliberately thin. It can show one order's proof and record one answer about it, and it can do
 * nothing else - no order list, no address, no payment, no session. If the token leaks, that is
 * the whole blast radius.
 */
class ProofLinkController extends Controller
{
    /** GET /api/proof/{token} - show the proof. Never changes anything. */
    public function show(string $token)
    {
        $order = ProofLink::resolve($token);
        if (!$order) {
            return response()->json([
                'success' => false,
                'message' => 'This link has expired or is not valid any more. Open your order in My Orders, or ask us to send a fresh proof.',
            ], 404);
        }

        $status = (string) ($order->designStatus ?? '');
        $proofs = array_values(array_filter((array) ($order->adminDesignUrls ?? [])));

        return response()->json([
            'success' => true,
            'data' => [
                'orderRef'     => strtoupper(substr((string) $order->_id, -8)),
                'customerName' => $order->userSnapshot['name'] ?? '',
                'proofs'       => $proofs,
                'designNotes'  => $order->designNotes ?? null,
                'designStatus' => $status,
                // Already answered? Say so rather than offering the buttons again - a customer
                // who clicks the same mail twice should see what they decided, not a second vote.
                'answered'     => in_array($status, ['approved', 'revision_requested'], true),
                // Nothing paid for the goods yet: approving leads to a payment, not straight to the
                // printer, and the page has to say which before the button is pressed.
                'payFirst'     => ($order->paymentStatus ?? 'unpaid') === 'unpaid',
                // Cancelled (the hold ran out, the proof went unanswered, or either side cancelled):
                // the page shows why instead of buttons that would act on a closed order.
                'closed'       => in_array(strtolower((string) ($order->orderStatus ?? '')), ['cancelled', 'returned'], true),
                'closedReason' => (string) ($order->cancelReason ?? $order->cancelledReason ?? ''),
                'holdEnded'    => $status === 'approved' && \App\Support\PaymentHold::lapsed($order),
                'heldUntil'    => \App\Support\PaymentHold::until($order),
                // Once approved, what is owed can be paid right here too - the same no-sign-in link
                // the reminder email carries. Only while something is owed online.
                'payUrl'       => $status === 'approved' ? $this->payUrlFor($order) : null,
                'items'        => array_map(fn ($i) => [
                    'name'    => $i['productName'] ?? $i['name'] ?? '',
                    'variant' => $i['variantName'] ?? null,
                    'qty'     => $i['qty'] ?? 1,
                ], (array) ($order->items ?? [])),
            ],
        ]);
    }

    /**
     * POST /api/proof/{token}/respond - the customer's answer.
     *
     * A POST on purpose. A GET that approves would be triggered by every mail scanner and
     * link-preview bot that touches the message, and the shop would print artwork nobody read.
     */
    public function respond(Request $request, string $token)
    {
        $order = ProofLink::resolve($token);
        if (!$order) {
            return response()->json([
                'success' => false,
                'message' => 'This link has expired or is not valid any more.',
            ], 404);
        }

        $validated = $request->validate([
            'decision' => 'required|string|in:approve,revision',
            'notes'    => 'nullable|string|max:1000',
        ]);

        if (in_array(strtolower((string) ($order->orderStatus ?? '')), ['cancelled', 'returned'], true)) {
            return response()->json([
                'success' => false,
                'message' => 'This order was cancelled, so the proof can no longer be answered. Message us in your order chat if you still want it.',
            ], 409);
        }

        if (in_array((string) ($order->designStatus ?? ''), ['approved', 'revision_requested'], true)) {
            return response()->json([
                'success' => false,
                'message' => 'You have already answered this proof. We have your reply - nothing more is needed.',
            ], 409);
        }

        // Reuse the logged-in paths so approving by link and approving in My Orders cannot drift
        // apart. Both go through the same controller, the same notifications and the same
        // downstream effects; the only difference is how the customer was identified.
        $orders = app(OrderController::class);
        $sub    = Request::create('/', 'POST', [
            'itemIndex'      => null,
            'revisionNotes'  => $validated['notes'] ?? null,
        ]);
        $sub->setUserResolver(fn () => \App\Models\User::find((string) $order->userId));

        if ($validated['decision'] !== 'approve') {
            return $orders->requestDesignRevision($sub, (string) $order->_id);
        }
        $res = $orders->approveAdminDesign($sub, (string) $order->_id);
        if ($res->getStatusCode() < 300) {
            // Approved and something is owed: hand back the pay link, so the page can offer it now.
            $body = json_decode($res->getContent(), true) ?? [];
            $body['data'] = array_merge((array) ($body['data'] ?? []), ['payUrl' => $this->payUrlFor(\App\Models\Order::find($order->_id))]);
            return response()->json($body, $res->getStatusCode());
        }
        return $res;
    }

    /** The no-sign-in pay link, while there is a balance to pay online; null otherwise. */
    private function payUrlFor(?\App\Models\Order $order): ?string
    {
        if (!$order || \App\Support\PaymentMethod::isCod($order->paymentMethod)) return null;
        if (in_array(strtolower((string) ($order->orderStatus ?? '')), ['cancelled', 'returned'], true)) return null;
        $paid = (float) collect($order->paymentHistory ?? [])->sum(fn ($p) => (float) ($p['amount'] ?? 0));
        if (($order->paymentStatus ?? '') === 'paid' || (float) ($order->totalAmount ?? 0) - $paid <= 0) return null;
        return \App\Support\PayLink::url($order) ?: null;
    }
}
