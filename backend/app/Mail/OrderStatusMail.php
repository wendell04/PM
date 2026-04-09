<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class OrderStatusMail extends Mailable implements ShouldQueue
{
    use Queueable, SerializesModels;

    public string $firstName;
    public string $orderId;
    public string $newStatus;
    public float  $totalAmount;

    public function __construct(string $firstName, string $orderId, string $newStatus, float $totalAmount)
    {
        $this->firstName   = $firstName;
        $this->orderId     = $orderId;
        $this->newStatus   = $newStatus;
        $this->totalAmount = $totalAmount;
    }

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: 'Your Order Status Has Been Updated — Personalize Me Prints',
        );
    }

    public function content(): Content
    {
        return new Content(
            view: 'emails.order-status',
        );
    }
}
