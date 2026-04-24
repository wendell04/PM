<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class OrderConfirmedMail extends Mailable implements ShouldQueue
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
            subject: 'Your order has been confirmed!',
        );
    }

    public function content(): Content
    {
        return new Content(
            view: 'emails.order-confirmed',
        );
    }
}
