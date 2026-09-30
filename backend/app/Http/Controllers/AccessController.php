<?php

namespace App\Http\Controllers;

use App\Models\RolePermission;
use App\Models\User;
use App\Support\PermissionCatalog;
use App\Support\Rbac;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;

/**
 * Access: who works here and what each of them may do.
 *
 * Replaces the Staff and Permissions pair, where access could only be set on a ROLE and a person
 * could only be handed one. That model needs a new role every time two people share a job title
 * but not the same duties, so the role list turns into a list of individuals. The permissions
 * live on the person here; a role is a template that fills the ticks in.
 *
 * Built beside the old screens rather than replacing them, so the old ones can be removed once
 * this is proven on real staff.
 */
class AccessController extends Controller
{
    /** GET /api/admin/access/catalog - what can be granted, grouped and labelled. */
    public function catalog(Request $request)
    {
        if (!$this->hasPermission($request, 'userManagement.view')) {
            return $this->unauthorizedResponse();
        }

        // Highest level first (Administrator, Manager, then the staff roles, then custom ones), so the
        // list reads like the team does. It came back in database order: Production Staff on top.
        $templates = RolePermission::all()->map(fn ($r) => [
            'role'        => $r->role,
            'label'       => $r->label ?: $this->humanRole($r->role),
            'permissions' => PermissionCatalog::normalize((array) ($r->permissions ?? [])),
            'rank'        => Rbac::rank($r->role),
        ])->sortBy([['rank', 'desc'], ['label', 'asc']])->values();

        // What the person looking may do here, so the page offers only that. The server still
        // checks every save; this only keeps buttons that would be refused off the screen.
        $me = $request->user();
        $top = Rbac::isSuperAdmin($me) || Rbac::isOwner($me);
        $assignable = $templates->pluck('role')->filter(fn ($r) => Rbac::canAssignRole($me, (string) $r))->values();
        if (Rbac::canAssignRole($me, config('rbac.owner_role', 'owner'))) $assignable->push(config('rbac.owner_role', 'owner'));

        return $this->successResponse('Catalog fetched.', [
            'groups'    => PermissionCatalog::groups(),
            // The same catalogue as rows (one per sidebar entry, See / Work / extras) - what the
            // Access editor draws.
            'rows'      => PermissionCatalog::rows(),
            'templates' => $templates,
            'viewer'    => [
                'role'        => $me->role,
                'manageRoles' => $top,
                'canCreate'   => Rbac::allowsFor($me, 'userManagement.create', true),
                'canEdit'     => Rbac::allowsFor($me, 'userManagement.edit', true),
                'assignable'  => $assignable,
                // Below the owner, nobody gives what they do not hold: the page greys those out.
                'grid'        => $top ? null : Rbac::effectivePermissions($me),
            ],
        ]);
    }

    /** GET /api/admin/access/staff - everyone who is not a customer, with their effective grid. */
    public function staff(Request $request)
    {
        if (!$this->hasPermission($request, 'userManagement.view')) {
            return $this->unauthorizedResponse();
        }

        $me = $request->user();
        // May the person looking change this one: only people below them, never themselves.
        $below = fn (User $u) => (string) $u->_id !== (string) $me->_id
            && !Rbac::isOwner($u) && !Rbac::isSuperAdmin($u)
            && (Rbac::isSuperAdmin($me) || Rbac::rank($me->role) > Rbac::rank($u->role));

        $rows = User::where('role', '!=', 'customer')->orderBy('firstName')->get()
            ->map(function (User $u) use ($below) {
                $own = is_array($u->permissions ?? null) ? PermissionCatalog::normalize($u->permissions) : [];
                // Owner and Super Admin are not grantable - saying so on screen is better than
                // showing a grid of ticks that the resolver ignores anyway.
                $unlimited = Rbac::isOwner($u) || Rbac::isSuperAdmin($u);
                return [
                    'id'          => (string) $u->_id,
                    'firstName'   => $u->firstName,
                    'lastName'    => $u->lastName,
                    'email'       => $u->email,
                    'role'        => $u->role,
                    'roleLabel'   => $this->humanRole($u->role),
                    'isActive'    => $u->isActive ?? true,
                    'unlimited'   => $unlimited,
                    'source'      => $unlimited ? 'unlimited' : ($own !== [] ? 'person' : 'template'),
                    'permissions' => $own !== [] ? $own : PermissionCatalog::template((string) $u->role),
                    'lastLogin'   => $u->lastLogin,
                    // A customer's own account given staff access. Removing them hands it back.
                    'fromCustomer' => (bool) ($u->promotedFromCustomer ?? false),
                    'deactivated'  => false,
                    'manageable'   => $below($u),
                ];
            })->values();

        // Deactivated staff: customer accounts now, listed so they can be reactivated.
        $off = User::where('role', 'customer')->whereNotNull('deactivatedRole')->orderBy('firstName')->get()
            ->map(fn (User $u) => [
                'manageable'    => Rbac::canAssignRole($me, (string) $u->deactivatedRole),
                'id'            => (string) $u->_id,
                'firstName'     => $u->firstName,
                'lastName'      => $u->lastName,
                'email'         => $u->email,
                'role'          => 'customer',
                'roleLabel'     => $this->humanRole($u->deactivatedRole),
                'unlimited'     => false,
                'source'        => 'template',
                'permissions'   => [],
                'lastLogin'     => $u->lastLogin,
                'fromCustomer'  => (bool) ($u->deactivatedFromCustomer ?? false),
                'deactivated'   => true,
                'deactivatedAt' => $u->deactivatedAt,
            ])->values();

        return $this->successResponse('Staff fetched.', $rows->concat($off)->values());
    }

