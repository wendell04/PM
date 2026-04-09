<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class TwoFactorMail extends Mailable
{
    use Queueable, SerializesModels;

    public string $otpCode;
    public string $userName;
    public int    $expiryMinutes;

    public function __construct(
        string $otpCode,
        string $userName,
        int    $expiryMinutes = 5
    ) {
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
