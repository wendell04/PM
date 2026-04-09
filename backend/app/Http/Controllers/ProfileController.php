<?php

namespace App\Http\Controllers;

use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
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

            $user->firstName = $request->firstName;
            $user->lastName = $request->lastName;
            $user->email = $request->email;
            $user->phoneNumber = $request->phoneNumber;
            $user->address = $request->address;
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
