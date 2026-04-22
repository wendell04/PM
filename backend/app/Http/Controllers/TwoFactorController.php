<?php

namespace App\Http\Controllers;

use App\Mail\TwoFactorMail;
use App\Models\OtpCode;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;

class TwoFactorController extends Controller
{
    public function sendOtp(Request $request)
    {
        try {
            $user = $request->user();

            // Check lockout
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

            // 30-second resend cooldown
            $existing = OtpCode::where('user_id', (string) $user->_id)
                               ->where('used', false)
                               ->latest('created_at')
                               ->first();

            if ($existing) {
                $secondsSinceSent = max(0, (int) now()->diffInSeconds($existing->created_at, true));
                if ($secondsSinceSent < 2) {
                    // Duplicate mount call (React Strict Mode) — OTP already sent, return silently
                    return response()->json(['message' => 'OTP sent.'], 200);
                }
                if ($secondsSinceSent < 30) {
                    return response()->json([
                        'message'     => 'Please wait before requesting a new code.',
                        'retry_after' => max(0, 30 - $secondsSinceSent),
                    ], 429);
                }
            }

            // Delete any existing unused OTP for this user
            OtpCode::where('user_id', (string) $user->_id)
                   ->where('used', false)
                   ->delete();

            // Generate 6-digit plain code
            $plainCode = (string) random_int(100000, 999999);

            // Store hashed
            OtpCode::create([
                'user_id'    => (string) $user->_id,
                'code_hash'  => Hash::make($plainCode),
                'expires_at' => now()->addMinutes(5),
                'attempts'   => 0,
                'used'       => false,
            ]);

            // Route OTP email: admins/owners → admin inbox,
            // customers → their own email
            $mailRecipient = in_array($user->role, ['admin', 'owner'])
                ? (env('ADMIN_NOTIFICATION_EMAIL') ?: config('mail.from.address'))
                : $user->email;

            // Capture variables needed inside after-response closure
            $otpToSend = $plainCode;
            $nameToUse = $user->firstName ?? 'User';

            // Return 200 immediately, send mail after response
            app()->terminating(function () use (
                $mailRecipient, $otpToSend, $nameToUse
            ) {
                try {
                    Mail::to($mailRecipient)->send(
                        new TwoFactorMail(
                            otpCode:       $otpToSend,
                            userName:      $nameToUse,
                            expiryMinutes: 5
                        )
                    );
                } catch (\Exception $e) {
                    Log::error('TwoFactor mail failed: ' . $e->getMessage());
                }
            });

            return response()->json(['message' => 'OTP sent.'], 200);

        } catch (\Exception $e) {
            Log::error('TwoFactorController@sendOtp: ' . $e->getMessage());
            return response()->json(['message' => 'Failed to send OTP.'], 500);
        }
    }

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
                return response()->json(['message' => 'Invalid code.'], 422);
            }

            // Correct code
            $otp->used = true;
            $otp->save();

            Log::info('2FA verified', ['user' => $user->email, 'ip' => $request->ip()]);

            return response()->json(['message' => 'OTP verified.', 'verified' => true], 200);

        } catch (\Exception $e) {
            Log::error('TwoFactorController@verifyOtp: ' . $e->getMessage());
            return response()->json(['message' => 'Verification failed.'], 500);
        }
    }

    public function rememberDevice(Request $request)
    {
        try {
            $user  = $request->user();
            $token = Str::random(64);

            $tokens   = $user->device_tokens ?? [];
            $tokens[] = [
                'token'      => $token,
                'created_at' => now()->toISOString(),
            ];

            // Keep only the 5 most recent device tokens
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

    public function checkDevice(Request $request)
    {
        $request->validate([
            'device_token' => 'required|string|size:64',
        ]);

        try {
            $user = $request->user();
            if (!$user) {
                return response()->json(['message' => 'Unauthenticated.'], 401);
            }
            $deviceTokens = $user->device_tokens ?? [];
            $incoming     = $request->device_token;

            $isRecognized = collect($deviceTokens)->contains(
                fn($entry) => isset($entry['token']) && $entry['token'] === $incoming
            );

            return response()->json([
                'recognized' => $isRecognized,
            ], 200);

        } catch (\Exception $e) {
            Log::error('TwoFactorController@checkDevice: ' . $e->getMessage());
            return response()->json(['message' => 'Device check failed.'], 500);
        }
    }

    public function toggle(Request $request)
    {
        try {
            $user = $request->user();
            if (!$user) {
                return response()->json(['message' => 'Unauthenticated.'], 401);
            }

            $current = (bool) ($user->two_factor_enabled ?? false);
            $user->two_factor_enabled = !$current;
            $user->save();

            return response()->json([
                'two_factor_enabled' => $user->two_factor_enabled,
                'message' => $user->two_factor_enabled
                    ? 'Two-factor authentication enabled.'
                    : 'Two-factor authentication disabled.',
            ], 200);
        } catch (\Exception $e) {
            Log::error('TwoFactorController@toggle: ' . $e->getMessage());
            return response()->json(['message' => 'Failed to update 2FA setting.'], 500);
        }
    }

    public function revokeDevice(Request $request, string $token)
    {
        try {
            $user = $request->user();
            $tokens = $user->device_tokens ?? [];

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
