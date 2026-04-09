<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class AdminNewOrderMail extends Mailable implements ShouldQueue
{
    use Queueable, SerializesModels;

    public string $orderId;
    public string $customerName;
    public string $customerEmail;
    public string $customerPhone;
    public array  $items;
    public float  $totalAmount;
    public string $notes;

    public function __construct(string $orderId, string $customerName, string $customerEmail, string $customerPhone, array $items, float $totalAmount, string $notes = '')
    {
        $this->orderId       = $orderId;
        $this->customerName  = $customerName;
        $this->customerEmail = $customerEmail;
        $this->customerPhone = $customerPhone;
        $this->items         = $items;
        $this->totalAmount   = $totalAmount;
        $this->notes         = $notes;
    }

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: 'New Order Received — Personalize Me Prints',
        );
    }

    public function content(): Content
    {
        return new Content(
            view: 'emails.admin-new-order',
        );
    }
}
