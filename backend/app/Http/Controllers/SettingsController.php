<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;

class SettingsController extends Controller
{
    public function show(Request $request)
    {
        try {
            $user = $request->user();

            if (!$user) {
                return $this->unauthorizedResponse();
            }

            return $this->successResponse('Settings retrieved.', [
                'storeName'        => $user->storeName        ?? '',
                'storeDescription' => $user->storeDescription ?? '',
                'storeEmail'       => $user->storeEmail       ?? '',
                'storePhone'       => $user->storePhone       ?? '',
            ]);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'Failed to retrieve settings.');
        }
    }

    public function update(Request $request)
    {
        try {
            $user = $request->user();

            if (!$user) {
                return $this->unauthorizedResponse();
            }

            $request->validate([
                'storeName'        => 'required|string|min:2|max:100',
                'storeDescription' => 'nullable|string|max:500',
                'storeEmail'       => 'required|email',
                'storePhone'       => ['required', 'string', 'regex:/^(\+?63|0)9\d{9}$/'],
            ]);

            $user->storeName        = $request->storeName;
            $user->storeDescription = $request->storeDescription ?? '';
            $user->storeEmail       = $request->storeEmail;
            $user->storePhone       = $request->storePhone;
            $user->save();

            return $this->successResponse('Settings updated successfully.', [
                'storeName'        => $user->storeName,
                'storeDescription' => $user->storeDescription,
                'storeEmail'       => $user->storeEmail,
                'storePhone'       => $user->storePhone,
            ]);
        } catch (\Illuminate\Validation\ValidationException $e) {
            return $this->validationErrorResponse($e);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'Failed to update settings.');
        }
    }
}
