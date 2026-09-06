<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Mail\Mailable;
use Illuminate\Queue\SerializesModels;

class ContactFormMail extends Mailable implements ShouldQueue
{
    use Queueable, SerializesModels;

    public $name;
    public $email;
    public $subject;
    public $message;

    /**
     * Create a new message instance.
     *
     * @return void
     */
    public function __construct($name, $email, $subject, $message)
    {
        $this->name = $name;
        $this->email = $email;
        $this->subject = $subject;
        $this->message = $message;
    }

    /**
     * Build the message.
     *
     * @return $this
     */
    public function build()
    {
        // The writer's address belongs in Reply-To, never in From. A relay may only send as a
        // domain it is authorised for, so sending "from" whatever was typed into the form fails
        // SPF/DKIM - Gmail silently rewrites it and Resend refuses it outright. Reply-To gets the
        // shop the same one-click reply without forging a sender.
        return $this->from(config('mail.from.address'), config('mail.from.name'))
                    ->replyTo($this->email, $this->name)
                    ->subject('Contact Form: ' . $this->subject)
                    ->markdown('emails.contact');
    }
}
