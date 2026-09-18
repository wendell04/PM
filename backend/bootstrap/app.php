<?php

use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Middleware\HandleCors;
use Illuminate\Auth\AuthenticationException;
use Symfony\Component\HttpKernel\Exception\HttpException;
use App\Http\Middleware\SecurityHeaders;
use Illuminate\Http\Request;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        channels: __DIR__.'/../routes/channels.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        // Railway sits behind Cloudflare, and with no proxy trusted at all $request->ip()
        // returned the edge's address for every visitor. That is worse than it sounds: the
        // rate limiters key on it, so Limit::perMinute(40)->by($request->ip()) on login meant
        // 40 attempts a minute for the WHOLE SITE, shared - one bot could exhaust the bucket
        // and lock out every real customer. It also made login-anomaly detection blind, showed
        // Cloudflare's IP as the device in "active sessions", and recorded the edge's address
        // as acceptedTermsIp, weakening the very evidence the T&C clickwrap exists to produce.
        //
        // Trusting every proxy is right while the origin is only reachable through Cloudflare.
        // If the Railway URL is ever exposed directly, a caller could forge X-Forwarded-For and
        // hand us any IP it likes - close that by serving the custom domain only. Kept literal
        // rather than read from env(): a cached config makes env() return null out here, which
        // would silently put us back where we started.
        $middleware->trustProxies(at: '*', headers: Request::HEADER_X_FORWARDED_FOR
            | Request::HEADER_X_FORWARDED_HOST
            | Request::HEADER_X_FORWARDED_PORT
            | Request::HEADER_X_FORWARDED_PROTO);

        $middleware->prepend(SecurityHeaders::class);
        $middleware->prepend(HandleCors::class);
        $middleware->alias([
            'isAdmin'     => \App\Http\Middleware\IsAdminMiddleware::class,
            'permission'  => \App\Http\Middleware\CheckPermission::class,
        ]);
        // Confine limited "2fa-pending" tokens to the 2FA-completion endpoints so the
        // second factor is enforced server-side, not just by the frontend redirect.
        $middleware->appendToGroup('api', \App\Http\Middleware\EnsureTwoFactorComplete::class);
        $middleware->redirectGuestsTo(fn() => null);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        // Forward unhandled exceptions to Sentry (no-op if DSN not configured)
        $exceptions->report(function (\Throwable $e) {
            // app('sentry') IS the Hub - it has getClient(), not getHub(). The old call threw
            // "Call to undefined method Sentry\State\Hub::getHub()" from inside the reporter, so
            // every exception was replaced by a fatal error in the code meant to report it. The real
            // failure never reached the log or the response; what surfaced was this one, or the
            // generic "An unexpected error occurred" the renderer falls back to.
            if (app()->bound('sentry') && app('sentry')->getClient()) {
                \Sentry\captureException($e);
            }
        })->stop();

        // Handle unauthenticated requests - return 401 JSON
        // instead of redirecting to non-existent login route
        $exceptions->render(function (AuthenticationException $e, $request) {
            if ($request->is('api/*') || $request->expectsJson()) {
                return response()->json([
                    'success' => false,
                    'message' => 'Unauthenticated.',
                ], 401);
            }
        });

        // Database unavailable (MongoDB timeout) - return 503 so clients keep the session
        $exceptions->render(function (HttpException $e, $request) {
            if ($e->getStatusCode() === 503 && ($request->is('api/*') || $request->expectsJson())) {
                return response()->json([
                    'success' => false,
                    'message' => 'Service temporarily unavailable. Please try again.',
                ], 503);
            }
        });

        // Handle all other exceptions on API routes
        $exceptions->render(function (\Throwable $e, $request) {
            if ($request->is('api/*')) {
                if (app()->environment('local', 'development')) {
                    return response()->json([
                        'message' => $e->getMessage(),
                        'file'    => $e->getFile(),
                        'line'    => $e->getLine(),
                    ], 500);
                }

                return response()->json([
                    'message' => 'An unexpected error occurred.',
                ], 500);
            }
        });
    })->create();