    /**
     * POST /api/admin/access/staff - add a person and set what they can do, in one step.
     *
     * Adding someone used to mean the Staff page to create the account and this page to say what
     * they may touch, which is the two-step the owner objected to. Creation delegates to
     * StaffController so the escalation guard, the email rules and the welcome mail stay in one
     * place; the only thing added here is saving the ticks at the same moment.
     */
    public function createStaff(Request $request, StaffController $staff)
    {
        if (!$this->hasPermission($request, 'userManagement.create')) {
            return $this->unauthorizedResponse();
        }

        $grid = Rbac::stripPeopleKeys(PermissionCatalog::sanitize((array) $request->input('permissions', [])), (string) $request->input('role'));

        // Same rule as editing: nobody hands out what they do not hold.
        $editor = $request->user();
        if (!Rbac::isOwner($editor) && !Rbac::isSuperAdmin($editor)) {
            foreach (array_keys($grid) as $key) {
                if (!Rbac::allows($editor, $key)) {
                    return $this->errorResponse("You cannot grant \"{$key}\" because you do not have it yourself.", 422);
                }
            }
        }

        $created = $staff->store($request);
        $body    = json_decode($created->getContent(), true);
        if ($created->getStatusCode() >= 300) {
            return $created;   // the escalation guard or a duplicate email - pass it through as-is
        }

        $id = $body['data']['id'] ?? $body['data']['_id'] ?? null;
        if ($id && $grid !== []) {
            $user = User::find($id);
            if ($user) {
                $user->permissions = $grid;
                $user->save();
            }
        }

        return $this->successResponse(
            $grid === []
                ? 'Added. They follow their role template until you tick something for them.'
                : 'Added, with the permissions you ticked.',
            ['id' => $id, 'permissions' => $grid]
        );
    }

    /** PUT /api/admin/access/staff/{id} - save this person's own grid. */
    public function updateStaff(Request $request, $id)
    {
        if (!$this->hasPermission($request, 'userManagement.edit')) {
            return $this->unauthorizedResponse();
        }

        $user = User::find($id);
        if (!$user) return $this->notFoundResponse('Staff member');

        if (Rbac::isOwner($user) || Rbac::isSuperAdmin($user)) {
            return $this->errorResponse('The owner and super admin cannot be limited. That is deliberate - somebody has to be able to undo a mistake in here.', 422);
        }

        $editor = $request->user();
        if ((string) $user->_id === (string) $editor->_id) {
            return $this->errorResponse('You cannot change your own permissions. Ask the owner.', 422);
        }

        $validated = $request->validate([
            'permissions'   => 'present|array',
            'permissions.*' => 'boolean',
            'role'          => 'nullable|string|max:40',
            'isActive'      => 'nullable|boolean',
        ]);

        // Only someone above them edits them, and a role change passes the same rule as creating
        // someone with that role. Without this the role field took any value: an owner could make
        // a staff member Super Admin, and a scoped Super Admin could make one an owner.
        if (!Rbac::isSuperAdmin($editor) && Rbac::rank($editor->role) <= Rbac::rank($user->role)) {
            return $this->errorResponse('You cannot change someone at or above your own level.', 403);
        }
        $newRole = $validated['role'] ?? null;
        if ($newRole && $newRole !== $user->role) {
            $known = array_key_exists($newRole, (array) config('rbac.role_ranks', []))
                || \App\Models\RolePermission::where('role', $newRole)->exists();
            if (!$known || !Rbac::canAssignRole($editor, $newRole)) {
                return $this->errorResponse('You cannot give that role.', 403);
            }
        }

        $grid = Rbac::stripPeopleKeys(PermissionCatalog::sanitize($validated['permissions'] ?? []), $newRole ?: $user->role);

        // Nobody may grant what they do not hold. Without this, a staff member with
        // userManagement.edit could hand themselves the whole shop through a colleague's account.
        // Ticks the person already has are theirs to keep (the owner gave them); only adding
        // something the editor lacks is refused, or one missing tick would block every edit.
        if (!Rbac::isOwner($editor) && !Rbac::isSuperAdmin($editor)) {
            $current = Rbac::grid($user);
            foreach (array_keys($grid) as $key) {
                if (!Rbac::allows($editor, $key) && empty($current[$key])) {
                    return $this->errorResponse("You cannot grant \"{$key}\" because you do not have it yourself.", 422);
                }
            }
        }

        $user->permissions = $grid;
        if (array_key_exists('role', $validated) && $validated['role']) $user->role = $validated['role'];
        if (array_key_exists('isActive', $validated) && $validated['isActive'] !== null) $user->isActive = (bool) $validated['isActive'];
        $user->save();
        // Their sidebar reads a 60-second cache; without this the change showed up to a minute late.
        Cache::forget('admin_permissions_' . (string) $user->_id);

        return $this->successResponse('Permissions saved.', [
            'id'          => (string) $user->_id,
            'permissions' => $grid,
            'source'      => $grid !== [] ? 'person' : 'template',
        ]);
    }

