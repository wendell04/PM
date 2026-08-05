<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Cross-Origin Resource Sharing (CORS) Configuration
    |--------------------------------------------------------------------------
    |
    | Here you may configure your settings for cross-origin resource sharing
    | or "CORS". This determines what cross-origin operations may execute
    | in web browsers. You are free to adjust these settings as needed.
    |
    | To learn more: https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS
    |
    */

    'paths' => ['api/*', 'sanctum/csrf-cookie'],

    'allowed_methods' => ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],

    /*
    |--------------------------------------------------------------------------
    | ⚠️ PRODUCTION SECURITY NOTE
    |--------------------------------------------------------------------------
    | Set to frontend URL from environment variable.
    | Update FRONTEND_URL in .env for production deployment.
    |
    */
    'allowed_origins' => array_values(array_unique(array_filter([
        env('FRONTEND_URL', 'http://localhost:3000'),
        'http://localhost:3000',
        'http://127.0.0.1:3000',
    ]))),

    'allowed_origins_patterns' => array_values(array_filter([
        // Production domains — always allowed.
        '#^https://personalizemeprints\.com$#',
        '#^https://www\.personalizemeprints\.com$#',
        // Cloudflare Pages preview/branch deployments (*.pages.dev) — anyone can host on these,
        // so with supports_credentials=true they'd be exploitable in production. Allowed only
        // OUTSIDE production (for previews/testing). In production, pin the exact deployed
        // frontend via FRONTEND_URL (allowed_origins above) — or use the custom domain, which
        // is always allowed above.
        env('APP_ENV') === 'production' ? null : '#^https://[^.]+\.pages\.dev$#',
    ])),

    // 'ngrok-skip-browser-warning' is sent by several client-side admin fetches (a leftover from the
    // ngrok era; backend is now on Railway). A custom request header forces a CORS preflight, and the
    // preflight is rejected unless the header is listed here - which is what made the live dashboard's
    // browser fetches fail with "Failed to fetch" while server-rendered pages worked. Kept listed so
    // those fetches pass; the header itself is harmless and can be dropped from the frontend later.
    'allowed_headers' => ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'X-XSRF-TOKEN', 'ngrok-skip-browser-warning'],

    'exposed_headers' => [],

    'max_age' => 86400,

    'supports_credentials' => true,

];