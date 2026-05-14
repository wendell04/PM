<?php

namespace App\Http\Controllers;

use App\Models\User;
use App\Models\Order;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

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
                'firstName' => 'required|string|min:2',
                'lastName' => 'required|string|min:2',
                'email' => ['required', 'email', Rule::unique('users')->ignore($user->id, '_id')],
                'phoneNumber' => ['required', 'string', 'regex:/^(\+?63|0)9\d{9}$/'],
                'address' => 'required|string|min:3',
            ]);

            $san = fn(string $v) => htmlspecialchars(strip_tags(trim($v)), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');

            $user->firstName   = $san($request->firstName);
            $user->lastName    = $san($request->lastName);
            $user->email       = $request->email;
            $user->phoneNumber = $request->phoneNumber;
            $user->address     = $san($request->address);
            $user->save();

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
                'currentPassword' => 'required|string',
                'password' => 'required|string|min:8|confirmed',
            ]);

            if (!Hash::check($request->currentPassword, $user->password)) {
                return $this->errorResponse('Current password is incorrect.', 400);
            }

            $user->password = Hash::make($request->password);
            $user->save();

            return $this->successResponse('Password changed successfully.');
        } catch (\Illuminate\Validation\ValidationException $e) {
            return $this->validationErrorResponse($e);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'An unexpected error occurred.');
        }
    }

    public function updateAvatar(Request $request)
    {
        try {
            $user = $request->user();

            if (!$user) {
                return $this->unauthorizedResponse();
            }

            $request->validate([
                'avatar' => 'required|string|url',
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
                'password' => 'required|string',
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

            $activeCount = Order::where('userId', $userId)
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

            // Anonymize PII — order/transaction records are retained for BIR compliance
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

            // Revoke all Sanctum tokens — logs out all devices
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
