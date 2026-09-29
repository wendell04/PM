<?php

namespace App\Http\Controllers;

use App\Models\User;
use App\Models\Order;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Password;

class ProfileController extends Controller
{
    public function update(Request $request)
    {
        try {
            $user = $request->user();

            if (!$user) {
                return $this->unauthorizedResponse();
            }

            $request->validate([
                'firstName' => 'required|string|min:2|max:60',
                'lastName' => 'required|string|min:2|max:60',
                'email' => ['required', 'email', Rule::unique('users')->ignore($user->id, '_id')],
                'phoneNumber' => ['required', 'string', 'regex:/^(\+?63|0)9\d{9}$/'],
                'address' => 'required|string|min:3|max:2000',
            ]);

            // The email only moves through Change email (password + a code sent to the new address).
            // Taking it here let anyone holding a signed-in session point the account at their own
            // inbox and then reset the password: the classic takeover, with no way back for the owner.
            if (strtolower((string) $user->email) !== strtolower(trim((string) $request->email))) {
                return response()->json(['success' => false, 'message' => 'Use Change email to change your email address.',
                    'errors' => ['email' => ['Use Change email to change your email address.']]], 422);
            }

            // The rule above compares capitals exactly; this catches "Name@gmail.com" vs "name@gmail.com".
            $taken = User::emailIs($request->email)->where('_id', '!=', $user->_id)->exists();
            if ($taken) {
                return response()->json(['success' => false, 'message' => 'The email has already been taken.', 'errors' => ['email' => ['The email has already been taken.']]], 422);
            }

            $san = fn(string $v) => htmlspecialchars(strip_tags(trim($v)), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');

            $changedFields = [];
            if (strtolower((string) $user->email) !== strtolower(trim((string) $request->email))) $changedFields[] = 'email';
            if ($user->phoneNumber !== $request->phoneNumber) $changedFields[] = 'phoneNumber';

            $user->firstName   = $san($request->firstName);
            $user->lastName    = $san($request->lastName);
            $user->phoneNumber = $request->phoneNumber;
            $user->address     = $san($request->address);
            $user->save();

            if (!empty($changedFields)) {
                Log::info('security.profile_contact_changed', [
                    'user_id' => (string) $user->_id,
                    'changed' => $changedFields,
                    'ip'      => request()->ip(),
                ]);
            }

            return $this->successResponse('Profile updated successfully.', [
                'firstName' => $user->firstName,
                'lastName' => $user->lastName,
                'email' => $user->email,
                'phoneNumber' => $user->phoneNumber,
                'address' => $user->address,
                'role' => $user->role,
                'lastLogin' => $user->lastLogin,
            ]);
        } catch (\Illuminate\Validation\ValidationException $e) {
            return $this->validationErrorResponse($e);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'An unexpected error occurred.');
        }
    }

