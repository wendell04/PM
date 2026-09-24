<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class SecurityHeaders
{
    private const AUTH_PATH_PATTERNS = [
        'api/login', 'api/register', 'api/logout',
        'api/auth/login', 'api/auth/logout', 'api/auth/me',
        'api/verify-email', 'api/resend-code',
        'api/forgot-password', 'api/verify-reset-token',
        'api/send-reset-code', 'api/verify-reset-code', 'api/reset-password',
        'api/2fa/send', 'api/2fa/verify', 'api/2fa/remember-device',
    ];

    public function handle(Request $request, Closure $next): Response
    {
        $response = $next($request);

        // Nothing this API answers may be stored. Only the auth paths said so, and the rest went
        // out as "no-cache, private", which lets a browser keep the body and reuse it: the chat
        // inbox came back empty on an ordinary visit and filled only on a hard reload, because the
        // empty answer from a first call had been kept. The same caching holds customer names,
        // phone numbers and addresses in the disk cache of whatever machine opened the dashboard.
        if ($this->isApiPath($request) || $this->isAuthPath($request)) {
            $response->headers->set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
            $response->headers->set('Pragma', 'no-cache');
            $response->headers->set('Expires', '0');
        }

        $response->headers->set('X-Content-Type-Options', 'nosniff');
        $response->headers->set('X-Frame-Options', 'DENY');
        $response->headers->set('Referrer-Policy', 'strict-origin-when-cross-origin');
        $response->headers->set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
        $response->headers->set(
            'Strict-Transport-Security',
            'max-age=31536000; includeSubDomains'
        );
        $response->headers->set(
            'Content-Security-Policy',
            implode('; ', [
                "default-src 'self'",
                "script-src 'self'",
                "style-src 'self'",
                "img-src 'self' data: https://res.cloudinary.com",
                "font-src 'self'",
                "connect-src 'self'",
                "frame-ancestors 'none'",
            ])
        );

        return $response;
    }

    /** Every answer this API gives is about somebody's live data, and none of it may be stored. */
    private function isApiPath(Request $request): bool
    {
        return str_starts_with(ltrim($request->path(), '/'), 'api/');
    }

    private function isAuthPath(Request $request): bool
    {
        $path = ltrim($request->path(), '/');
        foreach (self::AUTH_PATH_PATTERNS as $pattern) {
            if ($path === ltrim($pattern, '/')) {
                return true;
            }
        }
        return false;
    }
}
