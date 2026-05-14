<?php

namespace App\Http\Controllers;

use App\Mail\TwoFactorMail;
use App\Models\OtpCode;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;
use PragmaRX\Google2FA\Google2FA;
use BaconQrCode\Renderer\ImageRenderer;
use BaconQrCode\Renderer\Image\SvgImageBackEnd;
use BaconQrCode\Renderer\RendererStyle\RendererStyle;
use BaconQrCode\Writer;

class TwoFactorController extends Controller
{
    // ─── Send OTP (email only — skips if user chose TOTP) ─────────────────
    public function sendOtp(Request $request)
    {
        try {
            $user   = $request->user();
            $method = $user->two_factor_method ?? 'email';

            // TOTP users use their authenticator app — nothing to send
            if ($method === 'totp') {
                return response()->json([
                    'message'  => 'Use your authenticator app to get your code.',
                    'channels' => ['totp'],
                ], 200);
            }

            // ── Lockout check ──────────────────────────────────────────────
            if ($user->otp_locked_until &&
                now()->lt(\Carbon\Carbon::parse($user->otp_locked_until))) {
                return response()->json([
                    'message'      => 'Account temporarily locked. Try again later.',
                    'locked_until' => $user->otp_locked_until,
                ], 423);
            }

            // Clear expired lockout
            if ($user->otp_locked_until &&
                now()->gte(\Carbon\Carbon::parse($user->otp_locked_until))) {
                $user->otp_locked_until = null;
                $user->save();
            }

            // ── 30-second resend cooldown ──────────────────────────────────
            $existing = OtpCode::where('user_id', (string) $user->_id)
                               ->where('used', false)
                               ->latest('created_at')
                               ->first();

            if ($existing) {
                $secondsSinceSent = max(0, (int) now()->diffInSeconds(
                    $existing->created_at, true
                ));

                if ($secondsSinceSent < 2) {
                    // React Strict Mode duplicate call
                    return response()->json(['message' => 'OTP sent.'], 200);
                }
                if ($secondsSinceSent < 30) {
                    return response()->json([
                        'message'     => 'Please wait before requesting a new code.',
                        'retry_after' => max(0, 30 - $secondsSinceSent),
                    ], 429);
                }
            }

            // ── Delete old unused OTPs ────────────────────────────────────
            OtpCode::where('user_id', (string) $user->_id)
                   ->where('used', false)
                   ->delete();

            // ── Generate and store OTP ────────────────────────────────────
            $plainCode = (string) random_int(100000, 999999);

            OtpCode::create([
                'user_id'    => (string) $user->_id,
                'code_hash'  => Hash::make($plainCode),
                'expires_at' => now()->addMinutes(5),
                'attempts'   => 0,
                'used'       => false,
            ]);

            // ── Send via email ────────────────────────────────────────────
            $mailRecipient = $user->email;
            $otpToSend     = $plainCode;
            $nameToUse     = $user->firstName ?? 'User';

            try {
                Mail::to($mailRecipient)->send(
                    new TwoFactorMail(
                        otpCode:       $otpToSend,
                        userName:      $nameToUse,
                        expiryMinutes: 5
                    )
                );
            } catch (\Exception $e) {
                Log::error('TwoFactor email failed: ' . $e->getMessage());
                return response()->json(['message' => 'Failed to send OTP email. Please try again.'], 500);
            }

            return response()->json([
                'message'  => 'OTP sent.',
                'channels' => ['email'],
            ], 200);

        } catch (\Exception $e) {
            Log::error('TwoFactorController@sendOtp: ' . $e->getMessage());
            return response()->json(['message' => 'Failed to send OTP.'], 500);
        }
    }

