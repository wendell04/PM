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
            $token = $request->bearerToken();
            $user = User::where('api_token', hash('sha256', $token))->first();

            if (!$user) {
                return response()->json(['message' => 'Unauthorized.'], 401);
            }

            $request->validate([
                'firstName' => 'required|string|min:2',
                'lastName' => 'required|string|min:2',
                'email' => ['required', 'email', Rule::unique('users')->ignore($user->id, '_id')],
                'phoneNumber' => ['required', 'string', 'regex:/^(09|\+639)\d{9}$/'],
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
            Log::error('ProfileController@update: Failed for user ' . $user->email, ['error' => $e->getMessage()]);
            return response()->json(['error' => 'An unexpected error occurred.'], 500);
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
            Log::error('ProfileController@updatePassword: Failed for user ' . $user->email, ['error' => $e->getMessage()]);
            return response()->json(['error' => 'An unexpected error occurred.'], 500);
        }
    }
}
