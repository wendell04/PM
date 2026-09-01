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
                // Modelled on how motorcycle courier apps (Lalamove, Grab) actually price a ride in
                // Metro Manila: a base fare, a per-km rate for a short first stretch, then a lower
                // per-km rate beyond it. A single flat per-km rate across the whole trip was a shape
                // no real courier prices with - short deliveries came out a little expensive relative
                // to long ones, because nothing captured the tapering real pricing has.
                'shippingBaseRate'     => (float) ($owner->shippingBaseRate     ?? 49),
                'shippingPerKmRate'    => (float) ($owner->shippingPerKmRate    ?? 6),
                'shippingPerKmRateFar' => (float) ($owner->shippingPerKmRateFar ?? 5),
                'shippingTierKm'       => (float) ($owner->shippingTierKm       ?? 5),
                'flatRateInsideMetro'  => (float) ($owner->flatRateInsideMetro  ?? 150),
                'flatRateOutsideMetro' => (float) ($owner->flatRateOutsideMetro ?? 250),
                // Delivery estimate + rush (storefront shows "Get by [range]" from these).
                'productionLeadDays'   => (int)   ($owner->productionLeadDays   ?? 3),
                'depositDueDays'       => (int)   ($owner->depositDueDays       ?? 7),
                'unpaidOrderDays'      => (int)   ($owner->unpaidOrderDays      ?? 3),
                // How long a FINISHED order is held while the balance goes unpaid. Personalised goods
                // cannot be resold, so this is a holding period ending in disposal, not a refund
                // window - the deposit is what covers the loss.
                'unpaidReadyHoldDays'  => (int)   ($owner->unpaidReadyHoldDays  ?? 14),
                // Quoted in the refund clause, so it must be a setting rather than a number typed
                // into the prose - a term that promises a timescale binds the shop to it.
                'refundDays'           => (int)   ($owner->refundDays           ?? 7),
                'freeRevisions'        => (int)   ($owner->freeRevisions        ?? 3),
                'extraRevisionFee'     => (float) ($owner->extraRevisionFee     ?? 50),
                'maxRevisions'         => (int)   ($owner->maxRevisions         ?? 5),
                'shippingDaysMin'      => (int)   ($owner->shippingDaysMin      ?? 1),
                'shippingDaysMax'      => (int)   ($owner->shippingDaysMax      ?? 2),
                'rushEnabled'          => (bool)  ($owner->rushEnabled          ?? true),
                'rushLeadDays'         => (int)   ($owner->rushLeadDays         ?? 1),
                'rushFee'              => (float) ($owner->rushFee              ?? 150),
                // Custom-order T&C the storefront gates ordering on (owner-editable; version is
                // recorded on the order when the customer accepts).
                'customOrderTerms'     => $owner->customOrderTerms ?? null,
                // The clauses shown at ACCOUNT CREATION. They were literal JSX in RegisterForm, so
                // the owner could not change them and nothing recorded which wording anyone accepted.
                'registrationTerms'        => $owner->registrationTerms ?? null,
                'registrationTermsVersion' => (int) ($owner->registrationTermsVersion ?? 1),
                'termsVersion'         => (int) ($owner->termsVersion ?? 1),
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
                'shippingBaseRate'     => (float) ($owner->shippingBaseRate     ?? 49),
                'shippingPerKmRate'    => (float) ($owner->shippingPerKmRate    ?? 6),
                'shippingPerKmRateFar' => (float) ($owner->shippingPerKmRateFar ?? 5),
                'shippingTierKm'       => (float) ($owner->shippingTierKm       ?? 5),
                'flatRateInsideMetro'  => (float) ($owner->flatRateInsideMetro  ?? 150),
                'flatRateOutsideMetro' => (float) ($owner->flatRateOutsideMetro ?? 250),
                'designRequestFee'     => (float) ($user->designRequestFee      ?? 100),
                'productionLeadDays'   => (int)   ($owner->productionLeadDays   ?? 3),
                'depositDueDays'       => (int)   ($owner->depositDueDays       ?? 7),
                'unpaidOrderDays'      => (int)   ($owner->unpaidOrderDays      ?? 3),
                // How long a FINISHED order is held while the balance goes unpaid. Personalised goods
                // cannot be resold, so this is a holding period ending in disposal, not a refund
                // window - the deposit is what covers the loss.
                'unpaidReadyHoldDays'  => (int)   ($owner->unpaidReadyHoldDays  ?? 14),
                // Quoted in the refund clause, so it must be a setting rather than a number typed
                // into the prose - a term that promises a timescale binds the shop to it.
                'refundDays'           => (int)   ($owner->refundDays           ?? 7),
                'freeRevisions'        => (int)   ($owner->freeRevisions        ?? 3),
                'extraRevisionFee'     => (float) ($owner->extraRevisionFee     ?? 50),
                'maxRevisions'         => (int)   ($owner->maxRevisions         ?? 5),
                'shippingDaysMin'      => (int)   ($owner->shippingDaysMin      ?? 1),
                'shippingDaysMax'      => (int)   ($owner->shippingDaysMax      ?? 2),
                'rushEnabled'          => (bool)  ($owner->rushEnabled          ?? true),
                'rushLeadDays'         => (int)   ($owner->rushLeadDays         ?? 1),
                'rushFee'              => (float) ($owner->rushFee              ?? 150),
                // Custom-order T&C the storefront gates ordering on (owner-editable; version is
                // recorded on the order when the customer accepts).
                'customOrderTerms'     => $owner->customOrderTerms ?? null,
                // The clauses shown at ACCOUNT CREATION. They were literal JSX in RegisterForm, so
                // the owner could not change them and nothing recorded which wording anyone accepted.
                'registrationTerms'        => $owner->registrationTerms ?? null,
                'registrationTermsVersion' => (int) ($owner->registrationTermsVersion ?? 1),
                'termsVersion'         => (int) ($owner->termsVersion ?? 1),
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
                'shippingPerKmRateFar' => 'nullable|numeric|min:0|max:9999',
                'shippingTierKm'       => 'nullable|numeric|min:0|max:200',
                'flatRateInsideMetro'  => 'nullable|numeric|min:0|max:9999',
                'flatRateOutsideMetro' => 'nullable|numeric|min:0|max:9999',
                'productionLeadDays'   => 'nullable|integer|min:0|max:120',
                'depositDueDays'       => 'nullable|integer|min:1|max:60',
                'unpaidOrderDays'      => 'nullable|integer|min:1|max:60',
                'unpaidReadyHoldDays'  => 'nullable|integer|min:1|max:180',
                'refundDays'           => 'nullable|integer|min:1|max:60',
                'freeRevisions'        => 'nullable|integer|min:0|max:10',
                'extraRevisionFee'     => 'nullable|numeric|min:0|max:99999',
                'maxRevisions'         => 'nullable|integer|min:1|max:20',
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
            if ($request->has('shippingPerKmRateFar')) $owner->shippingPerKmRateFar = (float) $request->shippingPerKmRateFar;
            if ($request->has('shippingTierKm'))       $owner->shippingTierKm       = (float) $request->shippingTierKm;
            if ($request->has('flatRateInsideMetro'))  $owner->flatRateInsideMetro  = (float) $request->flatRateInsideMetro;
            if ($request->has('flatRateOutsideMetro')) $owner->flatRateOutsideMetro = (float) $request->flatRateOutsideMetro;
            if ($request->has('productionLeadDays'))   $owner->productionLeadDays   = (int) $request->productionLeadDays;
            if ($request->has('depositDueDays'))       $owner->depositDueDays       = (int) $request->depositDueDays;
            if ($request->has('unpaidOrderDays'))      $owner->unpaidOrderDays      = (int) $request->unpaidOrderDays;
            if ($request->has('unpaidReadyHoldDays'))  $owner->unpaidReadyHoldDays  = (int) $request->unpaidReadyHoldDays;
            if ($request->has('refundDays'))           $owner->refundDays           = (int) $request->refundDays;
            if ($request->has('freeRevisions'))        $owner->freeRevisions        = (int) $request->freeRevisions;
            if ($request->has('extraRevisionFee'))     $owner->extraRevisionFee     = (float) $request->extraRevisionFee;
            if ($request->has('maxRevisions'))         $owner->maxRevisions         = (int) $request->maxRevisions;
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
                'productionLeadDays'   => (int)   ($owner->productionLeadDays   ?? 3),
                'depositDueDays'       => (int)   ($owner->depositDueDays       ?? 7),
                'unpaidOrderDays'      => (int)   ($owner->unpaidOrderDays      ?? 3),
                // How long a FINISHED order is held while the balance goes unpaid. Personalised goods
                // cannot be resold, so this is a holding period ending in disposal, not a refund
                // window - the deposit is what covers the loss.
                'unpaidReadyHoldDays'  => (int)   ($owner->unpaidReadyHoldDays  ?? 14),
                // Quoted in the refund clause, so it must be a setting rather than a number typed
                // into the prose - a term that promises a timescale binds the shop to it.
                'refundDays'           => (int)   ($owner->refundDays           ?? 7),
                'freeRevisions'        => (int)   ($owner->freeRevisions        ?? 3),
                'extraRevisionFee'     => (float) ($owner->extraRevisionFee     ?? 50),
                'maxRevisions'         => (int)   ($owner->maxRevisions         ?? 5),
                'shippingDaysMin'      => (int)   ($owner->shippingDaysMin      ?? 1),
                'shippingDaysMax'      => (int)   ($owner->shippingDaysMax      ?? 2),
                'rushEnabled'          => (bool)  ($owner->rushEnabled          ?? true),
                'rushLeadDays'         => (int)   ($owner->rushLeadDays         ?? 1),
                'rushFee'              => (float) ($owner->rushFee              ?? 150),
            ]);
        } catch (\Illuminate\Validation\ValidationException $e) {
            return $this->validationErrorResponse($e);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'Failed to save shipping settings.');
        }
    }

    /**
     * POST /api/admin/settings/registration-terms
     *
     * The clauses a visitor accepts when creating an account. They lived as literal JSX inside
     * RegisterForm, which caused two problems: the owner could not change a word without a deploy,
     * and nothing anywhere recorded WHICH wording a given customer had agreed to.
     *
     * Saving bumps the version. Each new account stores that version plus a snapshot of the text, so
     * a later edit can never rewrite what somebody already accepted.
     */
    public function registrationTermsUpdate(Request $request)
    {
        try {
            if (!$request->user()) return $this->unauthorizedResponse();
            $owner = $this->getOwner();
            if (!$owner) return $this->serverErrorResponse(new \Exception('No owner'), 'Store owner not found.');

            $validated = $request->validate([
                'registrationTerms'         => 'present|array|max:30',
                'registrationTerms.*.title' => 'required|string|max:120',
                'registrationTerms.*.body'  => 'required|string|max:4000',
            ]);

            $clean = array_values(array_map(fn ($t) => [
                'title' => trim(strip_tags($t['title'])),
                'body'  => trim(strip_tags($t['body'])),
            ], array_filter($validated['registrationTerms'],
                fn ($t) => trim($t['title'] ?? '') !== '' && trim($t['body'] ?? '') !== '')));

            $owner->registrationTerms          = $clean;
            $owner->registrationTermsVersion   = (int) ($owner->registrationTermsVersion ?? 1) + 1;
            $owner->registrationTermsUpdatedAt = now();
            $owner->save();

            return $this->successResponse('Registration terms saved.', [
                'registrationTerms'        => $owner->registrationTerms,
                'registrationTermsVersion' => (int) $owner->registrationTermsVersion,
            ]);
        } catch (\Illuminate\Validation\ValidationException $e) {
            return $this->validationErrorResponse($e);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'Failed to save registration terms.');
        }
    }

    /**
     * GET /api/public/registration-terms
     *
     * Public because the register form has no session yet. Returns the clauses and the version so the
     * form can show the current wording and send back exactly which one was accepted.
     */
    public function publicRegistrationTerms()
    {
        try {
            $owner = $this->getOwner();
            return $this->successResponse('Registration terms fetched.', [
                'registrationTerms'        => $owner->registrationTerms ?? null,
                'registrationTermsVersion' => (int) ($owner->registrationTermsVersion ?? 1),
            ]);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'Failed to fetch registration terms.');
        }
    }

    /**
     * PUT /api/admin/settings/terms
     * Owner edits the custom-order T&C. Bumps termsVersion on every save so the version the
     * customer accepts is recorded and provable.
     */
    public function termsUpdate(Request $request)
    {
        try {
            if (!$request->user()) return $this->unauthorizedResponse();
            $owner = $this->getOwner();
            if (!$owner) return $this->serverErrorResponse(new \Exception('No owner'), 'Store owner not found.');

            $validated = $request->validate([
                'customOrderTerms'          => 'present|array|max:30',
                'customOrderTerms.*.title'  => 'required|string|max:120',
                'customOrderTerms.*.body'   => 'required|string|max:2000',
                'customOrderTerms.*.mode'   => 'nullable|string|in:both,upload,request',
            ]);

            $clean = array_values(array_map(fn ($t) => [
                'title' => trim(strip_tags($t['title'])),
                'body'  => trim(strip_tags($t['body'])),
                'mode'  => in_array($t['mode'] ?? 'both', ['both', 'upload', 'request'], true) ? ($t['mode'] ?? 'both') : 'both',
            ], array_filter($validated['customOrderTerms'], fn ($t) => trim($t['title'] ?? '') !== '' && trim($t['body'] ?? '') !== '')));

            $owner->customOrderTerms = $clean;
            $owner->termsVersion     = (int) ($owner->termsVersion ?? 1) + 1;
            $owner->termsUpdatedAt   = now();
            $owner->save();

            return $this->successResponse('Terms saved.', [
                'customOrderTerms' => $owner->customOrderTerms,
                'termsVersion'     => (int) $owner->termsVersion,
            ]);
        } catch (\Illuminate\Validation\ValidationException $e) {
            return $this->validationErrorResponse($e);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'Failed to save terms.');
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
