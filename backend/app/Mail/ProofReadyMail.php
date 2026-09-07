<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

/**
 * The proof is up and the order is waiting on the customer.
 *
 * On a request-design order nothing moves until this is approved - no job order, no production,
 * and on the deposit model the balance is not even payable yet. A bell notification is seen only
 * by someone who happens to open the app, so an order could sit still for days with the shop
 * waiting on a customer who never learned it was their turn. This is one of only two moments
 * worth an email: the customer has to act, and the order stops until they do.
 */
class ProofReadyMail extends Mailable implements ShouldQueue
{
    use Queueable, SerializesModels;

    public string $firstName;
    public string $orderRef;
    /** Watermarked proof images, already sized down by the caller. */
    public array  $proofs;

    public function __construct(string $firstName, string $orderRef, array $proofs = [])
    {
        $this->firstName = $firstName !== '' ? $firstName : 'there';
        $this->orderRef  = $orderRef;
        $this->proofs    = array_slice($proofs, 0, 3);
    }

    public function envelope(): Envelope
    {
        return new Envelope(subject: 'Your proof is ready to review - Personalize Me Prints');
    }

    public function content(): Content
    {
        return new Content(view: 'emails.proof-ready');
    }
}