    /**
     * POST /api/admin/access/staff/{id}/deactivate - take someone off the team without losing them.
     *
     * The account stays and becomes a customer account: they can still sign in and shop, their name
     * stays on every order, job and log they touched, and the dashboard closes to them. Their role and
     * ticks are kept aside so Reactivate puts them back exactly as they were. Deleting a person who
     * leaves lost all of that.
     */
    public function deactivate(Request $request, $id)
    {
        if (!$this->hasPermission($request, 'userManagement.edit')) {
            return $this->unauthorizedResponse();
        }
        $user = User::find($id);
        if (!$user || ($user->role ?? 'customer') === 'customer') return $this->notFoundResponse('Staff member');
        if (Rbac::isOwner($user) || Rbac::isSuperAdmin($user)) {
            return $this->errorResponse('The owner and super admin cannot be deactivated.', 422);
        }
        if ((string) $user->_id === (string) $request->user()->_id) {
            return $this->errorResponse('You cannot deactivate your own account.', 422);
        }
        if (Rbac::rank($request->user()->role) <= Rbac::rank($user->role)) {
            return $this->errorResponse('You cannot deactivate someone at or above your own level.', 403);
        }

        $oldRole = $user->role;
        $user->deactivatedRole         = $oldRole;
        $user->deactivatedPermissions  = is_array($user->permissions ?? null) ? $user->permissions : null;
        $user->deactivatedFromCustomer = (bool) ($user->promotedFromCustomer ?? false);
        $user->deactivatedAt           = now();
        $user->role                    = 'customer';
        $user->permissions             = null;
        $user->promotedFromCustomer    = null;
        $user->save();
        // Signed out everywhere, so an open tab does not keep showing the dashboard.
        $user->tokens()->delete();
        Cache::forget('admin_permissions_' . (string) $user->_id);

        $this->logActivity($request, 'user.deactivated', 'user', (string) $user->_id,
            "Deactivated {$user->email} ({$oldRole}); account kept as a customer",
            ['email' => $user->email, 'from' => $oldRole, 'to' => 'customer']);

        return $this->successResponse("{$user->firstName} is deactivated. They can still shop as a customer; Reactivate gives their access back.");
    }

    /** POST /api/admin/access/staff/{id}/reactivate - restore the role and ticks kept at deactivation. */
    public function reactivate(Request $request, $id)
    {
        if (!$this->hasPermission($request, 'userManagement.edit')) {
            return $this->unauthorizedResponse();
        }
        $user = User::find($id);
        if (!$user || empty($user->deactivatedRole)) return $this->notFoundResponse('Deactivated staff member');
        if (!Rbac::canAssignRole($request->user(), $user->deactivatedRole)) {
            return $this->errorResponse('You cannot give back a role at or above your own level.', 403);
        }

        $role = $user->deactivatedRole;
        $user->role                 = $role;
        $user->permissions          = $user->deactivatedPermissions ?: null;
        $user->promotedFromCustomer = ($user->deactivatedFromCustomer ?? false) ?: null;
        $user->deactivatedRole = $user->deactivatedPermissions = $user->deactivatedFromCustomer = $user->deactivatedAt = null;
        $user->save();
        Cache::forget('admin_permissions_' . (string) $user->_id);

        $this->logActivity($request, 'user.reactivated', 'user', (string) $user->_id,
            "Reactivated {$user->email} as {$role}",
            ['email' => $user->email, 'from' => 'customer', 'to' => $role]);

        return $this->successResponse("{$user->firstName} is active again, with the access they had before.");
    }

    private function humanRole(?string $role): string
    {
        $map = [
            'superAdmin'      => 'Super Admin',
            'admin'           => 'Super Admin',
            'owner'           => 'Store Owner',
            'administrator'   => 'Administrator',
            'manager'         => 'Manager',
            'salesStaff'      => 'Sales',
            'productionStaff' => 'Production',
            'inventoryStaff'  => 'Inventory',
            'financeStaff'    => 'Finance',
            'designer'        => 'Designer',
        ];
        if (!$role) return 'Staff';
        return $map[$role] ?? ucfirst(preg_replace('/(?<!^)[A-Z]/', ' $0', $role));
    }
}
