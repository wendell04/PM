<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Default Mailer
    |--------------------------------------------------------------------------
    |
    | This option controls the default mailer that is used to send all email
    | messages unless another mailer is explicitly specified when sending
    | the message. All additional mailers can be configured within the
    | "mailers" array. Examples of each type of mailer are provided.
    |
    | ⚠️ PRODUCTION NOTE: Configure SMTP settings in .env.
    | Set MAIL_MAILER=smtp in .env with SMTP credentials.
    */

    'default' => env('MAIL_MAILER', 'smtp'),

    /*
    |--------------------------------------------------------------------------
    | Mailer Configurations
    |--------------------------------------------------------------------------
    |
    | Here you may configure all of the mailers used by your application plus
    | their respective settings. Several examples have been configured for
    | you and you are free to add your own as your application requires.
    |
    | Laravel supports a variety of mail "transport" drivers that can be used
    | when delivering an email. You may specify which one you're using for
    | your mailers below. You may also add additional mailers if needed.
    |
    | Supported: "smtp", "sendmail", "mailgun", "ses", "ses-v2",
    |            "postmark", "resend", "log", "array",
    |            "failover", "roundrobin"
    |
    */

    'mailers' => [

        'smtp' => [
            'transport' => 'smtp',
            'scheme' => env('MAIL_SCHEME'),
            'url' => env('MAIL_URL'),
            'host' => env('MAIL_HOST', '127.0.0.1'),
            'port' => env('MAIL_PORT', 2525),
            'username' => env('MAIL_USERNAME'),
            'password' => env('MAIL_PASSWORD'),
            // Short timeout so a blocked/slow SMTP host (Railway blocks outbound port 587) fails
            // fast instead of hanging the request for the PHP default (~60s).
            'timeout' => env('MAIL_TIMEOUT', 8),
            'local_domain' => env('MAIL_EHLO_DOMAIN', parse_url((string) env('APP_URL', 'http://localhost'), PHP_URL_HOST)),
        ],

        'ses' => [
            'transport' => 'ses',
        ],

        'postmark' => [
            'transport' => 'postmark',
            // 'message_stream_id' => env('POSTMARK_MESSAGE_STREAM_ID'),
            // 'client' => [
            //     'timeout' => 5,
            // ],
        ],

        'resend' => [
            'transport' => 'resend',
        ],

        'sendmail' => [
            'transport' => 'sendmail',
            'path' => env('MAIL_SENDMAIL_PATH', '/usr/sbin/sendmail -bs -i'),
        ],

        'log' => [
            'transport' => 'log',
            'channel' => env('MAIL_LOG_CHANNEL'),
        ],

        'array' => [
            'transport' => 'array',
        ],

        'failover' => [
            'transport' => 'failover',
            'mailers' => [
                'smtp',
                'log',
            ],
            'retry_after' => 60,
        ],

        'roundrobin' => [
            'transport' => 'roundrobin',
            'mailers' => [
                'ses',
                'postmark',
            ],
            'retry_after' => 60,
        ],

    ],

    /*
    |--------------------------------------------------------------------------
    | Global "From" Address
    |--------------------------------------------------------------------------
    |
    | You may wish for all emails sent by your application to be sent from
    | the same address. Here you may specify a name and address that is
    | used globally for all emails that are sent by your application.
    |
    */

    'from' => [
        'address' => env('MAIL_FROM_ADDRESS', 'hello@example.com'),
        'name' => env('MAIL_FROM_NAME', 'Example'),
    ],

    /*
    |--------------------------------------------------------------------------
    | Shop Inbox
    |--------------------------------------------------------------------------
    |
    | Where contact-form messages and owner alerts are delivered. It lives here
    | rather than being read with env() at the call site because `php artisan
    | config:cache` stops loading .env entirely - after that, an env() call
    | outside a config file returns null, and the two callers that used to make
    | one silently addressed mail to a hardcoded fallback or to nothing at all.
    |
    */

    'admin_recipient' => env('ADMIN_EMAIL', env('MAIL_FROM_ADDRESS')),

    /*
    |--------------------------------------------------------------------------
    | Security Mail Lane
    |--------------------------------------------------------------------------
    |
    | Which mailer carries one-time codes, password resets and login alerts.
    | Everything else uses the default MAIL_MAILER. Keeping them apart means a
    | daily quota spent on order notifications cannot stop someone signing in,
    | and the two can sit on different providers entirely.
    |
    | Falls back to the default mailer, so leaving it unset changes nothing.
    |
    */

    'security_mailer' => env('MAIL_SECURITY_MAILER', env('MAIL_MAILER', 'smtp')),

    /*
    |--------------------------------------------------------------------------
    | Security Mail Sender
    |--------------------------------------------------------------------------
    |
    | The security lane usually sits on a different provider from the default
    | one, and providers do not agree about who may send as whom. Resend, for
    | instance, will only send from a domain you have verified - so a shop whose
    | MAIL_FROM_ADDRESS is a Gmail address cannot use it for this lane without
    | its own sender. Leave unset and the lane keeps the default From.
    |
    */

    'security_from' => [
        'address' => env('MAIL_SECURITY_FROM_ADDRESS'),
        'name'    => env('MAIL_SECURITY_FROM_NAME', env('MAIL_FROM_NAME', 'Personalize Me Prints')),
    ],

];
