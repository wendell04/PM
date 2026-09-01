<?php

namespace App\Support;

use App\Models\User;
use App\Models\RolePermission;

/**
 * Centralized authorization decisions — the single source of truth for RBAC.
 *
 * Authority tiers:
 *   Super Admin (system / developer)  — config('rbac.super_admin_roles')
 *   Owner       (business)            — config('rbac.owner_role')
 *   Staff       (department)          — permissions from the role_permissions grid
 *
 * Super Admin access is governed by the config('rbac.super_admin_full_access')
 * toggle: ON = unrestricted (development); OFF = scoped to system tasks only.
 *
 * Every bypass and permission check across the app funnels through here, so the
 * toggle and the Super-Admin/Owner distinction are defined in exactly one place.
 */
class Rbac
{
    public static function isSuperAdmin(?User $user): bool
    {
        if (!$user || !is_string($user->role)) return false;
        return in_array($user->role, config('rbac.super_admin_roles', ['superAdmin', 'admin']), true);
    }

    public static function isOwner(?User $user): bool
    {
        if (!$user || !is_string($user->role)) return false;
        return $user->role === config('rbac.owner_role', 'owner');
    }

    public static function superAdminFullAccess(): bool
    {
        return (bool) config('rbac.super_admin_full_access', true);
    }

    /**
     * Core decision: may this user perform the action behind $permKey?
     *
     * $permKey is a module key today (e.g. 'orders'). It already accepts dotted
     * action keys ('orders.updateStatus') so callers won't change when the
     * action-based phase lands — the module segment is used for scope matching.
     */
    public static function allows(?User $user, string $permKey): bool
    {
        if (!$user) return false;

        // ── Super Admin — the only true bypass, gated by the access toggle ──
        if (self::isSuperAdmin($user)) {
            return self::superAdminFullAccess() ? true : self::inSuperAdminScope($permKey);
        }

        // ── Owner — unrestricted business authority (Owner-scoping is a later phase) ──
        if (self::isOwner($user)) {
            return true;
        }

        // ── Staff — resolved from their role's permission grid ──
        return self::roleGrants($user->role, $permKey);
    }

    /** Is $permKey within Super Admin's scoped (system-task) responsibilities? */
    public static function inSuperAdminScope(string $permKey): bool
    {
        $scope  = config('rbac.super_admin_scope', []);
        $module = explode('.', $permKey)[0];
        return in_array($permKey, $scope, true) || in_array($module, $scope, true);
    }

    protected static function roleGrants(?string $role, string $permKey): bool
    {
        if (!is_string($role) || $role === '' || $role === 'customer') return false;
        $record = RolePermission::where('role', $role)->first();
        if (!$record) return false;
        return self::gridAllows($record->permissions ?? [], $permKey);
    }

    /**
     * Decide a permission against a role's stored grid, bridging the coarse
     * (module bool) and fine (module.action) representations so both coexist:
     *
     *   Action key ('orders.edit'):
     *     - explicit 'orders.edit' wins;
     *     - else if the role defines ANY 'orders.*' action, it is fine-grained
     *       and an unlisted action is DENIED;
     *     - else fall back to the coarse 'orders' flag (legacy all-or-nothing).
     *
     *   Module key ('orders'):
     *     - granted if the coarse flag is on OR any 'orders.*' action is on
     *       (so existing module-level controller checks keep working).
     */
    public static function gridAllows(array $perms, string $permKey): bool
    {
        if (str_contains($permKey, '.')) {
            if (array_key_exists($permKey, $perms)) return !empty($perms[$permKey]);
            $module = explode('.', $permKey, 2)[0];
            foreach ($perms as $k => $v) {
                if (is_string($k) && str_starts_with($k, $module . '.')) return false;
            }
            return !empty($perms[$module]);
        }

        if (!empty($perms[$permKey])) return true;
        $prefix = $permKey . '.';
        foreach ($perms as $k => $v) {
            if (is_string($k) && str_starts_with($k, $prefix) && !empty($v)) return true;
        }
        return false;
    }

    /**
     * Coarse admin-surface gate. Super Admin and Owner always; any other role
     * must be provisioned in the role_permissions registry. Customers, unknown,
     * empty and null roles are denied (fail closed).
     */
    public static function isStaff(?User $user): bool
    {
        if (!$user) return false;
        if (self::isSuperAdmin($user) || self::isOwner($user)) return true;
        $role = $user->role;
        return is_string($role) && $role !== '' && $role !== 'customer'
            && RolePermission::where('role', $role)->exists();
    }

    /**
     * Authority rank of a role (higher = more powerful). Drives escalation
     * guards. Unknown provisioned staff roles fall back to default_staff_rank.
     */
    public static function rank(?string $role): int
    {
        if (!is_string($role) || $role === '' || $role === 'customer') return 0;
        $ranks = config('rbac.role_ranks', []);
        return array_key_exists($role, $ranks)
            ? (int) $ranks[$role]
            : (int) config('rbac.default_staff_rank', 10);
    }

    /**
     * May $actor grant the role $targetRoleKey to a user?
     *   - Super Admin roles are NEVER assignable through the staff flow.
     *   - Only a Super Admin may designate an Owner.
     *   - Otherwise the actor must strictly outrank the role being granted,
     *     which blocks self-promotion and sideways/upward assignment.
     */
    public static function canAssignRole(?User $actor, string $targetRoleKey): bool
    {
        if (!$actor) return false;

        if (in_array($targetRoleKey, config('rbac.super_admin_roles', ['superAdmin', 'admin']), true)) {
            return false;
        }
        if ($targetRoleKey === config('rbac.owner_role', 'owner')) {
            return self::isSuperAdmin($actor);
        }
        return self::rank($actor->role) > self::rank($targetRoleKey);
    }

    /**
     * Effective permission map returned to the frontend for `can()`. Keyed by
     * the modules in RolePermission::defaultPermissions(). Reflects the Super
     * Admin toggle, so the UI honors scoped mode the moment it's flipped.
     */
    public static function effectivePermissions(?User $user): array
    {
        $all = RolePermission::defaultPermissions();

        if (self::isSuperAdmin($user)) {
            if (self::superAdminFullAccess()) {
                return array_map(fn() => true, $all);
            }
            $out = [];
            foreach ($all as $key => $_) {
                $out[$key] = self::inSuperAdminScope($key);
            }
            return $out;
        }

        if (self::isOwner($user)) {
            return array_map(fn() => true, $all);
        }

        return RolePermission::forRole($user->role);
    }
}
