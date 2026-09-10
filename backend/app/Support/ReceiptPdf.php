<?php

namespace App\Support;

use App\Models\Order;
use Dompdf\Dompdf;
use Dompdf\Options;

/**
 * The receipt as a file.
 *
 * A link to a receipt fails at exactly the moment it is used: it is opened from an inbox, usually
 * on a phone, usually in a browser with no session - so it asked the customer to sign in to read
 * what they had just paid for. A PDF hanging off the mail needs no session and no network, and is
 * already saved by the time they see it.
 *
 * The layout mirrors components/shop/OrderReceipt.jsx. dompdf has no flexbox and no grid, so the
 * two cannot share markup - if one changes, change the other.
 */
class ReceiptPdf
{
    /** Raw PDF bytes, or null if anything goes wrong - a receipt must never cost someone their mail. */
    public static function forOrder(string $orderId): ?string
    {
        try {
            $order = Order::find($orderId);
            if (!$order) {
                return null;
            }

            $options = new Options();
            $options->set('isRemoteEnabled', false);     // nothing in a receipt is fetched over the wire
            $options->set('isHtml5ParserEnabled', true);
            $options->set('defaultFont', 'DejaVu Sans'); // the bundled face that actually has a peso sign

            $dompdf = new Dompdf($options);
            $dompdf->loadHtml(view('emails.receipt-pdf', self::data($order))->render(), 'UTF-8');
            $dompdf->setPaper('A4', 'portrait');
            $dompdf->render();

            return $dompdf->output();
        } catch (\Throwable $e) {
            report($e);
            return null;
        }
    }

    public static function filename(string $orderId): string
    {
        return 'Receipt-' . self::ref($orderId) . '.pdf';
    }

    public static function ref(string $orderId): string
    {
        return 'ORD-' . strtoupper(substr($orderId, -8));
    }

    /** Everything the template prints, worked out here so the Blade stays dumb. */
    private static function data(Order $order): array
    {
        $id    = (string) $order->_id;
        $items = [];
        $sub   = 0.0;

        foreach (($order->items ?? []) as $i) {
            $qty  = (int) ($i['qty'] ?? $i['quantity'] ?? 1);
            $line = isset($i['lineTotal'])
                ? (float) $i['lineTotal']
                : (float) ($i['unitPrice'] ?? 0) * $qty;
            $sub += $line;

            $name = $i['productName'] ?? $i['product_name'] ?? 'Item';
            if (!empty($i['variantName'])) {
                $name .= ' - ' . $i['variantName'];
            }

            $items[] = ['name' => $name, 'qty' => $qty, 'total' => $line];
        }

        $history  = $order->paymentHistory ?? [];
        $payments = [];
        $paid     = 0.0;

        foreach ($history as $idx => $p) {
            $amount = (float) ($p['amount'] ?? 0);
            $paid  += $amount;
            $when   = $p['recordedAt'] ?? $p['date'] ?? $p['at'] ?? $p['paidAt'] ?? null;

            $payments[] = [
                'label'  => self::paymentLabel($p, $idx, count($history)),
                'when'   => $when ? date('M j, Y', strtotime((string) $when)) : '',
                'method' => !empty($p['method']) ? strtoupper((string) $p['method']) : '',
                'amount' => $amount,
            ];
        }

        $total   = (float) ($order->totalAmount ?? $order->finalPrice ?? 0);
        $settled = ($order->paymentStatus ?? '') === 'paid';

        $a    = $order->deliveryAddress ?? [];
        $addr = array_filter([
            $a['house_number'] ?? null, $a['street'] ?? null, $a['subdivision'] ?? null,
            $a['barangay'] ?? null, $a['city'] ?? null, $a['province'] ?? null, $a['zip'] ?? null,
        ]);

        return [
            'ref'       => self::ref($id),
            'date'      => $order->createdAt ? date('F j, Y', strtotime((string) $order->createdAt)) : '',
            'status'    => self::statusLabel($settled, $paid, $payments),
            'settled'   => $settled,
            'name'      => $order->userSnapshot['name'] ?? 'Customer',
            'email'     => $order->userSnapshot['email'] ?? '',
            'phone'     => $a['phone'] ?? ($order->userSnapshot['phone'] ?? ''),
            'address'   => implode(', ', $addr),
            'items'     => $items,
            'subtotal'  => $sub,
            'designFee' => (float) ($order->designFee ?? 0),
            'rushFee'   => (float) ($order->rushFee ?? 0),
            'shipping'  => (float) ($order->shippingFee ?? 0),
            'total'     => $total,
            'payments'  => $payments,
            'paid'      => $paid,
            'owed'      => max(0, $total - $paid),
        ];
    }

    /**
     * Payments were labelled by position - first a downpayment, the rest balance payments - which
     * called a request-design order's design fee a downpayment. Read what the payment says it was.
     * Mirrors lib/paymentLabel.js.
     */
    private static function paymentLabel(array $p, int $index, int $count): string
    {
        $byType = [
            'design_fee'  => 'Design fee',
            'downpayment' => 'Downpayment',
            'balance'     => 'Balance payment',
            'payment'     => 'Payment',
        ];

        if (!empty($p['type']) && isset($byType[$p['type']])) {
            return $byType[$p['type']];
        }

        $note = strtolower((string) ($p['note'] ?? ''));
        if (str_contains($note, 'design fee') || str_contains($note, 'design_fee')) return 'Design fee';
        if (str_contains($note, 'downpayment') || str_contains($note, 'deposit'))   return 'Downpayment';
        if (str_contains($note, 'balance'))                                          return 'Balance payment';

        return $count <= 1 ? 'Payment' : ($index === 0 ? 'Downpayment' : 'Balance payment');
    }

    /**
     * The old rule read "not settled and something owed" as "Design Fee Paid", which printed that
     * on an order nobody had paid a peso towards. Mirrors receiptStatus() in lib/paymentLabel.js.
     */
    private static function statusLabel(bool $settled, float $paid, array $payments): string
    {
        if ($settled) {
            return 'Fully Paid';
        }
        if ($paid <= 0) {
            return 'Unpaid';
        }

        $designFeeRows = array_filter($payments, fn ($p) => $p['label'] === 'Design fee');

        return count($designFeeRows) === count($payments) ? 'Design Fee Paid - Balance Due' : 'Partially Paid';
    }
}
