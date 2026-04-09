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

    public function __construct(string $firstName, string $orderId, array $items, float $totalAmount, string $status, string $notes = '')
    {
        $this->firstName   = $firstName;
        $this->orderId     = $orderId;
        $this->items       = $items;
        $this->totalAmount = $totalAmount;
        $this->status      = $status;
        $this->notes       = $notes;
    }

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: 'Order Received — Personalize Me Prints',
        );
    }

    public function content(): Content
    {
        return new Content(
            view: 'emails.order-confirmation',
        );
    }
}
