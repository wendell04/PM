<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Mail\Mailable;
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

    public function __construct(
        string $firstName,
        string $orderRef,
        float $amount,
        string $method,
        float $paidTotal,
        float $balance,
        ?string $reference = null
    ) {
        $this->firstName = $firstName !== '' ? $firstName : 'there';
        $this->orderRef  = $orderRef;
        $this->amount    = $amount;
        $this->method    = $method;
        $this->paidTotal = $paidTotal;
        $this->balance   = $balance;
        $this->reference = $reference;
    }

    public function envelope(): Envelope
    {
        return new Envelope(subject: 'We received your payment - Personalize Me Prints');
    }

    public function content(): Content
    {
        return new Content(view: 'emails.payment-received');
    }
}
