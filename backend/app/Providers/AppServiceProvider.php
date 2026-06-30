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
    }
}
