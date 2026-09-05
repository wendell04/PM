<?php

namespace App\Mail;

use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;

class TwoFactorMail extends Mailable
{

    public string $otpCode;
    public string $userName;
    public int    $expiryMinutes;

    public function __construct(
        string $otpCode,
        string $userName,
        int    $expiryMinutes = 5
    ) {
        // Routed down the security lane - see config/mail.php. A quota spent on order
        // notifications must never be able to stop somebody signing in.
        $this->mailer = config('mail.security_mailer');
        // Providers disagree about who may send as whom - Resend will only send from a
        // verified domain, so this lane needs its own sender when the shop's default
        // From is a Gmail address it cannot verify.
        if ($secFrom = config('mail.security_from.address')) {
            $this->from($secFrom, config('mail.security_from.name'));
        }
        $this->otpCode        = $otpCode;
        $this->userName       = $userName;
        $this->expiryMinutes  = $expiryMinutes;
    }

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: 'Your verification code — Personalize Me Prints',
        );
    }

    public function content(): Content
    {
        return new Content(
            view: 'emails.two-factor',
        );
    }
}
