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