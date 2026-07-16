<?php

namespace App\Providers;

use Illuminate\Support\ServiceProvider;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Laravel\Sanctum\Sanctum;
use App\Models\PersonalAccessToken;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        Sanctum::usePersonalAccessTokenModel(PersonalAccessToken::class);

        $this->app->bind(
            \Laravel\Sanctum\PersonalAccessToken::class,
            \App\Models\PersonalAccessToken::class
        );

        // Login flood limiter — scoped per ACCOUNT (email+IP), not per raw IP, so one stuck tab,
        // a 2FA re-submit, or shared network can't lock out a legitimate user. Brute-force is handled
        // by the account lockout in AuthController (3 wrong passwords -> 15-min lock). A loose per-IP
        // ceiling still guards against flooding.
        RateLimiter::for('login', function (Request $request) {
            $email = strtolower(trim((string) $request->input('email')));
            $msg = response()->json(
                ['message' => 'Too many login attempts. Please wait a minute and try again.'],
                429
            );
            return [
                Limit::perMinute(20)->by($email . '|' . $request->ip())->response(fn () => $msg),
                Limit::perMinute(40)->by($request->ip())->response(fn () => $msg),
            ];
        });

        // Sign-up flood limiter — per IP, env-tunable (default 10/min, a safe production value).
        // Raise REGISTER_THROTTLE in .env only for a controlled load test (e.g. a shared-IP lab),
        // then revert; the default keeps production protected without any code change. If config is
        // cached and the env var isn't set, it falls back to the secure default.
        RateLimiter::for('register', function (Request $request) {
            $perMin = max(1, (int) env('REGISTER_THROTTLE', 10));
            $msg = response()->json(
                ['message' => 'Too many sign-up attempts. Please wait a minute and try again.'],
                429
            );
            return Limit::perMinute($perMin)->by($request->ip())->response(fn () => $msg);
        });

        // Email/code verification limiter — per IP, env-tunable (default 10/min). Covers verify-email
        // and resend-code (the burst right after sign-up). Same test-override behavior via VERIFY_THROTTLE.
        RateLimiter::for('verify', function (Request $request) {
            $perMin = max(1, (int) env('VERIFY_THROTTLE', 10));
            $msg = response()->json(
                ['message' => 'Too many attempts. Please wait a minute and try again.'],
                429
            );
            return Limit::perMinute($perMin)->by($request->ip())->response(fn () => $msg);
        });
    }
}
