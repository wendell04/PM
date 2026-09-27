<?php

namespace App\Support;

use App\Models\User;

/**
 * Who is the SHOP in a customer conversation.
 *
 * Seven places in the chat decided this by role name - admin or owner - so the inbox could never be
 * handed to a staff member, and a role called "Administrator" (a staff template, not the system
 * admin) was shut out of it. The Messages row in Staff and access decides it now:
 *   see  (messages.view) - read the shop's conversations;
 *   work (messages.work) - reply, send order forms, quote from the chat.
 * Owner and system admin always have both.
 */
class ChatAccess
{
    public static function shopSide(?User $user): bool
    {
        if (!$user || ($user->role ?? 'customer') === 'customer') return false;
        return Rbac::isSuperAdmin($user) || Rbac::isOwner($user) || Rbac::allows($user, 'messages.view');
    }

    public static function canReply(?User $user): bool
    {
        if (!$user || ($user->role ?? 'customer') === 'customer') return false;
        return Rbac::isSuperAdmin($user) || Rbac::isOwner($user) || Rbac::allows($user, 'messages.work');
    }

    private static ?string $shopId = null;

    /**
     * The one account every customer conversation is held with - "the shop".
     *
     * Each caller used to take whichever admin or owner the database returned first, and the owner
     * and system admin each wrote as themselves, so one customer could end up with a thread per
     * person on the shop side. The oldest admin/owner account is the one the existing threads were
     * opened with, so choosing it by age keeps them where they are.
     */
    public static function shopAccount(): ?User
    {
        if (self::$shopId !== null) return User::find(self::$shopId);
        $shop = User::whereIn('role', ['admin', 'owner'])->orderBy('created_at', 'asc')->first();
        self::$shopId = $shop ? (string) $shop->_id : null;
        return $shop;
    }

    /** The name a customer sees for the shop: the store name from Settings, never a person's. */
    public static function shopDisplayName(): string
    {
        $name = trim((string) (ShopSettings::owner()?->storeName ?? ''));
        return $name !== '' ? $name : 'Personalize Me Prints';
    }
}
