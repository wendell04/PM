<?php

return [
    'dsn' => env('SENTRY_LARAVEL_DSN', env('SENTRY_DSN')),

    // Capture errors in local env too (set false in .env for local dev if noisy)
    'environment' => env('APP_ENV', 'production'),

    // Performance monitoring — sample 10% of transactions in production
    'traces_sample_rate' => env('SENTRY_TRACES_SAMPLE_RATE', 0.1),

    // Profile 10% of sampled transactions
    'profiles_sample_rate' => env('SENTRY_PROFILES_SAMPLE_RATE', 0.1),

    'breadcrumbs' => [
        'logs'            => true,
        'cache'           => true,
        'livewire'        => true,
        'sql_queries'     => true,
        'sql_bindings'    => false, // never log query bindings (may contain PII)
        'queue_info'      => true,
        'command_info'    => true,
        'http_client_requests' => true,
    ],

    'tracing' => [
        'queue_job_transactions' => true,
        'queue_jobs'             => true,
        'sql_queries'            => true,
        'sql_origin'             => true,
        'views'                  => true,
        'missing_routes'         => true,
        'http_client_requests'   => true,
    ],

    // Strip sensitive request data before sending to Sentry
    'send_default_pii' => false,
];
