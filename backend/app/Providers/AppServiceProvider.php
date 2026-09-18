<?php

namespace App\Providers;

use Illuminate\Support\ServiceProvider;
use Illuminate\Support\Facades\Mail;
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
        // Laravel has no Brevo driver, so the Symfony bridge is wired in by hand. The API
        // transport is the only usable one here - BrevoSmtpTransport would go out over 587, which
        // Railway blocks on this plan.
        Mail::extend('brevo', function (array $config) {
            return (new \Symfony\Component\Mailer\Bridge\Brevo\Transport\BrevoTransportFactory())
                ->create(new \Symfony\Component\Mailer\Transport\Dsn(
                    'brevo+api',
                    'default',
                    // The bridge reads the API key off the DSN's user, not its password.
                    (string) ($config['key'] ?? ''),
                ));
        });

        // Resend refusing a mail is silent: the failover logs it at debug, which production drops,
        // and Brevo quietly carries the mail. Every security mail has gone to Brevo since 17 Sep
        // and nothing said why. Same transport, one warning line with Resend's own reason.
        Mail::extend('resend', function (array $config) {
            return new class(app('resend'), $config['options'] ?? []) extends \Resend\Laravel\Transport\ResendTransportFactory {
                protected function doSend(\Symfony\Component\Mailer\SentMessage $message): void
                {
                    try {
                        parent::doSend($message);
                    } catch (\Symfony\Component\Mailer\Exception\TransportExceptionInterface $e) {
                        \Illuminate\Support\Facades\Log::warning('Resend refused a mail; the failover tries the next mailer', ['reason' => $e->getMessage()]);
                        // Straight to the container's error output too: the log channel on the
                        // host may write to a file nobody can read.
                        error_log('[mail] Resend refused a mail: ' . $e->getMessage());
                        throw $e;
                    }
                }
            };
        });

        // Every mail replies to the shop's own inbox. The sender has to be the verified domain
        // - Resend refuses anything else and Railway blocks the SMTP that would let us send as
        // Gmail directly - so this is what actually carries a customer's reply to the owner.
        // ContactFormMail overrides it with the writer's address; see the note there.
        if ($replyTo = config('mail.reply_to.address')) {
            Mail::alwaysReplyTo($replyTo, config('mail.reply_to.name'));
        }

        Sanctum::usePersonalAccessTokenModel(PersonalAccessToken::class);

        $this->app->bind(
            \Laravel\Sanctum\PersonalAccessToken::class,
            \App\Models\PersonalAccessToken::class
        );

        // Login flood limiter - scoped per ACCOUNT (email+IP), not per raw IP, so one stuck tab,
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

        // Sign-up flood limiter - per IP, env-tunable (default 10/min, a safe production value).
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

        // How many codes one ADDRESS may be sent, whatever the IP: sign-up codes, reset links and
        // codes, 2FA codes. The per-IP limits above stop floods; this stops one inbox being
        // hammered - and, since every code is an email, it is what keeps the day's mail quota
        // from being spent on one person pressing Resend. Four in fifteen minutes covers a full
        // password reset (link + code) with a retry of each; twelve a day is generous for anyone
        // who is not stuck. The message says when to try again rather than "too many requests".
        RateLimiter::for('code-address', function (Request $request) {
            $address = strtolower(trim((string) ($request->input('email') ?: ($request->user()->email ?? '') ?: $request->ip())));
            $key = 'code:' . sha1($address);
            return [
                Limit::perMinutes(15, 4)->by($key)->response(fn () => response()->json(
                    ['message' => 'We have already sent 4 codes to this address in the last 15 minutes. Check your inbox and spam folder - the latest code still works - or try again in 15 minutes.'],
                    429
                )),
                Limit::perDay(12)->by('day:' . $key)->response(fn () => response()->json(
                    ['message' => 'This address has reached today\'s limit for codes. Please try again tomorrow, or message us in the chat.'],
                    429
                )),
            ];
        });

        // Email/code verification limiter - per IP, env-tunable (default 10/min). Covers verify-email
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
