<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

/**
 * Generic account-security notification (e.g. "your account was locked", "your password was
 * changed"). Alerts the real owner if an event they didn't trigger happened on their account.
 */
class AccountSecurityAlertMail extends Mailable implements ShouldQueue
{
    use Queueable, SerializesModels;

    public function __construct(
        public string $userName,
        public string $subjectLine,
        public string $headline,
        public string $message,
        public string $ipAddress,
        public string $eventTime,
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(subject: $this->subjectLine);
    }

    public function content(): Content
    {
        return new Content(view: 'emails.account-security-alert');
    }
}
