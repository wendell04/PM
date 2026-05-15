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

        if ($this->isAuthPath($request)) {
            $response->headers->set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
            $response->headers->set('Pragma', 'no-cache');
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
