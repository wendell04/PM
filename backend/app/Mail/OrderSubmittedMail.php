<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class OrderSubmittedMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(
        public readonly string $customerName,
        public readonly string $orderId,
        public readonly string $productName,
        public readonly int    $quantity,
        public readonly float  $suggestedPrice,
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: 'We received your order request!',
        );
    }

    public function content(): Content
    {
        return new Content(
            view: 'emails.order-submitted',
        );
    }
}
