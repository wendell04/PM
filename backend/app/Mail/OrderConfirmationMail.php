<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Mail\Mailable;
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
        bool $designFeeOnly = false
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
    }

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: 'Order Received - Personalize Me Prints',
        );
    }

    public function content(): Content
    {
        return new Content(
            view: 'emails.order-confirmation',
        );
    }
}
