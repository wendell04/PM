<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Attachment;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class OrderConfirmationMail extends Mailable implements ShouldQueue
{
    use Queueable, SerializesModels;

    public string $firstName;
    public string $orderId;
    public array  $items;
    public float  $totalAmount;
    public string $status;
    public string $notes;
    public float $amountPaid;
    public float $balanceDue;
    public bool $designFeeOnly;
    public string $nextStep;
    public ?string $mixedNote;
    public float $designFee;
    public string $paymentLabel;
    public string $orderUrl;
    public string $receiptUrl;

    public function __construct(
        string $firstName,
        string $orderId,
        array $items,
        float $totalAmount,
        string $status,
        string $notes = '',
        // What has actually been collected, and what is still owed. Without these the mail
        // showed one figure - the order total - on an order where a hundred pesos had been
        // paid and a thousand had not, and read as though the whole thing was settled.
        float $amountPaid = 0.0,
        float $balanceDue = 0.0,
        bool $designFeeOnly = false,
        string $nextStep = '',
        ?string $mixedNote = null,
        // Its own row, so the breakdown adds up on screen instead of the reader having to work out
        // why the items say 1,000 and the total says 1,100.
        float $designFee = 0.0,
        string $paymentLabel = '',
        string $orderUrl = '',
        string $receiptUrl = ''
    ) {
        $this->firstName   = $firstName;
        $this->orderId     = $orderId;
        $this->items       = $items;
        $this->totalAmount = $totalAmount;
        $this->status      = $status;
        $this->notes       = $notes;
        $this->amountPaid    = $amountPaid;
        $this->balanceDue    = $balanceDue;
        $this->designFeeOnly = $designFeeOnly;
        $this->nextStep      = $nextStep;
        $this->mixedNote     = $mixedNote;
        $this->designFee     = $designFee;
        $this->paymentLabel  = $paymentLabel;
        $this->orderUrl      = $orderUrl;
        $this->receiptUrl    = $receiptUrl;
    }

    public function envelope(): Envelope
    {
        return new Envelope(
            // The reference belongs in the subject. Without it every order from the same
            // customer shares one, Gmail threads them and hides the newer body behind a "..."
            // as repeated content - on the mail that says what they just paid for.
            subject: 'Order Received ' . \App\Support\ReceiptPdf::ref($this->orderId) . ' - Personalize Me Prints',
        );
    }

    public function content(): Content
    {
        return new Content(
            view: 'emails.order-confirmation',
        );
    }

    /**
     * The receipt travels with the mail.
     *
     * A link to one is opened from an inbox, usually on a phone, usually in a browser with no
     * session - so it asked the customer to sign in to read what they had just paid for. A PDF
     * needs none of that and is already saved by the time they see it.
     *
     * Returns nothing if the render fails: a receipt must never cost the customer their email.
     */
    public function attachments(): array
    {
        $pdf = \App\Support\ReceiptPdf::forOrder($this->orderId);

        if (!$pdf) {
            return [];
        }

        return [
            Attachment::fromData(fn () => $pdf, \App\Support\ReceiptPdf::filename($this->orderId))
                ->withMime('application/pdf'),
        ];
    }
}
