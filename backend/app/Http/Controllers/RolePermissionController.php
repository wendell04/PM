<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\RolePermission;

class RolePermissionController extends Controller
{
    protected array $staffRoles = [
        'salesRep',
        'productionOperator',
        'qualityControl',
        'cashier',
        'inventoryManager',
    ];

    /**
     * GET /api/admin/role-permissions
     * Returns permissions for all staff roles.
     * Admin/owner always have full access — not stored here.
     */
    public function index(Request $request)
    {
        try {
            if (!$this->isAdmin($request)) {
                return $this->unauthorizedResponse();
            }

            $result = [];
            foreach ($this->staffRoles as $role) {
                $result[$role] = RolePermission::forRole($role);
            }

            return $this->successResponse('Role permissions fetched successfully.', $result);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'Failed to fetch role permissions.');
        }
    }

    /**
     * GET /api/admin/role-permissions/my
     * Returns permissions for the currently authenticated staff user.
     * Used by frontend on dashboard mount to determine sidebar visibility.
     */
    public function myPermissions(Request $request)
    {
        try {
            $user = $request->user();
            if (!$user) return $this->unauthorizedResponse();

            // Admin and owner have full access to everything
            if (in_array($user->role, ['admin', 'owner'])) {
                $all = RolePermission::defaultPermissions();
                $full = array_map(fn() => true, $all);
                return $this->successResponse('Permissions fetched.', [
                    'role'        => $user->role,
                    'permissions' => $full,
                ]);
            }

            return $this->successResponse('Permissions fetched.', [
                'role'        => $user->role,
                'permissions' => RolePermission::forRole($user->role),
            ]);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'Failed to fetch permissions.');
        }
    }

    /**
     * PUT /api/admin/role-permissions/{role}
     * Updates permissions for a specific role.
     * Admin/owner only.
     */
    public function update(Request $request, string $role)
    {
        try {
            if (!$this->isAdmin($request)) {
                return $this->unauthorizedResponse();
            }

            if (!in_array($role, $this->staffRoles)) {
                return $this->errorResponse('Invalid role.', 422);
            }

            $permissions = $request->input('permissions', []);

            // Validate — only known keys allowed
            $allowed = array_keys(RolePermission::defaultPermissions());
            $filtered = array_filter(
                $permissions,
                fn($k) => in_array($k, $allowed),
                ARRAY_FILTER_USE_KEY
            );

            $record = RolePermission::where('role', $role)->first();
            if ($record) {
                $record->permissions = $filtered;
                $record->updatedBy   = (string) $request->user()->_id;
                $record->updatedAt   = now();
                $record->save();
            } else {
                RolePermission::create([
                    'role'        => $role,
                    'permissions' => $filtered,
                    'updatedBy'   => (string) $request->user()->_id,
                    'updatedAt'   => now(),
                ]);
            }

            return $this->successResponse('Role permissions updated successfully.', [
                'role'        => $role,
                'permissions' => RolePermission::forRole($role),
            ]);
        } catch (\Exception $e) {
            return $this->serverErrorResponse($e, 'Failed to update role permissions.');
        }
    }
}