    // ─── Verify OTP (email path — unchanged) ──────────────────────────────
    public function verifyOtp(Request $request)
    {
        $request->validate(['code' => 'required|string|size:6']);

        try {
            $user = $request->user();

            $otp = OtpCode::where('user_id', (string) $user->_id)
                          ->where('used', false)
                          ->where('expires_at', '>', now())
                          ->latest('created_at')
                          ->first();

            if (!$otp) {
                return response()->json(['message' => 'No active code found.'], 422);
            }

            if (!Hash::check($request->code, $otp->code_hash)) {
                $otp->attempts += 1;

                if ($otp->attempts >= 3) {
                    $otp->used = true;
                    $otp->save();

                    $user->otp_locked_until = now()->addMinutes(10)->toISOString();
                    $user->save();

                    Log::warning('2FA locked: max attempts exceeded', [
                        'user' => $user->email,
                        'ip'   => $request->ip(),
                    ]);

                    return response()->json([
                        'message'      => 'Too many attempts. Try again in 10 minutes.',
                        'locked_until' => now()->addMinutes(10)->toISOString(),
                    ], 423);
                }

                $otp->save();

                Log::warning('2FA failed: invalid code', [
                    'user'     => $user->email,
                    'attempts' => $otp->attempts,
                    'ip'       => $request->ip(),
                ]);

                return response()->json([
                    'message'   => 'Invalid code.',
                    'remaining' => 3 - $otp->attempts,
                ], 422);
            }

            $otp->used = true;
            $otp->save();

            Log::info('2FA verified', ['user' => $user->email, 'ip' => $request->ip()]);

            return response()->json(['message' => 'OTP verified.', 'verified' => true], 200);

        } catch (\Exception $e) {
            Log::error('TwoFactorController@verifyOtp: ' . $e->getMessage());
            return response()->json(['message' => 'Verification failed.'], 500);
        }
    }

    // ─── TOTP Setup — generate secret + QR code ───────────────────────────
    public function setupTotp(Request $request)
    {
        try {
            $user      = $request->user();
            $google2fa = new Google2FA();
            $secret    = $google2fa->generateSecretKey();

            // Save unconfirmed secret
            $user->totp_secret    = $secret;
            $user->totp_confirmed = false;
            $user->save();

            // Build QR code URL
            $appName = config('app.name', 'PersonalizeMe Prints');
            $qrUrl   = $google2fa->getQRCodeUrl($appName, $user->email, $secret);

            // Generate SVG QR code (inline, no external dependency)
            $renderer = new ImageRenderer(
                new RendererStyle(200),
                new SvgImageBackEnd()
            );
            $writer = new Writer($renderer);
            $qrSvg  = base64_encode($writer->writeString($qrUrl));

            return response()->json([
                'secret'       => $secret,
                'qr_code'      => 'data:image/svg+xml;base64,' . $qrSvg,
                'manual_entry' => [
                    'account' => $user->email,
                    'key'     => $secret,
                    'issuer'  => $appName,
                ],
                'instructions' => [
                    '1. Open Google Authenticator or any TOTP app.',
                    '2. Tap the + button and choose "Scan QR code".',
                    '3. Or tap "Enter setup key" and type the key manually.',
                    '4. Enter the 6-digit code shown in the app to confirm.',
                ],
            ], 200);

        } catch (\Exception $e) {
            Log::error('TwoFactorController@setupTotp: ' . $e->getMessage());
            return response()->json(['message' => 'Failed to setup authenticator.'], 500);
        }
    }

    // ─── TOTP Confirm — verify first scan before activating ───────────────
    public function confirmTotp(Request $request)
    {
        $request->validate(['code' => 'required|string|digits:6']);

        try {
            $user      = $request->user();
            $google2fa = new Google2FA();

            if (!$user->totp_secret) {
                return response()->json([
                    'message' => 'No authenticator setup found. Please start again.',
                ], 400);
            }

            $valid = $google2fa->verifyKey($user->totp_secret, $request->code, 1);

            if (!$valid) {
                return response()->json([
                    'message' => 'Invalid code. Make sure your device time is correct and try again.',
                ], 422);
            }

            // Activate TOTP
            $user->totp_confirmed     = true;
            $user->two_factor_enabled = true;
            $user->two_factor_method  = 'totp';
            $user->save();

            Log::info('TOTP confirmed and activated', ['user' => $user->email]);

            return response()->json([
                'message'            => 'Google Authenticator setup complete.',
                'two_factor_enabled' => true,
                'two_factor_method'  => 'totp',
            ], 200);

        } catch (\Exception $e) {
            Log::error('TwoFactorController@confirmTotp: ' . $e->getMessage());
            return response()->json(['message' => 'Confirmation failed.'], 500);
        }
    }

