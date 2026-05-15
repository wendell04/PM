<?php

use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Middleware\HandleCors;
use Illuminate\Auth\AuthenticationException;
use Symfony\Component\HttpKernel\Exception\HttpException;
use App\Http\Middleware\SecurityHeaders;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        channels: __DIR__.'/../routes/channels.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->prepend(SecurityHeaders::class);
        $middleware->prepend(HandleCors::class);
        $middleware->alias([
            'isAdmin'    => \App\Http\Middleware\IsAdminMiddleware::class,
        ]);
        $middleware->redirectGuestsTo(fn() => null);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        // Forward unhandled exceptions to Sentry (no-op if DSN not configured)
        $exceptions->report(function (\Throwable $e) {
            if (app()->bound('sentry') && app('sentry')->getHub()->getClient()) {
                \Sentry\captureException($e);
            }
        })->stop();

        // Handle unauthenticated requests — return 401 JSON
        // instead of redirecting to non-existent login route
        $exceptions->render(function (AuthenticationException $e, $request) {
            if ($request->is('api/*') || $request->expectsJson()) {
                return response()->json([
                    'success' => false,
                    'message' => 'Unauthenticated.',
                ], 401);
            }
        });

        // Database unavailable (MongoDB timeout) — return 503 so clients keep the session
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
