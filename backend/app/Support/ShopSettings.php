<?php

namespace App\Support;

use App\Models\User;

/**
 * Who holds the shop's settings.
 *
 * The settings screen writes to `User::where('role','owner')->first() ?? admin`, and no account on
 * this installation has the role `owner` - the shop runs on an `admin`. So the write lands on the
 * admin while every reader asking only for `owner` gets null and silently falls back to a
 * hardcoded default.
 *
 * Nothing looked broken because the saved values happened to equal the defaults. Change
 * "Standard: 3 days" to 5 and orders keep promising 3; change unpaidOrderDays and the expiry job
 * ignores it. One lookup, one fallback, used by writers and readers alike.
 */
class ShopSettings
{
    public static function owner(): ?User
    {
        static $cached = false;
        static $user   = null;
        if ($cached) return $user;
        $cached = true;

        // The account that ALREADY HOLDS the settings, whichever it is. Picking "the first owner"
        // meant the day a store owner account was created, every rate, delivery promise and term
        // would be read from her empty record and fall back to defaults - the shop would change
        // its promises to customers without anyone touching a setting. A settings holder has
        // saved shipping at least once; an owner holding them wins over an admin holding them.
        $owner  = config('rbac.owner_role', 'owner');
        $admins = config('rbac.super_admin_roles', ['superAdmin', 'admin']);
        $holds  = fn ($q) => $q->whereNotNull('shippingMode')->orWhereNotNull('productionLeadDays')->orWhereNotNull('customOrderTerms');

        $user = User::where('role', $owner)->where($holds)->first()
            ?? User::whereIn('role', $admins)->where($holds)->first()
            // Nothing saved yet anywhere: the first owner, else the first admin (as before).
            ?? User::where('role', $owner)->first()
            ?? User::whereIn('role', $admins)->first();

        return $user;
    }

    /** One setting, with the caller's default when the shop has not set it. */
    public static function get(string $key, $default = null)
    {
        $owner = self::owner();
        $value = $owner?->{$key} ?? null;
        return $value === null || $value === '' ? $default : $value;
    }
}