    // ─── TOTP Verify — used at login ──────────────────────────────────────
    public function verifyTotp(Request $request)
    {
        $request->validate(['code' => 'required|string|digits:6']);

        try {
            $user      = $request->user();
            $google2fa = new Google2FA();

            if (!$user->totp_secret || !$user->totp_confirmed) {
                return response()->json([
                    'message' => 'Authenticator not set up.',
                ], 400);
            }

            // Lockout check
            if ($user->otp_locked_until &&
                now()->lt(\Carbon\Carbon::parse($user->otp_locked_until))) {
                return response()->json([
                    'message'      => 'Account temporarily locked. Try again later.',
                    'locked_until' => $user->otp_locked_until,
                ], 423);
            }

            $valid = $google2fa->verifyKey($user->totp_secret, $request->code, 1);

            if (!$valid) {
                $attempts = ($user->totp_failed_attempts ?? 0) + 1;
                $user->totp_failed_attempts = $attempts;

                if ($attempts >= 5) {
                    $user->otp_locked_until     = now()->addMinutes(10)->toISOString();
                    $user->totp_failed_attempts = 0;
                    $user->save();

                    return response()->json([
                        'message'      => 'Too many attempts. Try again in 10 minutes.',
                        'locked_until' => $user->otp_locked_until,
                    ], 423);
                }

                $user->save();

                return response()->json([
                    'message'   => 'Invalid code.',
                    'remaining' => 5 - $attempts,
                ], 422);
            }

            // Success — reset counters
            $user->totp_failed_attempts = 0;
            $user->otp_locked_until     = null;
            $user->save();

            Log::info('TOTP verified at login', [
                'user' => $user->email,
                'ip'   => $request->ip(),
            ]);

            return response()->json([
                'message'  => 'OTP verified.',
                'verified' => true,
            ], 200);

        } catch (\Exception $e) {
            Log::error('TwoFactorController@verifyTotp: ' . $e->getMessage());
            return response()->json(['message' => 'Verification failed.'], 500);
        }
    }

    // ─── Remove TOTP — requires password confirmation ─────────────────────
    public function removeTotp(Request $request)
    {
        $request->validate(['password' => 'required|string']);

        try {
            $user = $request->user();

            if (!Hash::check($request->password, $user->password)) {
                return response()->json(['message' => 'Incorrect password.'], 403);
            }

            $user->totp_secret          = null;
            $user->totp_confirmed       = false;
            $user->totp_failed_attempts = 0;
            $user->two_factor_method    = 'email';
            $user->two_factor_enabled   = false;
            $user->save();

            return response()->json([
                'message'            => 'Authenticator removed.',
                'two_factor_enabled' => false,
                'two_factor_method'  => 'email',
            ], 200);

        } catch (\Exception $e) {
            Log::error('TwoFactorController@removeTotp: ' . $e->getMessage());
            return response()->json(['message' => 'Failed to remove authenticator.'], 500);
        }
    }

    // ─── Update 2FA method — email or totp ────────────────────────────────
    public function updateMethod(Request $request)
    {
        $request->validate([
            'method' => 'required|string|in:email,totp',
        ]);

        try {
            $user = $request->user();

            // Cannot switch to TOTP without completing setup first
            if ($request->method === 'totp' && !$user->totp_confirmed) {
                return response()->json([
                    'message' => 'Please complete Google Authenticator setup first via /2fa/totp/setup.',
                ], 422);
            }

            $user->two_factor_method = $request->method;
            $user->save();

            return response()->json([
                'message'           => 'Two-factor method updated.',
                'two_factor_method' => $user->two_factor_method,
            ], 200);

        } catch (\Exception $e) {
            Log::error('TwoFactorController@updateMethod: ' . $e->getMessage());
            return response()->json(['message' => 'Failed to update method.'], 500);
        }
    }

