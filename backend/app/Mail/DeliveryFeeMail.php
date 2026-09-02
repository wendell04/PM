<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

/**
 * The courier fee, once the shop has booked the rider and knows the number.
 *
 * This is the only moment in the whole order where money is asked of the customer that they were
 * never quoted - the item total was settled at checkout, and this is the courier's own charge on
 * top of it. A bell notification is not enough for that: it is seen only by someone already in the
 * app, and it is the one figure they have to have ready when the rider arrives.
 */
class DeliveryFeeMail extends Mailable implements ShouldQueue
{
    use Queueable, SerializesModels;

    public string $firstName;
    public string $orderId;
    public float  $fee;
    public float  $itemTotal;

    public function __construct(string $firstName, string $orderId, float $fee, float $itemTotal)
    {
        $this->firstName = $firstName;
        $this->orderId   = $orderId;
        $this->fee       = $fee;
        $this->itemTotal = $itemTotal;
    }

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: 'Your delivery fee is ready - Personalize Me Prints',
        );
    }

    public function content(): Content
    {
        return new Content(
            view: 'emails.delivery-fee',
        );
    }
}
