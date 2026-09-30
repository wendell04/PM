<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

/**
 * "Your order is ready - settle the balance and it goes out." Sent by Send payment reminder.
 *
 * The reminder used to land only in the bell and the order chat, which a customer who is not in the
 * app never sees - and this is the one message that decides whether a finished order leaves the shop.
 */
class PaymentReminderMail extends Mailable implements ShouldQueue
{
    use Queueable, SerializesModels;

    public function __construct(
        public string $firstName,
        public string $orderRef,
        public float $total,
        public float $paid,
        public float $balance,
        public string $orderUrl,
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(subject: "Your order {$this->orderRef} is ready - balance due - Personalize Me Prints");
    }

    public function content(): Content
    {
        return new Content(view: 'emails.payment-reminder');
    }
}
