<?php

namespace App\Mail;

use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;

/**
 * "You have been added to the team - set your password."
 *
 * The owner adds a person by email and never types their password; the person sets it from this
 * link. It rides the same link-token the password reset uses (so the landing page already knows
 * how to finish it), with a longer life: an invite is often opened the next morning.
 */
class StaffInviteMail extends Mailable
{
    public string $inviteUrl;
    public string $firstName;
    public string $roleLabel;

    public function __construct(string $inviteUrl, string $firstName, string $roleLabel)
    {
        // Security lane, like every other sign-in email - see config/mail.php.
        $this->mailer = config('mail.security_mailer');
        if ($secFrom = config('mail.security_from.address')) {
            $this->from($secFrom, config('mail.security_from.name'));
        }
        $this->inviteUrl = $inviteUrl;
        $this->firstName = $firstName;
        $this->roleLabel = $roleLabel;
    }

    public function envelope(): Envelope
    {
        return new Envelope(subject: 'You have been added to the Personalize Me Prints team');
    }

    public function content(): Content
    {
        return new Content(view: 'emails.staff-invite');
    }

    public function attachments(): array
    {
        return [];
    }
}
