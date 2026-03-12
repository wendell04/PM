<?php

namespace App\Http\Controllers;

    use App\Mail\VerificationCodeMail;
    use App\Models\User;
    use Illuminate\Http\Request;
    use Illuminate\Support\Facades\Hash;
    use Illuminate\Support\Facades\Mail;
    use Illuminate\Support\Str;
    use Illuminate\Validation\Rule;

    class AuthController extends Controller
    {
        // List of known disposable/temporary email domains
        protected $disposableDomains = [
            'tempmail.com', 'throwaway.com', 'guerrillamail.com', 'mailinator.com',
            '10minutemail.com', 'fakeinbox.com', 'trashmail.com', 'temp-mail.org',
            'getnada.com', 'maildrop.cc', 'sharklasers.com', 'grr.la',
            'guerrillamail.info', 'grr.la', 'guerrillamail.biz', 'guerrillamail.de',
            'spam4.me', 'mailnesia.com', 'yopmail.com', 'cool.fr.nf',
            'jetable.org', 'mytrashmail.com', 'discard.email', 'emailondeck.com'
        ];

        public function register(Request $request)
        {
            try {
                // Validate email format and domain
                $request->validate([
                    'firstName'   => 'required|string|min:2',
                    'lastName'    => 'required|string|min:2',
                    'address'     => 'required|string|min:10',
                    'phoneNumber' => 'required|string',
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
                if (in_array($domain, $this->disposableDomains)) {
                    return response()->json([
                        'message' => 'Please use a legitimate email address. Temporary/disposable email services are not allowed.'
                    ], 422);
                }

                // Validate email format more strictly
                if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
                    return response()->json([
                        'message' => 'Please provide a valid email address.'
                    ], 422);
                }

                // Check for common typos in email domains
                $commonDomains = ['gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'icloud.com'];
                if (!in_array($domain, $commonDomains) && !checkdnsrr($domain, 'MX')) {
                    return response()->json([
                        'message' => 'The email domain does not appear to be valid. Please check your email address.'
                    ], 422);
                }

                // Delete any unverified accounts with this email
                User::where('email', $request->email)->where('is_verified', false)->delete();

                $plainCode = str_pad(random_int(0, 999999), 6, '0', STR_PAD_LEFT);
                $hashedCode = hash('sha256', $plainCode);
                $token = Str::random(60);

                $adminEmail = env('ADMIN_EMAIL');

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
                    'role'         => $request->email === $adminEmail ? 'admin' : 'user',
                    'verification_code' => $hashedCode,
                    'verification_code_expires_at' => now()->addMinutes(10)->toDateTimeString(),
                ]);

                try {
                    Mail::to($request->email)->send(new VerificationCodeMail($plainCode, $request->firstName));
                } catch (\Exception $e) {
                    \Log::error('Failed to send verification email: ' . $e->getMessage());
                    // Don't fail registration, but log the error
                    // User can request resend code later
                }

                return response()->json([
                    'message' => 'Registration successful! Please check your email for the verification code.',
                    'token'   => $token,
                    'user'    => $user,
                ], 201);

            } catch (\Illuminate\Validation\ValidationException $e) {
                return response()->json(['errors' => $e->errors()], 422);
            } catch (\Exception $e) {
                \Log::error('Register error: ' . $e->getMessage());
                return response()->json(['error' => $e->getMessage()], 500);
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
                    return response()->json(['message' => 'Invalid email or password'], 401);
                }

                if (!$user->is_verified) {
                    return response()->json(['message' => 'Please verify your email before logging in.'], 403);
                }

                $token = Str::random(60);
                $user->api_token = hash('sha256', $token);
                $user->lastLogin = now()->toDateTimeString();
                $user->save();

                return response()->json([
                    'message' => 'Login successful!',
                    'token'   => $token,
                    'user'    => [
                        'firstName' => $user->firstName,
                        'lastName' => $user->lastName,
                        'email' => $user->email,
                        'phoneNumber' => $user->phoneNumber,
                        'address' => $user->address,
                        'role' => $user->role,
                        'lastLogin' => $user->lastLogin,
                    ],
                ]);

            } catch (\Exception $e) {
                \Log::error('Login error: ' . $e->getMessage());
                return response()->json(['error' => $e->getMessage()], 500);
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
                    return response()->json(['message' => 'User not found.'], 404);
                }

                if ($user->is_verified) {
                    return response()->json(['message' => 'Email already verified'], 400);
                }

                if (now()->gt($user->verification_code_expires_at)) {
                    return response()->json(['message' => 'Verification code has expired. Please request a new code.'], 400);
                }

                if (hash('sha256', $request->code) !== $user->verification_code) {
                    return response()->json(['message' => 'Invalid verification code.'], 400);
                }

                $user->is_verified = true;
                $user->verification_code = null;
                $user->verification_code_expires_at = null;
                $user->save();

                return response()->json(['message' => 'Email verified successfully! You can now log in.']);
            } catch (\Exception $e) {
                \Log::error('Verify error: ' . $e->getMessage());
                return response()->json(['error' => $e->getMessage()], 500);
            }
        }

        public function resend(Request $request) 
        {
            try {
                $request->validate(['email' => 'required|email']);

                $user = User::where('email', $request->email)->first();

                if (!$user) {
                    return response()->json(['message' => 'User not found.'], 404);
                }

                if ($user->is_verified) {
                    return response()->json(['message' => 'Email already verified'], 400);
                }

                $plainCode = str_pad(random_int(0, 999999), 6, '0', STR_PAD_LEFT);
                $hashedCode = hash('sha256', $plainCode);

                $user->verification_code = $hashedCode;
                $user->verification_code_expires_at = now()->addMinutes(10)->toDateTimeString();
                $user->save();

                Mail::to($user->email)->send(new VerificationCodeMail($plainCode, $user->firstName));
                
                return response()->json(['message' => 'Verification code sent successfully!']);
            } catch (\Exception $e) {
                \Log::error('Resend error: ' . $e->getMessage());
                return response()->json(['error' => $e->getMessage()], 500);
            }
        }

        public function forgotPassword(Request $request)
        {
            try {
                $request->validate(['email' => 'required|email']);

                // Only send reset code to verified users (users with existing accounts)
                $user = User::where('email', $request->email)->where('is_verified', true)->first();

                // Always return same message for security (don't reveal if email exists or verification status)
                if (!$user) {
                    return response()->json(['message' => 'A reset code has been sent.']);
                }

                $plainCode = str_pad(random_int(0, 999999), 6, '0', STR_PAD_LEFT);
                $hashedCode = hash('sha256', $plainCode);

                $user->reset_token = $hashedCode;
                $user->reset_token_expires_at = \Carbon\Carbon::now('Asia/Manila')->addMinutes(10)->toDateTimeString();
                $user->save();

                Mail::to($user->email)->send(new \App\Mail\ResetPasswordMail($plainCode, $user->firstName));

                return response()->json(['message' => 'A reset code has been sent']);
            } catch (\Exception $e) {
                \Log::error('ForgotPassword error: ' . $e->getMessage());
                return response()->json(['error' => $e->getMessage()], 500);
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
                    return response()->json(['message' => 'Invalid or expired code.'], 400);
                }

                if (!$user->reset_token || !$user->reset_token_expires_at) {
                    return response()->json(['message' => 'Invalid or expired code.'], 400);
                }

                // Convert expiration time to Asia/Manila timezone for comparison
                $expiresAt = \Carbon\Carbon::parse($user->reset_token_expires_at, 'UTC')->timezone('Asia/Manila');

                if (\Carbon\Carbon::now('Asia/Manila')->gt($expiresAt)) {
                    return response()->json(['message' => 'Code has expired. Please request a new one.'], 400);
                }

                if (hash('sha256', $request->code) !== $user->reset_token) {
                    return response()->json(['message' => 'Invalid or expired code.'], 400);
                }

                return response()->json(['message' => 'Code verified successfully.']);
            } catch (\Illuminate\Validation\ValidationException $e) {
                return response()->json(['errors' => $e->errors()], 422);
            } catch (\Exception $e) {
                \Log::error('VerifyResetCode error: ' . $e->getMessage());
                return response()->json(['error' => $e->getMessage()], 500);
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
                    return response()->json(['message' => 'User not found.'], 404);
                }

                if (!$user->reset_token || !$user->reset_token_expires_at) {
                    return response()->json(['message' => 'No reset request found. Please request a new code'], 400);
                }

                // Convert expiration time to Asia/Manila timezone for comparison
                $expiresAt = \Carbon\Carbon::parse($user->reset_token_expires_at, 'UTC')->timezone('Asia/Manila');
                
                if (\Carbon\Carbon::now('Asia/Manila')->gt($expiresAt)) {
                    return response()->json(['message' => 'Reset code has expired. Please request a new one'], 400);
                }

                if (hash('sha256', $request->code) !== $user->reset_token) {
                    return response()->json(['message' => 'Invalid reset code.'], 400);
                }

                $user->password = Hash::make($request->password);
                $user->reset_token = null;
                $user->reset_token_expires_at = null;
                $user->save();

                return response()->json(['message' => 'Password reset successfully! You can now log in.']);
            } catch (\Illuminate\Validation\ValidationException $e) {
                return response()->json(['errors' => $e->errors()], 422);
            } catch (\Exception $e) {
                \Log::error('ResetPassword error: ' . $e->getMessage());
                return response()->json(['error' => $e->getMessage()], 500);
            }
        }

        public function updateProfile(Request $request) 
        {
            try {
                $token = $request->bearerToken();
                $user = User::where('api_token', hash('sha256', $token))->first();

                if (!$user) {
                    return response()->json(['message' => 'Unauthorized.'], 401);
                }

                $request->validate([
                    'firstName' => 'required|string|min:2',
                    'lastName' => 'required|string|min:2',
                    'email' => 'required|email|unique:users,email,' . $user->id . ',_id',
                    'phoneNumber' => 'required|string',
                    'address' => 'required|string|min:10',
                ]);

                $user->firstName = $request->firstName;
                $user->lastName = $request->lastName;
                $user->email = $request->email;
                $user->phoneNumber = $request->phoneNumber;
                $user->address = $request->address;
                $user->save();

                return response()->json([
                    'message' => 'Profile Updated Successfully.',
                    'user' => [
                        'firstName' => $user->firstName,
                        'lastName' => $user->lastName,
                        'email' => $user->email,
                        'phoneNumber' => $user->phoneNumber,
                        'address' => $user->address,
                        'role' => $user->role,
                        'lastLogin' => $user->lastLogin,
                    ],
                ]);
            } catch (\Illuminate\Validation\ValidationException $e) {
                return response()->json(['errors' => $e->errors()], 422);
            } catch (\Exception $e) {
                \Log::error('UpdateProfile error: ' . $e->getMessage());
                return response()->json(['error' => $e->getMessage()], 500);
            }
        }

        public function updatePassword(Request $request)
        {
            try {
                $token = $request->bearerToken();
                $user = User::where('api_token', hash('sha256', $token))->first();

                if (!$user) {
                    return response()->json(['message' => 'Unauthorized.'], 401);
                }

                $request->validate([
                    'currentPassword' => 'required|string',
                    'password' => 'required|string|min:8|confirmed',
                ]);

                if (!Hash::check($request->currentPassword, $user->password)) {
                    return response()->json(['message' => 'Current password is incorrect.'], 400);
                }

                $user->password = Hash::make($request->password);
                $user->save();

                return response()->json(['message' => 'Password changed successfully.']);
            } catch (\Illuminate\Validation\ValidationException $e) {
                return response()->json(['errors' => $e->errors()], 422);
            } catch (\Exception $e) {
                \Log::error('UpdatePassword error: ' . $e->getMessage());
                return response()->json(['error' => $e->getMessage()], 500);
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
                \Mail::raw(
                    "New Contact Form Submission\n\n" .
                    "Name: {$request->name}\n" .
                    "Email: {$request->email}\n" .
                    "Subject: {$request->subject}\n\n" .
                    "Message:\n{$request->message}",
                    function ($message) use ($request, $adminEmail) {
                        $message->to($adminEmail)
                                ->subject("Contact Form: {$request->subject}")
                                ->from($request->email, $request->name);
                    }
                );

                return response()->json(['message' => 'Message sent successfully! We will get back to you soon.']);
            } catch (\Illuminate\Validation\ValidationException $e) {
                return response()->json(['errors' => $e->errors()], 422);
            } catch (\Exception $e) {
                \Log::error('Contact form error: ' . $e->getMessage());
                return response()->json(['error' => 'Failed to send message. Please try again.'], 500);
            }
        }

        public function logout(Request $request)
        {
            $token = $request->bearerToken();
            if ($token) {
                User::where('api_token', hash('sha256', $token))->update(['api_token' => null]);
            }
            return response()->json(['message' => 'Logged out successfully']);
        }
    }