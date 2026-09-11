<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Attachment;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

/**
 * A receipt for money the shop has taken.
 *
 * Every other status change is something the customer can read in the app whenever they like.
 * Money is different: it is the one record they may need months later, for a reimbursement or a
 * dispute, and it should exist somewhere the shop does not control. It also closes the loop on a
 * payment sent by GCash or Maya, where the customer otherwise has no way of knowing the shop
 * saw it.
 */
class PaymentReceivedMail extends Mailable implements ShouldQueue
{
    use Queueable, SerializesModels;

    public string $firstName;
    public string $orderRef;
    public float  $amount;
    public string $method;
    public float  $paidTotal;
    public float  $balance;
    public ?string $reference;
    /** The full order id, so the updated receipt PDF can be attached. */
    public string $orderId;
    /** Part of this charge that was the courier's delivery fee, not the order. */
    public float  $deliveryIncluded;

    public function __construct(
        string $firstName,
        string $orderRef,
        float $amount,
        string $method,
        float $paidTotal,
        float $balance,
        ?string $reference = null,
        string $orderId = '',
        float $deliveryIncluded = 0.0
    ) {
        $this->firstName = $firstName !== '' ? $firstName : 'there';
        $this->orderRef  = $orderRef;
        $this->amount    = $amount;
        $this->method    = $method;
        $this->paidTotal = $paidTotal;
        $this->balance   = $balance;
        $this->reference = $reference;
        $this->orderId   = $orderId;
        $this->deliveryIncluded = max(0.0, round($deliveryIncluded, 2));
    }

    /**
     * The receipt as it stands after this payment - so the last one they get says Fully Paid,
     * which is the document they keep.
     */
    public function attachments(): array
    {
        if ($this->orderId === '') {
            return [];
        }
        $pdf = \App\Support\ReceiptPdf::forOrder($this->orderId);
        if (!$pdf) {
            return [];
        }
        return [
            Attachment::fromData(fn () => $pdf, \App\Support\ReceiptPdf::filename($this->orderId))
                ->withMime('application/pdf'),
        ];
    }

    public function envelope(): Envelope
    {
        // The reference keeps each payment its own thread instead of collapsing into the last one.
        return new Envelope(subject: 'We received your payment - ORD-' . $this->orderRef . ' - Personalize Me Prints');
    }

    public function content(): Content
    {
        return new Content(view: 'emails.payment-received');
    }
}
