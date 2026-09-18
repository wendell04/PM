<?php

namespace App\Mail;

use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;

class PasswordResetLinkMail extends Mailable
{

    public string $resetUrl;
    public string $firstName;

    /**
     * Create a new message instance.
     */
    public function __construct(string $resetUrl, string $firstName)
    {
        // Routed down the security lane - see config/mail.php. A quota spent on order
        // notifications must never be able to stop somebody signing in.
        $this->mailer = config('mail.security_mailer');
        // Providers disagree about who may send as whom - Resend will only send from a
        // verified domain, so this lane needs its own sender when the shop's default
        // From is a Gmail address it cannot verify.
        if ($secFrom = config('mail.security_from.address')) {
            $this->from($secFrom, config('mail.security_from.name'));
        }
        $this->resetUrl = $resetUrl;
        $this->firstName = $firstName;
    }

    /**
     * Get the message envelope.
     */
    public function envelope(): Envelope
    {
        return new Envelope(
            subject: 'Password Reset Request - Personalize Me Prints',
        );
    }

    /**
     * Get the message content definition.
     */
    public function content(): Content
    {
        return new Content(
            view: 'emails.password-reset-link',
        );
    }

    /**
     * Get the attachments for the message.
     *
     * @return array<int, \Illuminate\Mail\Mailables\Attachment>
     */
    public function attachments(): array
    {
        return [];
    }
}
