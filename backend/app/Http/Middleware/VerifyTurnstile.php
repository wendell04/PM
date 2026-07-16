<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * Verifies a Cloudflare Turnstile (CAPTCHA) token server-side before letting the request through.
 * Blocks bot sign-ups / abuse. If no secret is configured, it skips silently so non-CAPTCHA
 * environments keep working.
 */
class VerifyTurnstile
{
    public function handle(Request $request, Closure $next)
    {
        // Only enforce CAPTCHA in production. On localhost the widget's token is tied to the
        // dev hostname / a mismatched key pair, so siteverify would reject every legitimate
        // sign-up ("Verification failed"). Skipping in non-production keeps dev testing working;
        // production still gets full bot protection.
        if (!app()->environment('production')) {
            return $next($request);
        }

        $secret = env('TURNSTILE_SECRET_KEY');

        // Not configured → skip (other envs without Turnstile keys still work).
        if (empty($secret)) {
            return $next($request);
        }

        $token = $request->input('turnstileToken') ?? $request->input('cf-turnstile-response');
        if (empty($token)) {
            return response()->json(['message' => 'Please complete the verification challenge.'], 422);
        }

        try {
            $resp = Http::asForm()->timeout(8)->post(
                'https://challenges.cloudflare.com/turnstile/v0/siteverify',
                [
                    'secret'   => $secret,
                    'response' => $token,
                    'remoteip' => $request->ip(),
                ]
            );
            $success = $resp->ok() && ($resp->json('success') === true);
        } catch (\Throwable $e) {
            // Cloudflare unreachable — fail open so a network blip doesn't block legitimate sign-ups.
            Log::warning('Turnstile verify error (allowing through): ' . $e->getMessage());
            return $next($request);
        }

        if (!$success) {
            return response()->json(['message' => 'Verification failed. Please try again.'], 422);
        }

        return $next($request);
    }
}
