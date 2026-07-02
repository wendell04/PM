<?php

namespace App\Http\Controllers;

use App\Mail\ContactFormMail;
use App\Mail\VerificationCodeMail;
use App\Mail\WelcomeMail;
use App\Models\User;
use App\Models\Conversation;
use App\Models\Message;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Illuminate\Validation\Rules\Password;

class AuthController extends Controller
{
    // List of known disposable/temporary email domains
    public function register(Request $request)
    {
        try {
            // Validate email format and domain
            $request->validate([
                'firstName'   => 'required|string|min:2',
                'middleInitial' => 'nullable|string|max:2',
                'lastName'    => 'required|string|min:2',
                'address'     => 'nullable|string',
                'phoneNumber' => ['required', 'string', 'regex:/^(09|\+639)\d{9}$/'],
                'email'       => ['required', 'email'],
                'password'    => ['required', 'confirmed', Password::min(8)->mixedCase()->numbers()->symbols()],
            ], [
                'firstName.required'  => 'First name is required.',
                'firstName.min'       => 'First name must be at least 2 characters.',
                'lastName.required'   => 'Last name is required.',
                'lastName.min'        => 'Last name must be at least 2 characters.',
                'phoneNumber.required'=> 'Phone number is required.',
                'phoneNumber.regex'   => 'Phone number must be a valid PH number (e.g. 09171234567 or +639171234567).',
                'email.required'      => 'Email address is required.',
                'email.email'         => 'Please enter a valid email address.',
                'password.required'   => 'Password is required.',
                'password.confirmed'  => 'Passwords do not match.',
            ]);

            // Manual uniqueness checks for MongoDB
            $emailExists = User::where('email', $request->email)
                ->where('is_verified', true)
                ->exists();

            if ($emailExists) {
                throw ValidationException::withMessages([
                    'email' => ['This email is already registered. Please log in or use a different email.'],
                ]);
            }

            $phoneExists = User::where('phoneNumber', $request->phoneNumber)
                ->where('is_verified', true)
                ->exists();

            if ($phoneExists) {
                throw ValidationException::withMessages([
                    'phoneNumber' => ['This phone number is already registered. Please log in or use a different number.'],
                ]);
            }

            // Additional email validation
            $email = strtolower(trim($request->email));
            
            // Check if email is from a disposable domain
            $domain = substr(strrchr($email, "@"), 1);
            if (in_array($domain, config('disposable_domains.domains'))) {
                return $this->errorResponse('Please use a legitimate email address. Temporary/disposable email services are not allowed.', 422);
            }

            // Validate email format more strictly
            if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
                return $this->errorResponse('Please provide a valid email address.', 422);
            }

            // Domain whitelist and DNS MX lookup removed — they blocked legitimate
            // institutional/subdomain emails (e.g. novaliches.sti.edu.ph).
            // Disposable domain check above is sufficient protection.

            // Delete any unverified accounts with this email
            User::where('email', $request->email)->where('is_verified', false)->delete();

            $plainCode = str_pad(random_int(0, 999999), 6, '0', STR_PAD_LEFT);
            $hashedCode = Hash::make($plainCode);

            $user = User::create([
                'firstName'     => $request->firstName,
                'middleInitial' => $request->middleInitial,
                'lastName'      => $request->lastName,
                'address'       => $request->address,
                'phoneNumber'   => $request->phoneNumber,
                'email'         => $request->email,
                'password'      => Hash::make($request->password),
                'is_verified'   => false,
                'role'          => 'customer', // All new users are customers by default
                'verification_code' => $hashedCode,
                'verification_code_expires_at' => now()->addMinutes(10)->toDateTimeString(),
            ]);

            try {
                Mail::to($request->email)->send(new VerificationCodeMail($plainCode, $request->firstName));
            } catch (\Exception $e) {
                Log::error('Failed to send verification email: ' . $e->getMessage());
                // Don't fail registration, but log the error
                // User can request resend code later
            }

            return $this->successResponse(
                'Registration successful! Please check your email for the verification code.',
                [
                    'user' => [
                        'firstName'   => $user->firstName,
                        'middleInitial' => $user->middleInitial,
                        'lastName'    => $user->lastName,
                        'email'       => $user->email,
                        'phoneNumber' => $user->phoneNumber,
                        'address'     => $user->address,
                        'role'        => $user->role,
                        'avatar'      => $user->avatar ?? null,
                    ],
                ],
                201
            );

        } catch (\Illuminate\Validation\ValidationException $e) {
            return $this->validationErrorResponse($e);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'An unexpected error occurred during registration.');
        }
    }

    private const LOGIN_MAX_ATTEMPTS = 3;
    private const LOGIN_LOCKOUT_MINUTES = 15;
    private const DEVICE_TOKEN_MAX_AGE_DAYS = 90;

    public function login(Request $request)
    {
        try {
            $request->validate([
                'email'        => 'required|email',
                'password'     => 'required|string',
                'device_token' => 'nullable|string|size:64',
            ]);

            $ip = $request->ip();
            $user = User::where('email', $request->email)->first();

            if (!$user) {
                // Constant-time: run a dummy hash so response timing doesn't reveal whether the email
                // exists (blocks user enumeration via timing). Message is already generic.
                Hash::check($request->password, '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi');
                Log::warning('Login failed: user not found', ['email' => $request->email, 'ip' => $ip]);
                return $this->errorResponse('The email or password you entered is incorrect. Please try again.', 401);
            }

            if (
                $user->login_locked_until &&
                now()->lt($user->login_locked_until)
            ) {
                $minutesLeft = (int) ceil(now()->diffInSeconds($user->login_locked_until) / 60);
                Log::warning('Login blocked: account locked', ['email' => $user->email, 'ip' => $ip]);
                return $this->errorResponse(
                    "Account temporarily locked. Try again in {$minutesLeft} minute(s).",
                    429
                );
            }

            if (!Hash::check($request->password, $user->password)) {
                $attempts = ($user->failed_login_attempts ?? 0) + 1;
                $user->failed_login_attempts = $attempts;

                if ($attempts >= self::LOGIN_MAX_ATTEMPTS) {
                    $user->login_locked_until = now()->addMinutes(self::LOGIN_LOCKOUT_MINUTES);
                    $user->failed_login_attempts = 0;
                    Log::warning('Login failed: account locked after max attempts', ['email' => $user->email, 'ip' => $ip]);
                } else {
                    Log::warning('Login failed: wrong password', [
                        'email'    => $user->email,
                        'ip'       => $ip,
                        'attempts' => $attempts,
                    ]);
                }

                $user->save();
                return $this->errorResponse('The email or password you entered is incorrect. Please try again.', 401);
            }

            if (!$user->is_verified) {
                return $this->errorResponse('Please verify your email before logging in.', 403);
            }

            $user->failed_login_attempts = 0;
            $user->login_locked_until    = null;

            // Decide whether this login still needs a 2FA challenge BEFORE minting the token, so a
            // pending login receives only a limited, short-lived token — never a full session.
            $requires2fa  = false;
            $twoFaEnabled = (bool) ($user->two_factor_enabled ?? false);

            if ($twoFaEnabled) {
                $deviceToken  = $request->input('device_token');
                $cutoff       = now()->subDays(self::DEVICE_TOKEN_MAX_AGE_DAYS);
                $deviceTokens = collect($user->device_tokens ?? [])
                    ->filter(fn($entry) => isset($entry['created_at']) &&
                        \Carbon\Carbon::parse($entry['created_at'])->gt($cutoff))
                    ->values()
                    ->all();

                if (!$deviceToken) {
                    $requires2fa = true;
                } else {
                    $isRecognized = collect($deviceTokens)->contains(
                        fn($entry) => isset($entry['token']) && $entry['token'] === $deviceToken
                    );
                    $requires2fa = !$isRecognized;
                }

                if ($deviceTokens !== ($user->device_tokens ?? [])) {
                    $user->device_tokens = $deviceTokens;
                }
            }

            $deviceName = $this->parseDeviceName($request->userAgent() ?? 'Unknown Device');

            if ($requires2fa) {
                // 2FA still pending: issue a LIMITED token that can ONLY reach the 2FA-completion
                // endpoints (enforced by EnsureTwoFactorComplete). The real full-access token is
                // minted by TwoFactorController after the code is verified — so the second factor
                // is enforced server-side, not merely by the frontend redirect.
                $sanctumToken = $user->createToken($deviceName, ['2fa-pending'], now()->addMinutes(15))->plainTextToken;
            } else {
                // Session policy by role (overrides the global SANCTUM_TOKEN_EXPIRATION so the two
                // don't share one 24h lifetime): staff/admin get SHORT-lived tokens (high-value
                // access); customers get long, convenient sessions, extended by "remember me".
                $isStaff   = ($user->role ?? 'customer') !== 'customer';
                $expiresAt = $isStaff
                    ? now()->addHours(12)
                    : ($request->boolean('rememberMe') ? now()->addDays(90) : now()->addDays(30));
                $sanctumToken = $user->createToken($deviceName, ['*'], $expiresAt)->plainTextToken;
            }

            $user->lastLogin     = now()->toDateTimeString();
            $user->last_login_at = now();
            $user->save();

            Log::info('Login successful', ['email' => $user->email, 'ip' => $ip, 'requires_2fa' => $requires2fa]);

            return $this->successResponse(
                'Login successful!',
                [
                    'token'        => $sanctumToken,
                    'requires_2fa' => $requires2fa,
                    'user' => [
                        'id'                 => (string)$user->_id,
                        'firstName'          => $user->firstName,
                        'lastName'           => $user->lastName,
                        'email'              => $user->email,
                        'phoneNumber'        => $user->phoneNumber,
                        'address'            => $user->address,
                        'role'               => $user->role,
                        'lastLogin'          => $user->lastLogin,
                        'avatar'             => $user->avatar,
                        'two_factor_enabled' => (bool) ($user->two_factor_enabled ?? false),
                    'two_factor_method'  => $user->two_factor_method ?? 'email',
                    'totp_confirmed'     => (bool) ($user->totp_confirmed ?? false),
                    ],
                ]
            );

        } catch (\Illuminate\Validation\ValidationException $e) {
            return $this->validationErrorResponse($e);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'An unexpected error occurred during login.');
        }
    }

    public function verify(Request $request)
    {
        try {
            $request->validate([
                'email' => 'required|email',
                'code'  => 'required|string|size:6',
            ]);

            $user = User::where('email', $request->email)->first();

            if (!$user) {
                return $this->errorResponse('No account found with this email address.', 400);
            }

            if ($user->is_verified) {
                return $this->errorResponse('Email already verified.', 400);
            }

            if (now()->gt($user->verification_code_expires_at)) {
                return $this->errorResponse('Verification code has expired. Please request a new code.', 400);
            }

            // Attempt limiting: max 5 attempts before code is invalidated
            $attempts = (int) ($user->verification_attempts ?? 0) + 1;
            if ($attempts > 5) {
                $user->verification_code = null;
                $user->verification_code_expires_at = null;
                $user->verification_attempts = 0;
                $user->save();
                return $this->errorResponse(
                    'Too many attempts. Please request a new verification code.',
                    429
                );
            }
            $user->verification_attempts = $attempts;
            $user->save();

            if (!Hash::check($request->code, $user->verification_code)) {
                return $this->errorResponse('Invalid verification code.', 400);
            }

            $user->is_verified = true;
            $user->verification_code = null;
            $user->verification_code_expires_at = null;
            $user->verification_attempts = 0;

            // Create default Address Book entry from registration address
            // so the checkout page has an address to use immediately.
            if (empty($user->addresses) && !empty($user->address)) {
                $user->addresses = [[
                    'id'           => Str::uuid()->toString(),
                    'label'        => 'Home',
                    'house_number' => '',
                    'street'       => $user->address,
                    'subdivision'  => '',
                    'barangay'     => '',
                    'city'         => '',
                    'province'     => '',
                    'zip'          => '',
                    'phone'        => $user->phoneNumber ?? '',
                    'is_default'   => true,
                ]];
            }

            $user->save();

            // Send welcome email
            try {
                Mail::to($user->email)->send(new WelcomeMail($user->firstName));
            } catch (\Exception $e) {
                Log::error('AuthController @verify: Failed to send welcome email', [
                    'email' => $user->email,
                    'error' => $e->getMessage(),
                ]);
            }

            return $this->successResponse('Email verified successfully! You can now log in.');
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'An unexpected error occurred during email verification.');
        }
    }

    public function resend(Request $request)
    {
        try {
            $request->validate(['email' => 'required|email']);

            $user = User::where('email', $request->email)->first();

            if (!$user) {
                return $this->successResponse('If an account with that email exists, a new verification code has been sent.');
            }

            if ($user->is_verified) {
                return $this->errorResponse('Email already verified.', 400);
            }

            // Per-user resend cooldown: 60 seconds minimum between requests
            if ($user->verification_code_expires_at) {
                $lastSent = \Carbon\Carbon::parse($user->verification_code_expires_at)
                                ->subMinutes(10); // code_expires_at = sent_at + 10 min
                if (\Carbon\Carbon::now()->diffInSeconds($lastSent, false) < 60) {
                    return $this->errorResponse(
                        'Please wait before requesting another code.',
                        429
                    );
                }
            }

            $plainCode = str_pad(random_int(0, 999999), 6, '0', STR_PAD_LEFT);
            $hashedCode = Hash::make($plainCode);

            $user->verification_code = $hashedCode;
            $user->verification_code_expires_at = now()->addMinutes(10)->toDateTimeString();
            $user->save();

            Mail::to($user->email)->send(new VerificationCodeMail($plainCode, $user->firstName));
            
            return $this->successResponse('Verification code sent successfully!');
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'An unexpected error occurred.');
        }
    }

    public function forgotPassword(Request $request)
    {
        try {
            $request->validate(['email' => 'required|email']);

            // Only send reset link to verified users (users with existing accounts)
            $user = User::where('email', $request->email)->where('is_verified', true)->first();

            // Always return same message for security (don't reveal if email exists or verification status)
            if (!$user) {
                return $this->successResponse('A reset link has been sent.');
            }

            // Generate a link token (separate from the 6-digit verification code)
            $plainToken = Str::random(60);
            $hashedToken = hash('sha256', $plainToken);

            $user->reset_token = $hashedToken;
            $user->reset_token_expires_at = \Carbon\Carbon::now('Asia/Manila')->addMinutes(30)->toDateTimeString();
            // Clear any previous reset code
            $user->reset_code = null;
            $user->reset_code_expires_at = null;
            $user->save();

            // Build the reset URL (opens landing page, not storefront)
            $frontendUrl = env('FRONTEND_URL', 'http://localhost:3000');
            $resetUrl = "{$frontendUrl}/?reset_token={$plainToken}&email=" . urlencode($user->email);

            try {
                Mail::to($user->email)->send(new \App\Mail\PasswordResetLinkMail($resetUrl, $user->firstName));
            } catch (\Exception $mailError) {
                Log::error('AuthController@forgotPassword: Failed to send reset email', [
                    'email' => $user->email,
                    'error' => $mailError->getMessage(),
                ]);
            }

            $response = ['message' => 'A reset link has been sent.'];
            if (app()->environment('local')) {
                $response['debug_reset_url'] = $resetUrl;
            }
            return $this->successResponse('A reset link has been sent.', $response);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'An unexpected error occurred.');
        }
    }

    public function verifyResetToken(Request $request)
    {
        try {
            $request->validate([
                'email' => 'required|email',
                'token' => 'required|string|min:20',
            ]);

            $user = User::where('email', $request->email)->where('is_verified', true)->first();
            if (!$user || !$user->reset_token || !$user->reset_token_expires_at) {
                return $this->errorResponse('Invalid or expired link.', 400);
            }

            $expiresAt = \Carbon\Carbon::parse($user->reset_token_expires_at, 'UTC')->timezone('Asia/Manila');
            if (\Carbon\Carbon::now('Asia/Manila')->gt($expiresAt)) {
                return $this->errorResponse('Invalid or expired link.', 400);
            }

            if (hash('sha256', $request->token) !== $user->reset_token) {
                return $this->errorResponse('Invalid or expired link.', 400);
            }

            return $this->successResponse('Link verified.');
        } catch (\Illuminate\Validation\ValidationException $e) {
            return $this->validationErrorResponse($e);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'An unexpected error occurred.');
        }
    }

    public function verifyResetCode(Request $request)
    {
        try {
            $request->validate([
                'email' => 'required|email',
                'code' => 'required|string|size:6',
            ]);

            $user = User::where('email', $request->email)->first();

            if (!$user) {
                return $this->errorResponse('Invalid or expired code.', 400);
            }

            if (!$user->reset_code || !$user->reset_code_expires_at) {
                return $this->errorResponse('Invalid or expired code.', 400);
            }

            // Convert expiration time to Asia/Manila timezone for comparison
            $expiresAt = \Carbon\Carbon::parse($user->reset_code_expires_at, 'UTC')->timezone('Asia/Manila');

            if (\Carbon\Carbon::now('Asia/Manila')->gt($expiresAt)) {
                return $this->errorResponse('Code has expired. Please request a new one.', 400);
            }

            if (!Hash::check($request->code, $user->reset_code)) {
                return $this->errorResponse('Invalid or expired code.', 400);
            }

            return $this->successResponse('Code verified successfully.');
        } catch (\Illuminate\Validation\ValidationException $e) {
            return $this->validationErrorResponse($e);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'An unexpected error occurred.');
        }
    }

    public function sendResetCode(Request $request)
    {
        try {
            $request->validate([
                'email' => 'required|email',
                'token' => 'required|string|min:20',
            ]);

            $user = User::where('email', $request->email)->where('is_verified', true)->first();

            if (!$user) {
                return $this->successResponse('A reset code has been sent.');
            }

            if (!$user->reset_token || !$user->reset_token_expires_at) {
                return $this->errorResponse('Invalid or expired link.', 400);
            }

            $expiresAt = \Carbon\Carbon::parse($user->reset_token_expires_at, 'UTC')->timezone('Asia/Manila');
            if (\Carbon\Carbon::now('Asia/Manila')->gt($expiresAt)) {
                return $this->errorResponse('Invalid or expired link.', 400);
            }

            if (hash('sha256', $request->token) !== $user->reset_token) {
                return $this->errorResponse('Invalid or expired link.', 400);
            }

            // Generate 6-digit code
            $plainCode = str_pad(random_int(0, 999999), 6, '0', STR_PAD_LEFT);
            $hashedCode = Hash::make($plainCode);

            $user->reset_code = $hashedCode;
            $user->reset_code_expires_at = \Carbon\Carbon::now('Asia/Manila')->addMinutes(10)->toDateTimeString();
            $user->save();

            try {
                Mail::to($user->email)->send(new \App\Mail\ResetPasswordMail($plainCode, $user->firstName));
            } catch (\Exception $mailError) {
                Log::error('AuthController@sendResetCode: Failed to send reset code email', [
                    'email' => $user->email,
                    'error' => $mailError->getMessage(),
                ]);
            }

            $response = ['message' => 'A reset code has been sent.'];
            if (app()->environment('local')) {
                $response['debug_code'] = $plainCode;
            }
            return $this->successResponse('A reset code has been sent.', $response);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'An unexpected error occurred.');
        }
    }

    public function resetPassword(Request $request)
    {
        try {
            $request->validate([
                'email' => 'required|email',
                'code' => 'required|string|size:6',
                'password' => ['required', 'confirmed', Password::min(8)->mixedCase()->numbers()->symbols()],
            ]);

            $user = User::where('email', $request->email)->first();

            if (!$user) {
                return $this->errorResponse('Invalid or expired reset code. Please request a new one.', 400);
            }

            if (!$user->reset_code || !$user->reset_code_expires_at) {
                return $this->errorResponse('No reset request found. Please request a new code.', 400);
            }

            // Convert expiration time to Asia/Manila timezone for comparison
            $expiresAt = \Carbon\Carbon::parse($user->reset_code_expires_at, 'UTC')->timezone('Asia/Manila');

            if (\Carbon\Carbon::now('Asia/Manila')->gt($expiresAt)) {
                return $this->errorResponse('Reset code has expired. Please request a new one.', 400);
            }

            if (!Hash::check($request->code, $user->reset_code)) {
                return $this->errorResponse('Invalid reset code.', 400);
            }

            $user->password = Hash::make($request->password);
            $user->reset_code = null;
            $user->reset_code_expires_at = null;
            $user->reset_token = null;
            $user->reset_token_expires_at = null;
            $user->save();

            return $this->successResponse('Password reset successfully! You can now log in.');
        } catch (\Illuminate\Validation\ValidationException $e) {
            return $this->validationErrorResponse($e);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'An unexpected error occurred.');
        }
    }

    public function contact(Request $request)
    {
        try {
            $request->validate([
                'name'    => 'required|string|min:2|max:120',
                'email'   => 'required|email|max:255',
                'subject' => 'required|string|max:200',
                'message' => 'required|string|max:5000',
            ]);

            $adminEmail = env('ADMIN_EMAIL', 'personalizemeprints@gmail.com');

            $name    = htmlspecialchars(strip_tags(trim($request->name)),    ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
            $subject = str_replace(["\r", "\n", "\0"], '', strip_tags(trim($request->subject)));
            $messageText = htmlspecialchars(strip_tags(trim($request->message)), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');

            // ── CHAT INTEGRATION ──
            // Find existing user by email
            $sender = User::where('email', $request->email)->first();
            $admin  = User::whereIn('role', ['admin', 'owner'])->first();

            if ($admin) {
                $participants = [$admin->_id];
                if ($sender) {
                    $participants[] = $sender->_id;
                }
                sort($participants);

                // Find or create conversation
                $conversation = Conversation::where('participants', $participants)->first();
                if (!$conversation) {
                    $conversation = Conversation::create([
                        'participants' => $participants,
                        'subject'      => $subject,
                        'last_message_at' => now(),
                        'is_active'    => true
                    ]);
                }

                $message = Message::create([
                    'conversation_id' => $conversation->_id,
                    'sender_id'       => $sender ? $sender->_id : 'guest',
                    'sender_name'     => $name,
                    'sender_email'    => $request->email,
                    'body'            => "Subject: {$subject}\n\n{$messageText}",
                    'type'            => 'text',
                    'is_read'         => false,
                ]);

                $conversation->update([
                    'last_message' => $messageText,
                    'last_message_at' => now()
                ]);

                // Broadcast if Reverb is running
                try {
                    broadcast(new \App\Events\MessageSent($message))->toOthers();
                } catch (\Exception $e) {
                    Log::warning('Broadcast failed for contact form chat: ' . $e->getMessage());
                }
            }

            Mail::to($adminEmail)->send(new ContactFormMail($name, $request->email, $subject, $messageText));

            return $this->successResponse('Message sent successfully! We will get back to you soon.');
        } catch (\Illuminate\Validation\ValidationException $e) {
            return $this->validationErrorResponse($e);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'Failed to send message. Please try again.');
        }
    }

    public function logout(Request $request)
    {
        $user = $request->user();
        if ($user) {
            $user->currentAccessToken()->delete();
        }
        return $this->successResponse('Logged out successfully.');
    }

    private function parseDeviceName(string $userAgent): string
    {
        // Detect browser
        $browser = 'Browser';
        if (str_contains($userAgent, 'Edg/'))         $browser = 'Edge';
        elseif (str_contains($userAgent, 'OPR/'))     $browser = 'Opera';
        elseif (str_contains($userAgent, 'Chrome/'))  $browser = 'Chrome';
        elseif (str_contains($userAgent, 'Firefox/')) $browser = 'Firefox';
        elseif (str_contains($userAgent, 'Safari/') && !str_contains($userAgent, 'Chrome/')) $browser = 'Safari';

        // Detect OS
        $os = 'Unknown OS';
        if (str_contains($userAgent, 'Windows NT'))   $os = 'Windows';
        elseif (str_contains($userAgent, 'Macintosh')) $os = 'Mac';
        elseif (str_contains($userAgent, 'iPhone'))   $os = 'iPhone';
        elseif (str_contains($userAgent, 'iPad'))     $os = 'iPad';
        elseif (str_contains($userAgent, 'Android'))  $os = 'Android';
        elseif (str_contains($userAgent, 'Linux'))    $os = 'Linux';

        return "{$browser} on {$os}";
    }

    /**
     * POST /api/unlock-request
     * Customer submits an unlock request (public, email-only).
     */
    public function unlockRequest(Request $request)
    {
        try {
            $request->validate(['email' => 'required|email']);

            $user = User::where('email', $request->email)->where('role', 'customer')->first();

            if (!$user) {
                // Return success to avoid user enumeration
                return $this->successResponse('If your account exists and is locked, your request has been submitted.');
            }

            if (!$user->login_locked_until || now()->gte($user->login_locked_until)) {
                return $this->errorResponse('Your account is not currently locked.', 400);
            }

            $user->unlock_requested_at = now();
            $user->save();

            return $this->successResponse('Unlock request submitted. An administrator will review it shortly.');
        } catch (\Illuminate\Validation\ValidationException $e) {
            return $this->validationErrorResponse($e);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'Failed to submit unlock request.');
        }
    }
}