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
}
