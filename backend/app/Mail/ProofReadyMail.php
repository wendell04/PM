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
    /**
     * What is still owed on the goods. Above zero, approving is what makes it payable (a
     * request-design order has only paid its design fee); zero, approving starts production.
     */
    public float  $balanceAfter;

    public function __construct(string $firstName, string $orderRef, array $proofs = [], float $balanceAfter = 0.0)
    {
        $this->firstName    = $firstName !== '' ? $firstName : 'there';
        $this->orderRef     = $orderRef;
        // No email client plays video, and an <img> on an .mp4 is a broken box. Cloudinary
        // returns a still frame for the same asset when asked for .jpg - the same swap the chat
        // widget makes for its thumbnails.
        $this->proofs       = array_map(
            fn ($u) => preg_replace('/\.(mp4|webm|mov|m4v|ogg)(\?|$)/i', '.jpg$2', (string) $u),
            array_slice($proofs, 0, 3)
        );
        $this->balanceAfter = max(0.0, round($balanceAfter, 2));
    }

    public function envelope(): Envelope
    {
        // The reference belongs in the subject. Without it every proof for every order shares
        // one, Gmail threads them together, and the newest arrives collapsed under the old ones.
        return new Envelope(subject: 'Your proof is ready to review - ORD-' . $this->orderRef . ' - Personalize Me Prints');
    }

    public function content(): Content
    {
        return new Content(view: 'emails.proof-ready');
    }
}
