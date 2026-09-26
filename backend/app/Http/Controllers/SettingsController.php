<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\User;

class SettingsController extends Controller
{
    private function getOwner(): ?User
    {
        // The same lookup every reader uses. This screen having its own copy is exactly how the
        // writer and the readers came to disagree: settings saved onto the admin while the order
        // flow asked only for an 'owner', found none, and used hardcoded defaults instead.
        return \App\Support\ShopSettings::owner();
    }

    public function public(Request $request)
    {
        try {
            $owner = $this->getOwner();
            return $this->successResponse('Public settings retrieved.', [
                'designRequestFee'     => (float) ($owner->designRequestFee     ?? 100),
                'designFeeMode'        => \App\Support\DesignFee::mode(),
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
                // Days a customer has to answer a proof before the order closes (terms: {proofReplyDays}).
                'proofReplyDays'       => (int)   ($owner->proofReplyDays       ?? 14),
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
                // Transit by destination. One national range promised Maguindanao the same
                // 1-2 days as a delivery across Quezon City; checkout reads this instead.
                'shippingZones'        => \App\Support\ShippingZones::all(),
                // Which weekdays the shop opens, and the dates it is shut. Every delivery
                // estimate counts in working days, so these two decide what a "3 day" promise
                // actually lands on - Christmas used to count as a working day.
                'workingDays'          => \App\Support\WorkingDays::openWeekdays(),
                'holidays'             => \App\Support\WorkingDays::extraHolidays(),
                'shippingDaysMin'      => (int)   ($owner->shippingDaysMin      ?? 1),
                'shippingDaysMax'      => (int)   ($owner->shippingDaysMax      ?? 2),
                'rushEnabled'          => (bool)  ($owner->rushEnabled          ?? true),
                // The contact form can be switched off from Settings - a public write endpoint
                // that cannot be closed is a liability if it is ever abused. Default open.
                'contactFormEnabled'   => (bool)  ($owner->contactFormEnabled   ?? true),
                // Off unless the owner turns it on: Google bills past its free allowance and has no
                // spending cap of its own, and the address fields are accurate without it.
                'googleMapsEnabled'    => (bool)  ($owner->googleMapsEnabled    ?? false),
                'contactSuccessMessage'=> $owner->contactSuccessMessage ?: null,
                'contactClosedMessage' => $owner->contactClosedMessage  ?: null,
                'rushLeadDays'         => (int)   ($owner->rushLeadDays         ?? 1),
                'rushFee'              => (float) ($owner->rushFee              ?? 150),
                // Two standing offers, off until the owner fills the box in. They are public
                // because the storefront advertises them; whether a given customer is on their
                // FIRST order is not public, and is answered by GET /api/shop/offers.
                'freeDeliveryFrom'     => \App\Support\ShopOffers::freeDeliveryFrom(),
                'firstOrderPercent'    => \App\Support\ShopOffers::firstOrderPercent(),
                'firstOrderCap'        => \App\Support\ShopOffers::firstOrderCap(),
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

    /**
     * POST /api/admin/settings/mail-test  {provider: brevo|resend}
     *
     * One email to the shop's own inbox through ONE named provider, with the provider's exact
     * error text returned to the screen when it refuses. The failover setup hides that text: a
     * refusal is logged (or not, depending on the host) and the next provider quietly carries the
     * mail, so "is Resend working?" could only be answered by reading two dashboards and guessing.
     */
    /**
     * Shop-level settings - shipping rates, terms, the store's own details - belong to the owner
     * (and the super admin who administers the system). The settings screen already hid those
     * tabs from staff; the endpoints behind them did not check, and each wrote onto the OWNER's
     * record for whoever called. A screen that hides a tab is not a permission.
     */
    private function ownsShop(Request $request): bool
    {
        $u = $request->user();
        return $u && (\App\Support\Rbac::isSuperAdmin($u) || \App\Support\Rbac::isOwner($u));
    }

    /**
     * Three tiers of Settings:
     *   the system admin (Integrations - mail providers, Google Maps billing: testing and plumbing
     *     the store owner should never have to see or be able to break);
     *   the owner (everything else, and Terms & Policies alone - they are the contract);
     *   staff granted "Shop settings" (shipping, delivery times, chat replies, order forms).
     */
    /**
     * Which clauses a terms save added, removed or reworded, by title - so the audit entry says
     * "reworded: Design fee" rather than only that the terms changed. (A first save from the
     * built-in list shows every clause as added; that is what happened.)
     */
    private static function clauseDelta(array $before, array $after): array
    {
        $key = fn ($t) => mb_strtolower(trim((string) ($t['title'] ?? '')));
        $old = []; foreach ($before as $t) $old[$key($t)] = $t;
        $new = []; foreach ($after as $t) $new[$key($t)] = $t;
        $title = fn ($t) => (string) ($t['title'] ?? '');
        return [
            'added'    => array_values(array_map($title, array_diff_key($new, $old))),
            'removed'  => array_values(array_map($title, array_diff_key($old, $new))),
            'reworded' => array_values(array_map($title, array_filter($new, fn ($t, $k) => isset($old[$k])
                && (trim((string) ($old[$k]['body'] ?? '')) !== trim((string) ($t['body'] ?? '')) || ($old[$k]['mode'] ?? null) !== ($t['mode'] ?? null)),
                ARRAY_FILTER_USE_BOTH))),
        ];
    }

    private function isSystemAdmin(Request $request): bool
    {
        return \App\Support\Rbac::isSuperAdmin($request->user());
    }

    private function mayShopSettings(Request $request, bool $write): bool
    {
        $u = $request->user();
        return $u && \App\Support\Rbac::allowsFor($u, $write ? 'shopSettings.work' : 'shopSettings.view', $write);
    }

    public function mailTest(Request $request)
    {
        try {
            // Integrations are the system admin's. The owner has no provider to fix if a test fails.
            if (!$this->isSystemAdmin($request)) {
                return $this->unauthorizedResponse();
            }
            $validated = $request->validate(['provider' => 'required|in:brevo,resend,security_lane,notification_lane']);
            $provider  = $validated['provider'];

            // The lane tests walk the configured chain BY HAND instead of handing the message to the
            // failover transport. The failover's whole job is to hide which provider carried a mail -
            // it catches the refusal, moves on, and reports success either way - so with it there is
            // no answer to "who actually sent my code?" short of reading two dashboards and a clock.
            // Here each provider in the chain is tried in order and its own answer recorded, so one
            // click shows the refusal text AND which provider ended up carrying it.
            if (in_array($provider, ['security_lane', 'notification_lane'], true)) {
                $lanes = $this->mailLanes();
                $chain = $provider === 'security_lane' ? $lanes['security'] : $lanes['notifications'];
                $to    = (string) (config('mail.admin_recipient') ?: config('mail.from.address'));
                $from  = $provider === 'security_lane'
                    ? (config('mail.security_from.address') ?: config('mail.from.address'))
                    : config('mail.from.address');

                $attempts = [];
                $carried  = null;
                foreach ($chain as $one) {
                    $t0 = microtime(true);
                    try {
                        \Illuminate\Support\Facades\Mail::mailer($one)
                            ->raw('Lane test from the dashboard at ' . now()->format('Y-m-d H:i:s') . '. Nothing to do.', function ($m) use ($to, $from, $provider) {
                                $m->to($to)->from($from, config('mail.from.name', 'Personalize Me Prints'))
                                  ->subject('Lane test - ' . str_replace('_', ' ', $provider));
                            });
                        $attempts[] = ['provider' => $one, 'ok' => true, 'ms' => (int) round((microtime(true) - $t0) * 1000)];
                        $carried    = $one;
                        break;
                    } catch (\Throwable $e) {
                        $attempts[] = [
                            'provider' => $one,
                            'ok'       => false,
                            'ms'       => (int) round((microtime(true) - $t0) * 1000),
                            'error'    => mb_substr($e->getMessage(), 0, 600),
                        ];
                    }
                }

                return $this->successResponse($carried ? 'Sent.' : 'Every provider in this lane refused.', [
                    'ok'       => $carried !== null,
                    'lane'     => $provider,
                    'chain'    => $chain,
                    'carried'  => $carried,
                    'attempts' => $attempts,
                    'from'     => $from,
                    'to'       => $to,
                ]);
            }
            $to        = (string) (config('mail.admin_recipient') ?: config('mail.from.address'));
            $from      = $provider === 'resend'
                ? (config('mail.security_from.address') ?: config('mail.from.address'))
                : config('mail.from.address');

            $started = microtime(true);
            try {
                \Illuminate\Support\Facades\Mail::mailer($provider)
                    ->raw("Test email sent through {$provider} from the dashboard at " . now()->format('Y-m-d H:i:s') . '. Nothing to do.', function ($m) use ($to, $from, $provider) {
                        $m->to($to)->from($from, config('mail.from.name', 'Personalize Me Prints'))->subject('Mail test - ' . $provider);
                    });
            } catch (\Throwable $e) {
                return $this->successResponse('The provider refused.', [
                    'ok'       => false,
                    'provider' => $provider,
                    'from'     => $from,
                    'to'       => $to,
                    'error'    => mb_substr($e->getMessage(), 0, 600),
                    'ms'       => (int) round((microtime(true) - $started) * 1000),
                ]);
            }
            return $this->successResponse('Sent.', [
                'ok' => true, 'provider' => $provider, 'from' => $from, 'to' => $to,
                'ms' => (int) round((microtime(true) - $started) * 1000),
            ]);
        } catch (\Illuminate\Validation\ValidationException $e) {
            return $this->validationErrorResponse($e);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'Mail test failed.');
        }
    }

    /**
     * Which provider each kind of mail leaves by, in order, as the running app has it.
     *
     * The host's variables decide this, and the only way to check it was to send something and
     * watch a provider's quota drop - which is how a lane spent a week on the wrong provider
     * without anyone being able to say so.
     */
    private function mailLanes(): array
    {
        $chain = function (?string $name): array {
            $name = (string) $name;
            $cfg  = config("mail.mailers.{$name}");
            if (($cfg['transport'] ?? null) === 'failover') {
                return array_values(array_filter((array) ($cfg['mailers'] ?? [])));
            }
            return $name !== '' ? [$name] : [];
        };

        return [
            'notifications' => $chain(config('mail.default')),
            'security'      => $chain(config('mail.security_mailer')),
        ];
    }

    public function show(Request $request)
    {
        try {
            $user = $request->user();
            if (!$user) return $this->unauthorizedResponse();
            if (!$this->ownsShop($request) && !$this->mayShopSettings($request, false)) return $this->unauthorizedResponse();

            // Shipping settings are always stored on the owner account
            $owner = $this->getOwner() ?? $user;

            return $this->successResponse('Settings retrieved.', [
                // Integrations: the system admin's only.
                'mailLanes'            => $this->isSystemAdmin($request) ? $this->mailLanes() : null,
                'isSystemAdmin'        => $this->isSystemAdmin($request),
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
                'designFeeMode'        => \App\Support\DesignFee::mode(),
                'productionLeadDays'   => (int)   ($owner->productionLeadDays   ?? 3),
                'depositDueDays'       => (int)   ($owner->depositDueDays       ?? 7),
                // Days a customer has to answer a proof before the order closes (terms: {proofReplyDays}).
                'proofReplyDays'       => (int)   ($owner->proofReplyDays       ?? 14),
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
                // Transit by destination. One national range promised Maguindanao the same
                // 1-2 days as a delivery across Quezon City; checkout reads this instead.
                'shippingZones'        => \App\Support\ShippingZones::all(),
                // Which weekdays the shop opens, and the dates it is shut. Every delivery
                // estimate counts in working days, so these two decide what a "3 day" promise
                // actually lands on - Christmas used to count as a working day.
                'workingDays'          => \App\Support\WorkingDays::openWeekdays(),
                'holidays'             => \App\Support\WorkingDays::extraHolidays(),
                'shippingDaysMin'      => (int)   ($owner->shippingDaysMin      ?? 1),
                'shippingDaysMax'      => (int)   ($owner->shippingDaysMax      ?? 2),
                'rushEnabled'          => (bool)  ($owner->rushEnabled          ?? true),
                // The contact form can be switched off from Settings - a public write endpoint
                // that cannot be closed is a liability if it is ever abused. Default open.
                'contactFormEnabled'   => (bool)  ($owner->contactFormEnabled   ?? true),
                // Off unless the owner turns it on: Google bills past its free allowance and has no
                // spending cap of its own, and the address fields are accurate without it.
                'googleMapsEnabled'    => (bool)  ($owner->googleMapsEnabled    ?? false),
                'contactSuccessMessage'=> $owner->contactSuccessMessage ?: null,
                'contactClosedMessage' => $owner->contactClosedMessage  ?: null,
                'rushLeadDays'         => (int)   ($owner->rushLeadDays         ?? 1),
                'rushFee'              => (float) ($owner->rushFee              ?? 150),
                // Two standing offers, off until the owner fills the box in. They are public
                // because the storefront advertises them; whether a given customer is on their
                // FIRST order is not public, and is answered by GET /api/shop/offers.
                'freeDeliveryFrom'     => \App\Support\ShopOffers::freeDeliveryFrom(),
                'firstOrderPercent'    => \App\Support\ShopOffers::firstOrderPercent(),
                'firstOrderCap'        => \App\Support\ShopOffers::firstOrderCap(),
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
            if (!$this->mayShopSettings($request, true)) return $this->unauthorizedResponse();
            // The Google Maps switch is an integration (Google bills for it). Refused rather than
            // quietly dropped, so a screen that sends it by mistake is found, not believed.
            if ($request->has('googleMapsEnabled') && !$this->isSystemAdmin($request)) {
                return $this->errorResponse('Only the system admin can switch Google Maps.', 403);
            }

            $owner = $this->getOwner();
            if (!$owner) return $this->serverErrorResponse(new \Exception('No owner'), 'Store owner not found.');

            $request->validate([
                'storeAddress'         => 'nullable|string|max:300',
                'storeAddressParts'    => 'nullable|array',
                'storeLat'             => 'nullable|numeric|between:-90,90',
                'storeLng'             => 'nullable|numeric|between:-180,180',
                // Stored on the OWNER, because that is where the storefront reads it from.
                'designRequestFee'     => 'nullable|numeric|min:0|max:99999',
                'designFeeMode'        => 'nullable|in:per_order,per_item',
                'shippingMode'         => 'nullable|string|in:distance,flat,courier_booked',
                'shippingBaseRate'     => 'nullable|numeric|min:0|max:9999',
                'shippingPerKmRate'    => 'nullable|numeric|min:0|max:9999',
                'shippingPerKmRateFar' => 'nullable|numeric|min:0|max:9999',
                'shippingTierKm'       => 'nullable|numeric|min:0|max:200',
                'flatRateInsideMetro'  => 'nullable|numeric|min:0|max:9999',
                'flatRateOutsideMetro' => 'nullable|numeric|min:0|max:9999',
                'productionLeadDays'   => 'nullable|integer|min:0|max:120',
                'depositDueDays'       => 'nullable|integer|min:1|max:60',
                'proofReplyDays'       => 'nullable|integer|min:3|max:60',
                'unpaidOrderDays'      => 'nullable|integer|min:1|max:60',
                'unpaidReadyHoldDays'  => 'nullable|integer|min:1|max:180',
                'refundDays'           => 'nullable|integer|min:1|max:60',
                'freeRevisions'        => 'nullable|integer|min:0|max:10',
                'extraRevisionFee'     => 'nullable|numeric|min:0|max:99999',
                'maxRevisions'         => 'nullable|integer|min:1|max:20',
                'shippingZones'        => 'nullable|array',
                'workingDays'          => 'nullable|array',
                'workingDays.*'        => 'integer|min:0|max:6',
                'holidays'             => 'nullable|array|max:120',
                'holidays.*'           => 'date',
                'shippingZones.*.min'  => 'nullable|integer|min:0|max:120',
                'shippingZones.*.max'  => 'nullable|integer|min:0|max:120',
                'shippingDaysMin'      => 'nullable|integer|min:0|max:120',
                'shippingDaysMax'      => 'nullable|integer|min:0|max:120',
                'rushEnabled'          => 'nullable|boolean',
                'contactFormEnabled'   => 'nullable|boolean',
                'googleMapsEnabled'    => 'nullable|boolean',
                'contactSuccessMessage'=> 'nullable|string|max:300',
                'contactClosedMessage' => 'nullable|string|max:300',
                'rushLeadDays'         => 'nullable|integer|min:0|max:120',
                'rushFee'              => 'nullable|numeric|min:0|max:99999',
                // Blank switches it off. Stored as null rather than 0 so "free from P0" - which
                // would make every order free - cannot be typed by accident.
                'freeDeliveryFrom'     => 'nullable|numeric|min:1|max:999999',
            ]);

            // What it was, so the audit entry can say what it became.
            $before = \App\Support\SettingsDiff::snapshot($owner, array_keys(\App\Support\SettingsDiff::LABELS));

            if ($request->has('storeAddress'))         $owner->storeAddress         = $request->storeAddress ?? '';
            if ($request->has('storeAddressParts'))    $owner->storeAddressParts    = $request->storeAddressParts ?? null;
            if ($request->has('storeLat'))             $owner->storeLat             = $request->storeLat !== null ? (float) $request->storeLat : null;
            if ($request->has('storeLng'))             $owner->storeLng             = $request->storeLng !== null ? (float) $request->storeLng : null;
            if ($request->has('designRequestFee'))     $owner->designRequestFee     = (float) $request->designRequestFee;
            if ($request->has('designFeeMode'))        $owner->designFeeMode        = $request->designFeeMode === 'per_item' ? 'per_item' : 'per_order';
            if ($request->has('shippingMode'))         $owner->shippingMode         = $request->shippingMode ?? 'courier_booked';
            if ($request->has('shippingBaseRate'))     $owner->shippingBaseRate     = (float) $request->shippingBaseRate;
            if ($request->has('shippingPerKmRate'))    $owner->shippingPerKmRate    = (float) $request->shippingPerKmRate;
            if ($request->has('shippingPerKmRateFar')) $owner->shippingPerKmRateFar = (float) $request->shippingPerKmRateFar;
            if ($request->has('shippingTierKm'))       $owner->shippingTierKm       = (float) $request->shippingTierKm;
            if ($request->has('flatRateInsideMetro'))  $owner->flatRateInsideMetro  = (float) $request->flatRateInsideMetro;
            if ($request->has('flatRateOutsideMetro')) $owner->flatRateOutsideMetro = (float) $request->flatRateOutsideMetro;
            if ($request->has('productionLeadDays'))   $owner->productionLeadDays   = (int) $request->productionLeadDays;
            if ($request->has('depositDueDays'))       $owner->depositDueDays       = (int) $request->depositDueDays;
            if ($request->has('proofReplyDays'))       $owner->proofReplyDays       = (int) $request->proofReplyDays;
            if ($request->has('unpaidOrderDays'))      $owner->unpaidOrderDays      = (int) $request->unpaidOrderDays;
            if ($request->has('unpaidReadyHoldDays'))  $owner->unpaidReadyHoldDays  = (int) $request->unpaidReadyHoldDays;
            if ($request->has('refundDays'))           $owner->refundDays           = (int) $request->refundDays;
            if ($request->has('freeRevisions'))        $owner->freeRevisions        = (int) $request->freeRevisions;
            if ($request->has('extraRevisionFee'))     $owner->extraRevisionFee     = (float) $request->extraRevisionFee;
            if ($request->has('maxRevisions'))         $owner->maxRevisions         = (int) $request->maxRevisions;
            if ($request->has('shippingZones'))        $owner->shippingZones        = $request->input('shippingZones');
            if ($request->has('workingDays'))          $owner->workingDays          = array_values(array_unique(array_map('intval', (array) $request->input('workingDays'))));
            if ($request->has('holidays'))             $owner->holidays             = array_values(array_unique(array_map(fn ($d) => substr((string) $d, 0, 10), (array) $request->input('holidays'))));
            if ($request->has('shippingDaysMin'))      $owner->shippingDaysMin      = (int) $request->shippingDaysMin;
            if ($request->has('shippingDaysMax'))      $owner->shippingDaysMax      = (int) $request->shippingDaysMax;
            if ($request->has('rushEnabled'))          $owner->rushEnabled          = (bool) $request->rushEnabled;
            if ($request->has('contactFormEnabled'))   $owner->contactFormEnabled   = (bool) $request->contactFormEnabled;
            if ($request->has('googleMapsEnabled'))    $owner->googleMapsEnabled    = (bool) $request->googleMapsEnabled;
            if ($request->has('contactSuccessMessage'))$owner->contactSuccessMessage= trim((string) $request->contactSuccessMessage) ?: null;
            if ($request->has('contactClosedMessage')) $owner->contactClosedMessage = trim((string) $request->contactClosedMessage) ?: null;
            if ($request->has('rushLeadDays'))         $owner->rushLeadDays         = (int) $request->rushLeadDays;
            if ($request->has('rushFee'))              $owner->rushFee              = (float) $request->rushFee;
            if ($request->has('freeDeliveryFrom')) {
                $raw = $request->input('freeDeliveryFrom');
                $owner->freeDeliveryFrom = ($raw === null || $raw === '' || (float) $raw <= 0) ? null : (float) $raw;
            }
            $owner->save();

            // Rates, turnaround promises and the free-delivery figure all change what customers
            // are charged. Who moved them, and when, is a question that gets asked later.
            // Only when something actually changed, and saying what: "Rush fee 150 -> 200".
            $changes = \App\Support\SettingsDiff::changes($before, $owner);
            if ($changes) {
                $this->logActivity($request, 'settings.changed', 'settings', null,
                    'Changed ' . \App\Support\SettingsDiff::sentence($changes),
                    ['changes' => $changes]);
            }

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
                // Days a customer has to answer a proof before the order closes (terms: {proofReplyDays}).
                'proofReplyDays'       => (int)   ($owner->proofReplyDays       ?? 14),
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
                // Transit by destination. One national range promised Maguindanao the same
                // 1-2 days as a delivery across Quezon City; checkout reads this instead.
                'shippingZones'        => \App\Support\ShippingZones::all(),
                // Which weekdays the shop opens, and the dates it is shut. Every delivery
                // estimate counts in working days, so these two decide what a "3 day" promise
                // actually lands on - Christmas used to count as a working day.
                'workingDays'          => \App\Support\WorkingDays::openWeekdays(),
                'holidays'             => \App\Support\WorkingDays::extraHolidays(),
                'shippingDaysMin'      => (int)   ($owner->shippingDaysMin      ?? 1),
                'shippingDaysMax'      => (int)   ($owner->shippingDaysMax      ?? 2),
                'rushEnabled'          => (bool)  ($owner->rushEnabled          ?? true),
                // The contact form can be switched off from Settings - a public write endpoint
                // that cannot be closed is a liability if it is ever abused. Default open.
                'contactFormEnabled'   => (bool)  ($owner->contactFormEnabled   ?? true),
                // Off unless the owner turns it on: Google bills past its free allowance and has no
                // spending cap of its own, and the address fields are accurate without it.
                'googleMapsEnabled'    => (bool)  ($owner->googleMapsEnabled    ?? false),
                'contactSuccessMessage'=> $owner->contactSuccessMessage ?: null,
                'contactClosedMessage' => $owner->contactClosedMessage  ?: null,
                'rushLeadDays'         => (int)   ($owner->rushLeadDays         ?? 1),
                'rushFee'              => (float) ($owner->rushFee              ?? 150),
                // Two standing offers, off until the owner fills the box in. They are public
                // because the storefront advertises them; whether a given customer is on their
                // FIRST order is not public, and is answered by GET /api/shop/offers.
                'freeDeliveryFrom'     => \App\Support\ShopOffers::freeDeliveryFrom(),
                'firstOrderPercent'    => \App\Support\ShopOffers::firstOrderPercent(),
                'firstOrderCap'        => \App\Support\ShopOffers::firstOrderCap(),
            ]);
        } catch (\Illuminate\Validation\ValidationException $e) {
            return $this->validationErrorResponse($e);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'Failed to save shipping settings.');
        }
    }

    /**
     * PUT /api/admin/settings/offers  {firstOrderPercent, firstOrderCap}
     *
     * The welcome discount, edited from Promotions where the owner already manages vouchers and
     * flash sales - a customer-acquisition offer belongs beside the other offers, not buried in
     * the shipping rates. The free-delivery threshold stays on Settings > Shipping, because it is
     * a shipping rate rule and only makes sense next to the mode that decides whether delivery is
     * charged at all.
     *
     * Blank means off. It is stored as null rather than zero so "0% off, capped at P0" - which
     * silently gives nothing while the screen says an offer is running - is not a state that exists.
     */
    public function offersUpdate(Request $request)
    {
        try {
            // Promotions work, like the vouchers beside it. Both offers come out of the margin.
            $u = $request->user();
            if (!$u || !\App\Support\Rbac::allowsFor($u, 'promotions.work', true)) return $this->unauthorizedResponse();

            $owner = $this->getOwner();
            if (!$owner) return $this->serverErrorResponse(new \Exception('No owner'), 'Store owner not found.');

            $request->validate([
                'firstOrderPercent' => 'nullable|integer|min:1|max:100',
                'firstOrderCap'     => 'nullable|numeric|min:1|max:999999',
                // Moved here from Shipping: it is an offer, not a rate. Blank switches it off.
                'freeDeliveryFrom'  => 'nullable|numeric|min:1|max:999999',
            ]);
            $before = \App\Support\SettingsDiff::snapshot($owner, ['firstOrderPercent', 'firstOrderCap', 'freeDeliveryFrom']);
            if ($request->has('freeDeliveryFrom')) {
                $raw = $request->input('freeDeliveryFrom');
                $owner->freeDeliveryFrom = ($raw === null || $raw === '' || (float) $raw <= 0) ? null : (float) $raw;
            }

            if ($request->has('firstOrderPercent')) {
                $raw = $request->input('firstOrderPercent');
                $owner->firstOrderPercent = ($raw === null || $raw === '' || (int) $raw <= 0) ? null : (int) $raw;
            }
            if ($request->has('firstOrderCap')) {
                $raw = $request->input('firstOrderCap');
                $owner->firstOrderCap = ($raw === null || $raw === '' || (float) $raw <= 0) ? null : (float) $raw;
            }
            $owner->save();

            $changes = \App\Support\SettingsDiff::changes($before, $owner);
            if ($changes) {
                $this->logActivity($request, 'settings.changed', 'settings', null,
                    'Changed ' . \App\Support\SettingsDiff::sentence($changes), ['changes' => $changes]);
            }

            return $this->successResponse('Offers saved.', [
                'firstOrderPercent' => \App\Support\ShopOffers::firstOrderPercent(),
                'firstOrderCap'     => \App\Support\ShopOffers::firstOrderCap(),
                'freeDeliveryFrom'  => \App\Support\ShopOffers::freeDeliveryFrom(),
            ]);
        } catch (\Illuminate\Validation\ValidationException $e) {
            return $this->validationErrorResponse($e);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'Failed to save offers.');
        }
    }

    /**
     * GET /api/shop/offers  (signed in)
     *
     * What the cart and checkout screens need to show the two standing offers honestly: the rule
     * itself, plus the one part of it that is about THIS customer - whether they have ordered here
     * before. The storefront cannot work that out on its own, and guessing it would mean promising
     * a discount at checkout that the server then refuses.
     */
    public function shopOffers(Request $request)
    {
        try {
            $user = $request->user();
            return $this->successResponse('Offers retrieved.', [
                'freeDeliveryFrom'  => \App\Support\ShopOffers::freeDeliveryFrom(),
                'firstOrderPercent' => \App\Support\ShopOffers::firstOrderPercent(),
                'firstOrderCap'     => \App\Support\ShopOffers::firstOrderCap(),
                'isFirstOrder'      => \App\Support\ShopOffers::isFirstOrder($user),
            ]);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'Failed to retrieve offers.');
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
            if (!$this->ownsShop($request)) return $this->unauthorizedResponse();
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

            $termsDelta = self::clauseDelta((array) ($owner->registrationTerms ?? []), $clean);
            $owner->registrationTerms          = $clean;
            $owner->registrationTermsVersion   = (int) ($owner->registrationTermsVersion ?? 1) + 1;
            $owner->registrationTermsUpdatedAt = now();
            $owner->save();

            // The terms are a contract. Every accepted copy is already frozen on the customer, and
            // this says who changed the wording that new customers agree to, and when.
            $this->logActivity($request, 'settings.terms_changed', 'settings', null,
                'Changed the account sign-up terms (now version ' . (int) $owner->registrationTermsVersion . ')',
                ['clauses' => count($clean), 'version' => (int) $owner->registrationTermsVersion] + $termsDelta);

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
            if (!$this->ownsShop($request)) return $this->unauthorizedResponse();
            $owner = $this->getOwner();
            if (!$owner) return $this->serverErrorResponse(new \Exception('No owner'), 'Store owner not found.');

            $validated = $request->validate([
                'customOrderTerms'          => 'present|array|max:30',
                'customOrderTerms.*.title'  => 'required|string|max:120',
                'customOrderTerms.*.body'   => 'required|string|max:2000',
                'customOrderTerms.*.mode'   => 'nullable|string|in:both,upload,request,quote',
            ]);

            $clean = array_values(array_map(fn ($t) => [
                'title' => trim(strip_tags($t['title'])),
                'body'  => trim(strip_tags($t['body'])),
                'mode'  => in_array($t['mode'] ?? 'both', ['both', 'upload', 'request', 'quote'], true) ? ($t['mode'] ?? 'both') : 'both',
            ], array_filter($validated['customOrderTerms'], fn ($t) => trim($t['title'] ?? '') !== '' && trim($t['body'] ?? '') !== '')));

            $termsDelta = self::clauseDelta((array) ($owner->customOrderTerms ?? []), $clean);
            $owner->customOrderTerms = $clean;
            $owner->termsVersion     = (int) ($owner->termsVersion ?? 1) + 1;
            $owner->termsUpdatedAt   = now();
            $owner->save();

            $this->logActivity($request, 'settings.terms_changed', 'settings', null,
                'Changed the custom order terms (now version ' . (int) $owner->termsVersion . ')',
                ['clauses' => count($clean), 'version' => (int) $owner->termsVersion] + $termsDelta);

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
            if (!$user || !$this->ownsShop($request)) return $this->unauthorizedResponse();

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
