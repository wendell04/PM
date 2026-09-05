<?php

namespace App\Mail;

use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;

class VerificationCodeMail extends Mailable
{

    public string $code;
    public string $firstName;

    public function __construct(string $code, string $firstName)
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
        $this->code = $code;
        $this->firstName = $firstName;
    }

    public function envelope(): Envelope
    {
        return new Envelope(subject: 'Your Personalize Me Prints Verification Code', );
    }

    public function content(): Content 
    {
        return new Content(view: 'emails.verification-code', );
    }
}