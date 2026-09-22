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

        $templates = RolePermission::all()->map(fn ($r) => [
            'role'        => $r->role,
            'label'       => $r->label ?: $this->humanRole($r->role),
            'permissions' => PermissionCatalog::normalize((array) ($r->permissions ?? [])),
        ])->values();

        return $this->successResponse('Catalog fetched.', [
            'groups'    => PermissionCatalog::groups(),
            'templates' => $templates,
        ]);
    }

    /** GET /api/admin/access/staff - everyone who is not a customer, with their effective grid. */
    public function staff(Request $request)
    {
        if (!$this->hasPermission($request, 'userManagement.view')) {
            return $this->unauthorizedResponse();
        }

        $rows = User::where('role', '!=', 'customer')->orderBy('firstName')->get()
            ->map(function (User $u) {
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
                ];
            })->values();

        return $this->successResponse('Staff fetched.', $rows);
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

        $grid = PermissionCatalog::sanitize((array) $request->input('permissions', []));

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

        $grid = PermissionCatalog::sanitize($validated['permissions'] ?? []);

        // Nobody may grant what they do not hold. Without this, a staff member with
        // userManagement.edit could hand themselves the whole shop through a colleague's account.
        if (!Rbac::isOwner($editor) && !Rbac::isSuperAdmin($editor)) {
            foreach (array_keys($grid) as $key) {
                if (!Rbac::allows($editor, $key)) {
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
