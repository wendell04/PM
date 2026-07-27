<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\User;

class SettingsController extends Controller
{
    private function getOwner(): ?User
    {
        return User::where('role', 'owner')->first()
            ?? User::whereIn('role', ['admin', 'owner'])->first();
    }

    public function public(Request $request)
    {
        try {
            $owner = $this->getOwner();
            return $this->successResponse('Public settings retrieved.', [
                'designRequestFee'     => (float) ($owner->designRequestFee     ?? 100),
                'storeLat'             => $owner->storeLat              ?? null,
                'storeLng'             => $owner->storeLng              ?? null,
                'shippingMode'         => $owner->shippingMode          ?? 'courier_booked',
                'shippingBaseRate'     => (float) ($owner->shippingBaseRate     ?? 50),
                'shippingPerKmRate'    => (float) ($owner->shippingPerKmRate    ?? 15),
                'flatRateInsideMetro'  => (float) ($owner->flatRateInsideMetro  ?? 150),
                'flatRateOutsideMetro' => (float) ($owner->flatRateOutsideMetro ?? 250),
                // Delivery estimate + rush (storefront shows "Get by [range]" from these).
                'productionLeadDays'   => (int)   ($owner->productionLeadDays   ?? 5),
                'shippingDaysMin'      => (int)   ($owner->shippingDaysMin      ?? 2),
                'shippingDaysMax'      => (int)   ($owner->shippingDaysMax      ?? 4),
                'rushEnabled'          => (bool)  ($owner->rushEnabled          ?? true),
                'rushLeadDays'         => (int)   ($owner->rushLeadDays         ?? 2),
                'rushFee'              => (float) ($owner->rushFee              ?? 150),
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

            // Shipping settings are always stored on the owner account
            $owner = $this->getOwner() ?? $user;

            return $this->successResponse('Settings retrieved.', [
                'storeName'            => $user->storeName             ?? '',
                'storeDescription'     => $user->storeDescription      ?? '',
                'storeEmail'           => $user->storeEmail            ?? '',
                'storePhone'           => $user->storePhone            ?? '',
                'storeAddress'         => $owner->storeAddress          ?? '',
                'storeAddressParts'    => $owner->storeAddressParts     ?? null,
                'storeLat'             => $owner->storeLat              ?? null,
                'storeLng'             => $owner->storeLng              ?? null,
                'shippingMode'         => $owner->shippingMode          ?? 'courier_booked',
                'shippingBaseRate'     => (float) ($owner->shippingBaseRate     ?? 50),
                'shippingPerKmRate'    => (float) ($owner->shippingPerKmRate    ?? 15),
                'flatRateInsideMetro'  => (float) ($owner->flatRateInsideMetro  ?? 150),
                'flatRateOutsideMetro' => (float) ($owner->flatRateOutsideMetro ?? 250),
                'designRequestFee'     => (float) ($user->designRequestFee      ?? 100),
                'productionLeadDays'   => (int)   ($owner->productionLeadDays   ?? 5),
                'shippingDaysMin'      => (int)   ($owner->shippingDaysMin      ?? 2),
                'shippingDaysMax'      => (int)   ($owner->shippingDaysMax      ?? 4),
                'rushEnabled'          => (bool)  ($owner->rushEnabled          ?? true),
                'rushLeadDays'         => (int)   ($owner->rushLeadDays         ?? 2),
                'rushFee'              => (float) ($owner->rushFee              ?? 150),
            ]);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'Failed to retrieve settings.');
        }
    }

    public function shippingUpdate(Request $request)
    {
        try {
            if (!$request->user()) return $this->unauthorizedResponse();

            $owner = $this->getOwner();
            if (!$owner) return $this->serverErrorResponse(new \Exception('No owner'), 'Store owner not found.');

            $request->validate([
                'storeAddress'         => 'nullable|string|max:300',
                'storeAddressParts'    => 'nullable|array',
                'storeLat'             => 'nullable|numeric|between:-90,90',
                'storeLng'             => 'nullable|numeric|between:-180,180',
                // Stored on the OWNER, because that is where the storefront reads it from.
                'designRequestFee'     => 'nullable|numeric|min:0|max:99999',
                'shippingMode'         => 'nullable|string|in:distance,flat,courier_booked',
                'shippingBaseRate'     => 'nullable|numeric|min:0|max:9999',
                'shippingPerKmRate'    => 'nullable|numeric|min:0|max:9999',
                'flatRateInsideMetro'  => 'nullable|numeric|min:0|max:9999',
                'flatRateOutsideMetro' => 'nullable|numeric|min:0|max:9999',
                'productionLeadDays'   => 'nullable|integer|min:0|max:120',
                'shippingDaysMin'      => 'nullable|integer|min:0|max:120',
                'shippingDaysMax'      => 'nullable|integer|min:0|max:120',
                'rushEnabled'          => 'nullable|boolean',
                'rushLeadDays'         => 'nullable|integer|min:0|max:120',
                'rushFee'              => 'nullable|numeric|min:0|max:99999',
            ]);

            if ($request->has('storeAddress'))         $owner->storeAddress         = $request->storeAddress ?? '';
            if ($request->has('storeAddressParts'))    $owner->storeAddressParts    = $request->storeAddressParts ?? null;
            if ($request->has('storeLat'))             $owner->storeLat             = $request->storeLat !== null ? (float) $request->storeLat : null;
            if ($request->has('storeLng'))             $owner->storeLng             = $request->storeLng !== null ? (float) $request->storeLng : null;
            if ($request->has('designRequestFee'))     $owner->designRequestFee     = (float) $request->designRequestFee;
            if ($request->has('shippingMode'))         $owner->shippingMode         = $request->shippingMode ?? 'courier_booked';
            if ($request->has('shippingBaseRate'))     $owner->shippingBaseRate     = (float) $request->shippingBaseRate;
            if ($request->has('shippingPerKmRate'))    $owner->shippingPerKmRate    = (float) $request->shippingPerKmRate;
            if ($request->has('flatRateInsideMetro'))  $owner->flatRateInsideMetro  = (float) $request->flatRateInsideMetro;
            if ($request->has('flatRateOutsideMetro')) $owner->flatRateOutsideMetro = (float) $request->flatRateOutsideMetro;
            if ($request->has('productionLeadDays'))   $owner->productionLeadDays   = (int) $request->productionLeadDays;
            if ($request->has('shippingDaysMin'))      $owner->shippingDaysMin      = (int) $request->shippingDaysMin;
            if ($request->has('shippingDaysMax'))      $owner->shippingDaysMax      = (int) $request->shippingDaysMax;
            if ($request->has('rushEnabled'))          $owner->rushEnabled          = (bool) $request->rushEnabled;
            if ($request->has('rushLeadDays'))         $owner->rushLeadDays         = (int) $request->rushLeadDays;
            if ($request->has('rushFee'))              $owner->rushFee              = (float) $request->rushFee;
            $owner->save();

            return $this->successResponse('Shipping settings saved.', [
                'storeAddress'         => $owner->storeAddress          ?? '',
                'storeAddressParts'    => $owner->storeAddressParts     ?? null,
                'storeLat'             => $owner->storeLat              ?? null,
                'storeLng'             => $owner->storeLng              ?? null,
                'shippingMode'         => $owner->shippingMode          ?? 'courier_booked',
                'shippingBaseRate'     => (float) ($owner->shippingBaseRate     ?? 50),
                'shippingPerKmRate'    => (float) ($owner->shippingPerKmRate    ?? 15),
                'flatRateInsideMetro'  => (float) ($owner->flatRateInsideMetro  ?? 150),
                'flatRateOutsideMetro' => (float) ($owner->flatRateOutsideMetro ?? 250),
                'productionLeadDays'   => (int)   ($owner->productionLeadDays   ?? 5),
                'shippingDaysMin'      => (int)   ($owner->shippingDaysMin      ?? 2),
                'shippingDaysMax'      => (int)   ($owner->shippingDaysMax      ?? 4),
                'rushEnabled'          => (bool)  ($owner->rushEnabled          ?? true),
                'rushLeadDays'         => (int)   ($owner->rushLeadDays         ?? 2),
                'rushFee'              => (float) ($owner->rushFee              ?? 150),
            ]);
        } catch (\Illuminate\Validation\ValidationException $e) {
            return $this->validationErrorResponse($e);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'Failed to save shipping settings.');
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