    // ─── Toggle 2FA on/off ────────────────────────────────────────────────
    public function toggle(Request $request)
    {
        try {
            $user    = $request->user();
            $current = (bool) ($user->two_factor_enabled ?? false);

            $user->two_factor_enabled = !$current;

            // Default to email when enabling for the first time
            if ($user->two_factor_enabled && empty($user->two_factor_method)) {
                $user->two_factor_method = 'email';
            }

            // If disabling, clear TOTP data too
            if (!$user->two_factor_enabled) {
                $user->totp_secret          = null;
                $user->totp_confirmed       = false;
                $user->totp_failed_attempts = 0;
                $user->two_factor_method    = 'email';
            }

            $user->save();

            return response()->json([
                'two_factor_enabled' => $user->two_factor_enabled,
                'two_factor_method'  => $user->two_factor_method ?? 'email',
                'message'            => $user->two_factor_enabled
                    ? 'Two-factor authentication enabled.'
                    : 'Two-factor authentication disabled.',
            ], 200);

        } catch (\Exception $e) {
            Log::error('TwoFactorController@toggle: ' . $e->getMessage());
            return response()->json(['message' => 'Failed to update 2FA setting.'], 500);
        }
    }

    // ─── Remember device ──────────────────────────────────────────────────
    public function rememberDevice(Request $request)
    {
        try {
            $user     = $request->user();
            $token    = Str::random(64);
            $tokens   = $user->device_tokens ?? [];
            $tokens[] = ['token' => $token, 'created_at' => now()->toISOString()];

            if (count($tokens) > 5) {
                usort($tokens, fn($a, $b) => $a['created_at'] <=> $b['created_at']);
                $tokens = array_slice($tokens, -5);
            }

            $user->device_tokens = $tokens;
            $user->save();

            return response()->json(['device_token' => $token], 200);

        } catch (\Exception $e) {
            Log::error('TwoFactorController@rememberDevice: ' . $e->getMessage());
            return response()->json(['message' => 'Failed to save device.'], 500);
        }
    }

    // ─── Check device ─────────────────────────────────────────────────────
    public function checkDevice(Request $request)
    {
        $request->validate(['device_token' => 'required|string|size:64']);

        try {
            $user         = $request->user();
            $deviceTokens = $user->device_tokens ?? [];
            $incoming     = $request->device_token;

            $isRecognized = collect($deviceTokens)->contains(
                fn($entry) => isset($entry['token']) && $entry['token'] === $incoming
            );

            return response()->json(['recognized' => $isRecognized], 200);

        } catch (\Exception $e) {
            Log::error('TwoFactorController@checkDevice: ' . $e->getMessage());
            return response()->json(['message' => 'Device check failed.'], 500);
        }
    }

    // ─── Revoke device ────────────────────────────────────────────────────
    public function revokeDevice(Request $request, string $token)
    {
        try {
            $user     = $request->user();
            $tokens   = $user->device_tokens ?? [];
            $filtered = array_values(array_filter(
                $tokens,
                fn($entry) => !isset($entry['token']) || $entry['token'] !== $token
            ));

            if (count($filtered) === count($tokens)) {
                return response()->json(['message' => 'Device token not found.'], 404);
            }

            $user->device_tokens = $filtered;
            $user->save();

            return response()->json(['message' => 'Device removed.'], 200);

        } catch (\Exception $e) {
            Log::error('TwoFactorController@revokeDevice: ' . $e->getMessage());
            return response()->json(['message' => 'Failed to remove device.'], 500);
        }
    }
}