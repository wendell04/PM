<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\User;

class SettingsController extends Controller
{
    private function getOwner(): ?User
    {
        return User::where('role', 'owner')->first();
    }

    public function public(Request $request)
    {
        try {
            $owner = $this->getOwner();
            return $this->successResponse('Public settings retrieved.', [
                'designRequestFee'  => (float) ($owner->designRequestFee  ?? 100),
                'storeLat'          => $owner->storeLat         ?? null,
                'storeLng'          => $owner->storeLng         ?? null,
                'shippingBaseRate'  => (float) ($owner->shippingBaseRate  ?? 50),
                'shippingPerKmRate' => (float) ($owner->shippingPerKmRate ?? 15),
            ]);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'Failed to retrieve public settings.');
        }
    }

    public function show(Request $request)
    {
        try {
            $user = $request->user();
            if (!$user) return $this->unauthorizedResponse();

            return $this->successResponse('Settings retrieved.', [
                'storeName'         => $user->storeName        ?? '',
                'storeDescription'  => $user->storeDescription ?? '',
                'storeEmail'        => $user->storeEmail       ?? '',
                'storePhone'        => $user->storePhone       ?? '',
                'storeAddress'      => $user->storeAddress     ?? '',
                'storeLat'          => $user->storeLat         ?? null,
                'storeLng'          => $user->storeLng         ?? null,
                'shippingBaseRate'  => (float) ($user->shippingBaseRate  ?? 50),
                'shippingPerKmRate' => (float) ($user->shippingPerKmRate ?? 15),
                'designRequestFee'  => (float) ($user->designRequestFee  ?? 100),
            ]);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'Failed to retrieve settings.');
        }
    }

    public function update(Request $request)
    {
        try {
            $user = $request->user();
            if (!$user) return $this->unauthorizedResponse();

            $request->validate([
                'storeName'         => 'required|string|min:2|max:100',
                'storeDescription'  => 'nullable|string|max:500',
                'storeEmail'        => 'required|email',
                'storePhone'        => ['required', 'string', 'regex:/^(\+?63|0)9\d{9}$/'],
                'storeAddress'      => 'nullable|string|max:300',
                'storeLat'          => 'nullable|numeric|between:-90,90',
                'storeLng'          => 'nullable|numeric|between:-180,180',
                'shippingBaseRate'  => 'nullable|numeric|min:0|max:9999',
                'shippingPerKmRate' => 'nullable|numeric|min:0|max:9999',
                'designRequestFee'  => 'nullable|numeric|min:0|max:99999',
            ]);

            $user->storeName        = $request->storeName;
            $user->storeDescription = $request->storeDescription ?? '';
            $user->storeEmail       = $request->storeEmail;
            $user->storePhone       = $request->storePhone;
            if ($request->has('storeAddress'))      $user->storeAddress      = $request->storeAddress ?? '';
            if ($request->has('storeLat'))          $user->storeLat          = $request->storeLat !== null ? (float) $request->storeLat : null;
            if ($request->has('storeLng'))          $user->storeLng          = $request->storeLng !== null ? (float) $request->storeLng : null;
            if ($request->has('shippingBaseRate'))  $user->shippingBaseRate  = (float) ($request->shippingBaseRate  ?? 50);
            if ($request->has('shippingPerKmRate')) $user->shippingPerKmRate = (float) ($request->shippingPerKmRate ?? 15);
            if ($request->has('designRequestFee'))  $user->designRequestFee  = (float) $request->designRequestFee;
            $user->save();

            return $this->successResponse('Settings updated successfully.', [
                'storeName'         => $user->storeName,
                'storeDescription'  => $user->storeDescription,
                'storeEmail'        => $user->storeEmail,
                'storePhone'        => $user->storePhone,
                'storeAddress'      => $user->storeAddress     ?? '',
                'storeLat'          => $user->storeLat         ?? null,
                'storeLng'          => $user->storeLng         ?? null,
                'shippingBaseRate'  => (float) ($user->shippingBaseRate  ?? 50),
                'shippingPerKmRate' => (float) ($user->shippingPerKmRate ?? 15),
                'designRequestFee'  => (float) ($user->designRequestFee  ?? 100),
            ]);
        } catch (\Illuminate\Validation\ValidationException $e) {
            return $this->validationErrorResponse($e);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'Failed to update settings.');
        }
    }
}
