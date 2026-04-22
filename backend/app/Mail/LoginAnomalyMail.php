<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class LoginAnomalyMail extends Mailable implements ShouldQueue
{
    use Queueable, SerializesModels;

    public string $userName;
    public string $ipAddress;
    public string $userAgent;
    public string $loginTime;

    public function __construct(
        string $userName,
        string $ipAddress,
        string $userAgent,
        string $loginTime
    ) {
        $this->userName  = $userName;
        $this->ipAddress = $ipAddress;
        $this->userAgent = $userAgent;
        $this->loginTime = $loginTime;
    }

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: 'New sign-in to your Personalize Me Prints account',
        );
    }

    public function content(): Content
    {
        return new Content(
            view: 'emails.login-anomaly',
        );
    }
}
