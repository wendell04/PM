<?php

namespace App\Http\Controllers;

use App\Mail\ContactFormMail;
use App\Mail\VerificationCodeMail;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

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
                'address'     => 'required|string|min:10',
                'phoneNumber' => ['required', 'string', 'regex:/^(09|\+639)\d{9}$/'],
                'email'       => [
                    'required', 'email',
                    Rule::unique('users', 'email')->where(fn($q) => $q->where('is_verified', true)),
                ],
                'password'    => 'required|string|min:8|confirmed',
            ]);

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

            // Check for common typos in email domains
            $commonDomains = ['gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'icloud.com'];
            if (!in_array($domain, $commonDomains) && !checkdnsrr($domain, 'MX')) {
                return $this->errorResponse('The email domain does not appear to be valid. Please check your email address.', 422);
            }

            // Delete any unverified accounts with this email
            User::where('email', $request->email)->where('is_verified', false)->delete();

            $plainCode = str_pad(random_int(0, 999999), 6, '0', STR_PAD_LEFT);
            $hashedCode = hash('sha256', $plainCode);
            $token = Str::random(60);

            $user = User::create([
                'firstName'     => $request->firstName,
                'middleInitial' => $request->middleInitial,
                'lastName'      => $request->lastName,
                'address'       => $request->address,
                'phoneNumber'   => $request->phoneNumber,
                'email'         => $request->email,
                'password'      => Hash::make($request->password),
                'is_verified'   => false,
                'api_token'     => hash('sha256', $token),
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
                    'token' => $token,
                    'user' => [
                        'firstName' => $user->firstName,
                        'lastName' => $user->lastName,
                        'email' => $user->email,
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

    public function login(Request $request)
    {
        try {
            $request->validate([
                'email'    => 'required|email',
                'password' => 'required|string',
            ]);

            $user = User::where('email', $request->email)->first();

            if (!$user || !Hash::check($request->password, $user->password)) {
                return $this->errorResponse('Invalid credentials.', 401);
            }

            if (!$user->is_verified) {
                return $this->errorResponse('Please verify your email before logging in.', 403);
            }

            $token = Str::random(60);
            $user->api_token = hash('sha256', $token);
            $user->lastLogin = now()->toDateTimeString();
            $user->save();

            return $this->successResponse(
                'Login successful!',
                [
                    'token' => $token,
                    'user' => [
                        'firstName' => $user->firstName,
                        'lastName' => $user->lastName,
                        'email' => $user->email,
                        'phoneNumber' => $user->phoneNumber,
                        'address' => $user->address,
                        'role' => $user->role,
                        'lastLogin' => $user->lastLogin,
                    ],
                ]
            );

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
                return $this->errorResponse('Invalid request.', 400);
            }

            if ($user->is_verified) {
                return $this->errorResponse('Email already verified.', 400);
            }

            if (now()->gt($user->verification_code_expires_at)) {
                return $this->errorResponse('Verification code has expired. Please request a new code.', 400);
            }

            if (hash('sha256', $request->code) !== $user->verification_code) {
                return $this->errorResponse('Invalid verification code.', 400);
            }

            $user->is_verified = true;
            $user->verification_code = null;
            $user->verification_code_expires_at = null;
            $user->save();

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

            $plainCode = str_pad(random_int(0, 999999), 6, '0', STR_PAD_LEFT);
            $hashedCode = hash('sha256', $plainCode);

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

            if (hash('sha256', $request->code) !== $user->reset_code) {
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
            $hashedCode = hash('sha256', $plainCode);

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
                'password' => 'required|string|min:8|confirmed',
            ]);

            $user = User::where('email', $request->email)->first();

            if (!$user) {
                return $this->notFoundResponse('User');
            }

            if (!$user->reset_code || !$user->reset_code_expires_at) {
                return $this->errorResponse('No reset request found. Please request a new code.', 400);
            }

            // Convert expiration time to Asia/Manila timezone for comparison
            $expiresAt = \Carbon\Carbon::parse($user->reset_code_expires_at, 'UTC')->timezone('Asia/Manila');

            if (\Carbon\Carbon::now('Asia/Manila')->gt($expiresAt)) {
                return $this->errorResponse('Reset code has expired. Please request a new one.', 400);
            }

            if (hash('sha256', $request->code) !== $user->reset_code) {
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
                'name' => 'required|string|min:2',
                'email' => 'required|email',
                'subject' => 'required|string',
                'message' => 'required|string',
            ]);

            $adminEmail = env('ADMIN_EMAIL', 'personalizemeprints@gmail.com');

            // Send email to admin
            Mail::to($adminEmail)->send(new ContactFormMail($request->name, $request->email, $request->subject, $request->message));

            return $this->successResponse('Message sent successfully! We will get back to you soon.');
        } catch (\Illuminate\Validation\ValidationException $e) {
            return $this->validationErrorResponse($e);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'Failed to send message. Please try again.');
        }
    }

    public function logout(Request $request)
    {
        $token = $request->bearerToken();
        if ($token) {
            User::where('api_token', hash('sha256', $token))->update(['api_token' => null]);
        }
        return $this->successResponse('Logged out successfully.');
    }
}