    public function updatePassword(Request $request)
    {
        try {
            $user = $request->user();

            if (!$user) {
                return $this->unauthorizedResponse();
            }

            $request->validate([
                'currentPassword' => 'required|string|max:255',
                'password' => ['required', 'confirmed', Password::min(8)->mixedCase()->numbers()->symbols()],
            ]);

            if (!Hash::check($request->currentPassword, $user->password)) {
                return $this->errorResponse('Current password is incorrect.', 400);
            }

            $user->password = Hash::make($request->password);
            $user->save();

            Log::info('security.password_changed', [
                'user_id' => (string) $user->_id,
                'email'   => $user->email,
                'ip'      => request()->ip(),
            ]);

            // The other half of the reset already recorded in AuthController. A password moving
            // is what an account takeover looks like from the outside, whichever door it went
            // through, so both doors have to write it down.
            $this->logActivity($request, 'auth.password_changed', 'auth', (string) $user->_id,
                'Changed their own password');

            return $this->successResponse('Password changed successfully.');
        } catch (\Illuminate\Validation\ValidationException $e) {
            return $this->validationErrorResponse($e);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'An unexpected error occurred.');
        }
    }

    /**
     * POST /profile/email - start changing the account's email: the current password, then a code
     * sent to the NEW address. Nothing changes until the code comes back, so a typo or a stolen
     * session cannot move the account.
     */
    public function requestEmailChange(Request $request)
    {
        try {
            $user = $request->user();
            if (!$user) return $this->unauthorizedResponse();
            $request->validate([
                'email'           => 'required|email:rfc|max:100',
                'currentPassword' => 'required|string|max:255',
            ]);
            if (!Hash::check($request->currentPassword, $user->password)) {
                return $this->errorResponse('Current password is incorrect.', 400);
            }
            $email = strtolower(trim((string) $request->email));
            if ($email === strtolower((string) $user->email)) {
                return $this->errorResponse('That is already your email.', 422);
            }
            if (User::emailIs($email)->where('_id', '!=', $user->_id)->exists()) {
                return $this->errorResponse('That email is already used by another account.', 422);
            }

            $code = (string) random_int(100000, 999999);
            $user->pendingEmail          = $email;
            $user->pendingEmailCode      = hash('sha256', $code);
            $user->pendingEmailExpiresAt = now()->addMinutes(15);
            $user->pendingEmailAttempts  = 0;
            $user->save();

            \Illuminate\Support\Facades\Mail::to($email)->send(new \App\Mail\VerificationCodeMail($code, (string) $user->firstName));

            return $this->successResponse("We sent a 6-digit code to {$email}. It works for 15 minutes.", ['email' => $email]);
        } catch (\Illuminate\Validation\ValidationException $e) {
            return $this->validationErrorResponse($e);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'Could not send the code. Try again.');
        }
    }

    /** POST /profile/email/confirm - the code from the new inbox moves the account there. */
    public function confirmEmailChange(Request $request)
    {
        try {
            $user = $request->user();
            if (!$user) return $this->unauthorizedResponse();
            $request->validate(['code' => 'required|digits:6']);

            $clear = function () use ($user) {
                $user->pendingEmail = $user->pendingEmailCode = $user->pendingEmailExpiresAt = $user->pendingEmailAttempts = null;
                $user->save();
            };
            if (empty($user->pendingEmail) || empty($user->pendingEmailCode)) {
                return $this->errorResponse('There is no email change waiting. Start again.', 422);
            }
            if (now()->greaterThan(\Carbon\Carbon::parse($user->pendingEmailExpiresAt))) {
                $clear();
                return $this->errorResponse('That code has expired. Start again.', 422);
            }
            if (!hash_equals((string) $user->pendingEmailCode, hash('sha256', (string) $request->code))) {
                $tries = (int) ($user->pendingEmailAttempts ?? 0) + 1;
                if ($tries >= 5) {
                    $clear();
                    return $this->errorResponse('Too many wrong codes. Start again.', 429);
                }
                $user->pendingEmailAttempts = $tries;
                $user->save();
                return $this->errorResponse('That code is not right. ' . (5 - $tries) . ' tries left.', 422);
            }
            $new = (string) $user->pendingEmail;
            if (User::emailIs($new)->where('_id', '!=', $user->_id)->exists()) {
                $clear();
                return $this->errorResponse('That email is already used by another account.', 422);
            }

            $old = (string) $user->email;
            $user->email       = $new;
            $user->is_verified = true;
            $clear();
            // Every other device signs in again; this one stays.
            $current = $user->currentAccessToken();
            $currentId = $current && isset($current->id) ? (string) $current->id : null;
            foreach ($user->tokens()->get() as $t) {
                if ((string) $t->id !== $currentId) $t->delete();
            }

            // The old inbox hears about it: if this was not them, they know, and whom to call.
            try {
                \Illuminate\Support\Facades\Mail::to($old)->send(new \App\Mail\AccountSecurityAlertMail(
                    (string) $user->firstName,
                    'Your email address was changed',
                    'Your account email was changed',
                    'The email on your Personalize Me Prints account was changed to ' . self::mask($new) . '. If you did not do this, contact the shop right away so the account can be recovered.',
                    (string) $request->ip(),
                    now('Asia/Manila')->format('M j, Y g:i A')
                ));
            } catch (\Throwable $e) {
                Log::warning('ProfileController@confirmEmailChange: old-address notice failed: ' . $e->getMessage());
            }
            $this->logActivity($request, 'auth.email_changed', 'auth', (string) $user->_id,
                'Changed their email from ' . self::mask($old) . ' to ' . self::mask($new), ['from' => self::mask($old), 'to' => self::mask($new)]);

            return $this->successResponse('Email changed. Other devices have been signed out.', ['email' => $new]);
        } catch (\Illuminate\Validation\ValidationException $e) {
            return $this->validationErrorResponse($e);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'Could not change the email. Try again.');
        }
    }

    /** "joshua@gmail.com" -> "j****a@gmail.com": enough to recognise, not enough to harvest. */
    public static function mask(string $email): string
    {
        [$name, $domain] = array_pad(explode('@', $email, 2), 2, '');
        $len = mb_strlen($name);
        $shown = $len <= 2 ? mb_substr($name, 0, 1) . '*' : mb_substr($name, 0, 1) . str_repeat('*', $len - 2) . mb_substr($name, -1);
        return $shown . '@' . $domain;
    }

    public function updateAvatar(Request $request)
    {
        try {
            $user = $request->user();

            if (!$user) {
                return $this->unauthorizedResponse();
            }

            $request->validate([
                'avatar' => 'required|string|url|max:255',
            ]);

            $user->avatar = $request->avatar;
            $user->save();

            return $this->successResponse('Avatar updated successfully.', [
                'avatar' => $user->avatar,
            ]);
        } catch (\Illuminate\Validation\ValidationException $e) {
            return $this->validationErrorResponse($e);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'Failed to update avatar.');
        }
    }

    /**
     * DELETE /api/profile
     * Anonymizes the customer's account per Data Privacy Act of 2012 (RA 10173).
     * Transaction records are retained for BIR legal compliance.
     *
     * Blocked if the customer has:
     *   - Active (non-terminal) orders
     *   - Orders with an outstanding balance
     */
    public function deleteAccount(Request $request)
    {
        try {
            $user = $request->user();

            if (!$user) {
                return $this->unauthorizedResponse();
            }

            if ($user->role !== 'customer') {
                return $this->errorResponse('Only customer accounts can be self-deleted.', 403);
            }

            $request->validate([
                'password' => 'required|string|max:255',
                'reason'   => 'nullable|string|max:500',
            ]);

            if (!Hash::check($request->password, $user->password)) {
                return $this->errorResponse('Incorrect password. Please try again.', 422);
            }

            $userId = (string) ($user->_id ?? $user->id);

            // Block: active (non-terminal) orders
            $terminalStatuses = [
                'Delivered', 'Cancelled', 'Returned',
                'delivered', 'cancelled', 'returned',
            ];

            // A checkout still being paid or one whose payment failed is not an order - and one the
            // customer cannot see must never be what stops them deleting their account.
            $activeCount = Order::where('userId', $userId)
                ->where('checkoutPending', '!=', true)
                ->where('voidedCheckout', '!=', true)
                ->whereNotIn('orderStatus', $terminalStatuses)
                ->count();

            if ($activeCount > 0) {
                return $this->errorResponse(
                    "You have {$activeCount} active order(s) still in progress. Please wait for them to be completed or cancelled before deleting your account.",
                    422,
                    ['reason' => 'active_orders', 'count' => $activeCount]
                );
            }

            // Block: outstanding payment balances
            $unpaidCount = Order::where('userId', $userId)
                ->where('checkoutPending', '!=', true)
                ->where('voidedCheckout', '!=', true)
                ->where('paymentStatus', '!=', 'paid')
                ->where('balance', '>', 0)
                ->count();

            if ($unpaidCount > 0) {
                return $this->errorResponse(
                    "You have {$unpaidCount} order(s) with outstanding balance(s). Please settle all payments before deleting your account.",
                    422,
                    ['reason' => 'outstanding_balance', 'count' => $unpaidCount]
                );
            }

            // Anonymize PII - order/transaction records are retained for BIR compliance
            $user->firstName          = 'Deleted';
            $user->lastName           = 'User';
            $user->middleInitial      = null;
            $user->email              = 'deleted_' . $userId . '@deleted.invalid';
            $user->phoneNumber        = null;
            $user->address            = null;
            $user->addresses          = [];
            $user->avatar             = null;
            $user->device_tokens      = [];
            $user->two_factor_enabled = false;
            $user->totp_secret        = null;
            $user->totp_confirmed     = false;
            $user->is_verified        = false;
            $user->status             = 'deleted';
            $user->deleted_at         = now();
            $user->deletion_reason    = $request->reason ?? null;
            // Randomize password so the account cannot be logged into
            $user->password           = Hash::make(Str::random(64));
            $user->save();

            // The ORDER keeps its own copy of the buyer, taken at checkout - anonymising the account
            // never touched it. That copy has to be handled with a distinction:
            //
            //   The NAME stays. A sale is a financial record the shop is required to keep (BIR: ten
            //   years), and the buyer's identity is part of it. RA 10173 permits exactly this - it
            //   allows retention where another law requires it.
            //
            //   The EMAIL and PHONE go. Nothing about proving a sale happened requires being able to
            //   contact the person afterwards, so keeping them is retention without a reason.
            //
            // The order is also flagged, so staff can see at a glance why this customer cannot be
            // reached rather than trying and wondering.
            try {
                foreach (Order::where('userId', $userId)->get() as $o) {
                    $snap = $o->userSnapshot ?? [];
                    $o->userSnapshot = [
                        'name'  => $snap['name'] ?? 'Deleted User',
                        'email' => null,
                        'phone' => null,
                    ];
                    $o->customerDeleted   = true;
                    $o->customerDeletedAt = now();
                    $o->save();
                }
            } catch (\Throwable $e) {
                Log::warning('Order snapshot scrub failed on account deletion', [
                    'userId' => $userId, 'error' => $e->getMessage(),
                ]);
            }

            // Revoke all Sanctum tokens - logs out all devices
            $user->tokens()->delete();

            Log::info('Customer account anonymized (RA 10173).', [
                'anonymized_id' => $userId,
                'reason'        => $request->reason ?? 'Not specified',
            ]);

            return $this->successResponse(
                'Your account has been deleted and your personal information has been removed in accordance with the Data Privacy Act of 2012 (RA 10173). Transaction records are retained as required by law.'
            );

        } catch (\Illuminate\Validation\ValidationException $e) {
            return $this->validationErrorResponse($e);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'Failed to delete account. Please try again.');
        }
    }

    /**
     * POST /api/profile/upload-avatar
     * Upload avatar file, save to Cloudinary, update user
     */
    public function uploadAvatar(Request $request)
    {
        try {
            $user = $request->user();

            if (!$user) {
                return $this->unauthorizedResponse();
            }

            $request->validate([
                'avatar' => 'required|image|mimes:jpeg,png,jpg,gif,webp|max:2048',
            ]);

            $cloudName = config('services.cloudinary.cloud_name');
            $uploadPreset = config('services.cloudinary.upload_preset');

            if (!$cloudName || !$uploadPreset) {
                return $this->errorResponse('Image upload service not configured.', 500);
            }

            $file = $request->file('avatar');

            $response = \Illuminate\Support\Facades\Http::attach(
                'file',
                file_get_contents($file->getRealPath()),
                $file->getClientOriginalName(),
                ['Content-Type' => $file->getMimeType()]
            )->post("https://api.cloudinary.com/v1_1/{$cloudName}/image/upload", [
                'upload_preset' => $uploadPreset,
                'folder'        => 'pmp-avatars',
            ]);

            if (!$response->successful()) {
                return $this->errorResponse('Failed to upload image.', 500);
            }

            $data = $response->json();
            $avatarUrl = $data['secure_url'] ?? null;

            if (!$avatarUrl) {
                return $this->errorResponse('Upload succeeded but no URL returned.', 500);
            }

            $user->avatar = $avatarUrl;
            $user->save();

            return $this->successResponse('Avatar updated successfully.', [
                'avatar' => $avatarUrl,
            ]);
        } catch (\Illuminate\Validation\ValidationException $e) {
            return $this->validationErrorResponse($e);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'Failed to upload avatar.');
        }
    }
}
