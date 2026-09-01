<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use App\Models\RolePermission;
use App\Models\User;

class RolePermissionController extends Controller
{
    protected array $protectedRoles = ['superAdmin', 'admin', 'owner', 'customer'];

    private function labelFromRole(string $role): string
    {
        return trim(ucwords(preg_replace('/(?<=[a-z])(?=[A-Z])/', ' ', $role)));
    }

    /**
     * GET /api/admin/role-permissions
     * Returns all staff roles with their permissions (fetched from DB).
     */
    public function index(Request $request)
    {
        try {
            if (!$this->isAdmin($request)) {
                return $this->unauthorizedResponse();
            }

            $records = RolePermission::all();
            $result  = [];

            foreach ($records as $record) {
                $result[$record->role] = [
                    'label'       => $record->label ?? $this->labelFromRole($record->role),
                    'permissions' => array_merge(RolePermission::defaultPermissions(), $record->permissions ?? []),
                ];
            }

            return $this->successResponse('Role permissions fetched successfully.', $result);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'Failed to fetch role permissions.');
        }
    }

    /**
     * POST /api/admin/role-permissions
     * Create a new custom staff role.
     */
    public function store(Request $request)
    {
        try {
            if (!$this->isAdmin($request)) {
                return $this->unauthorizedResponse();
            }

            $validated = $request->validate([
                'label' => 'required|string|max:60',
                'role'  => 'sometimes|string|max:60|regex:/^[a-zA-Z][a-zA-Z0-9_]*$/',
            ]);

            $label = trim($validated['label']);
            // If no explicit key, derive camelCase from label (e.g. "Graphic Designer" → "graphicDesigner")
            $role  = $validated['role'] ?? lcfirst(str_replace(' ', '', ucwords($label)));

            if (in_array($role, $this->protectedRoles)) {
                return $this->errorResponse('Cannot create a protected role.', 422);
            }

            if (RolePermission::where('role', $role)->exists()) {
                return $this->errorResponse('A role with this key already exists.', 422);
            }

            $record = RolePermission::create([
                'role'        => $role,
                'label'       => $label,
                'permissions' => RolePermission::defaultPermissions(),
                'updatedBy'   => (string) $request->user()->_id,
                'updatedAt'   => now(),
            ]);

            $this->logActivity(
                $request, 'role.created', 'role', $role,
                "Created role {$label} ({$role})",
                ['role' => $role, 'label' => $label]
            );

            return $this->successResponse('Role created successfully.', [
                'role'        => $role,
                'label'       => $label,
                'permissions' => RolePermission::defaultPermissions(),
            ], 201);
        } catch (\Illuminate\Validation\ValidationException $e) {
            return $this->validationErrorResponse($e);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'Failed to create role.');
        }
    }

    /**
     * GET /api/my/permissions
     * Returns permissions for the currently authenticated staff user.
     */
    public function myPermissions(Request $request)
    {
        try {
            $user = $request->user();
            if (!$user) return $this->unauthorizedResponse();

            $userId = (string) ($user->_id ?? $user->id);
            $data   = Cache::remember("admin_permissions_{$userId}", 60, function () use ($user) {
                // Centralized: Super Admin reflects the access toggle, Owner has
                // business authority, staff resolve from their role grid.
                return [
                    'role'          => $user->role,
                    'is_super_admin' => \App\Support\Rbac::isSuperAdmin($user),
                    'full_access'   => \App\Support\Rbac::isSuperAdmin($user)
                                        ? \App\Support\Rbac::superAdminFullAccess() : null,
                    'permissions'   => \App\Support\Rbac::effectivePermissions($user),
                ];
            });

            return $this->successResponse('Permissions fetched.', $data);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'Failed to fetch permissions.');
        }
    }

    /**
     * PUT /api/admin/role-permissions/{role}
     * Update permissions for a specific role (must exist in DB).
     */
    public function update(Request $request, string $role)
    {
        try {
            if (!$this->isAdmin($request)) {
                return $this->unauthorizedResponse();
            }

            // Protected system/business roles cannot be reconfigured through the
            // normal permission UI (prevents removing Super Admin/Owner authority).
            if (in_array($role, $this->protectedRoles, true)) {
                return $this->errorResponse('This is a protected role and cannot be modified here.', 422);
            }

            $record = RolePermission::where('role', $role)->first();
            if (!$record) {
                return $this->errorResponse('Role not found.', 404);
            }

            $permissions = $request->input('permissions', []);
            // Accept both coarse module keys and fine action keys (module.action),
            // so the current module-toggle UI and the future action UI both work.
            $allowed     = array_merge(
                array_keys(RolePermission::defaultPermissions()),
                RolePermission::actionKeys()
            );
            $filtered    = array_filter(
                $permissions,
                fn($k) => in_array($k, $allowed, true),
                ARRAY_FILTER_USE_KEY
            );

            $record->permissions = $filtered;
            $record->updatedBy   = (string) $request->user()->_id;
            $record->updatedAt   = now();
            $record->save();

            // Invalidate per-user permission caches for all staff with this role
            $affected = User::where('role', $role)->pluck('_id');
            foreach ($affected as $uid) {
                Cache::forget("admin_permissions_{$uid}");
            }

            $this->logActivity(
                $request, 'role.permissions_changed', 'role', $role,
                "Updated permissions for role {$role}",
                ['role' => $role, 'affectedUsers' => $affected->count()]
            );

            return $this->successResponse('Role permissions updated successfully.', [
                'role'        => $role,
                'label'       => $record->label ?? $this->labelFromRole($role),
                'permissions' => RolePermission::forRole($role),
            ]);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'Failed to update role permissions.');
        }
    }

    /**
     * DELETE /api/admin/role-permissions/{role}
     * Delete a custom role (only if no staff are assigned to it).
     */
    public function destroy(Request $request, string $role)
    {
        try {
            if (!$this->isAdmin($request)) {
                return $this->unauthorizedResponse();
            }

            if (in_array($role, $this->protectedRoles)) {
                return $this->errorResponse('Cannot delete a protected role.', 422);
            }

            $record = RolePermission::where('role', $role)->first();
            if (!$record) {
                return $this->notFoundResponse('Role');
            }

            $count = User::where('role', $role)->count();
            if ($count > 0) {
                return $this->errorResponse(
                    "Cannot delete: {$count} staff member(s) are assigned this role. Reassign them first.",
                    422
                );
            }

            $record->delete();

            $this->logActivity(
                $request, 'role.deleted', 'role', $role,
                "Deleted role {$role}",
                ['role' => $role]
            );

            return $this->successResponse('Role deleted successfully.');
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'Failed to delete role.');
        }
    }
}
