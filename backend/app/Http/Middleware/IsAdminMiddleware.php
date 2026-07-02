<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;

class IsAdminMiddleware
{
    public function handle(Request $request, Closure $next, string ...$roles)
    {
        $user = $request->user();

        if (!$user) {
            return response()->json(['message' => 'Unauthenticated.'], 401);
        }

        // If specific roles are passed to the middleware, enforce them
        if (count($roles) > 0) {
            if (!in_array($user->role, array_merge(['admin', 'owner'], $roles))) {
                return response()->json(['message' => 'Forbidden. Insufficient role.'], 403);
            }
            return $next($request);
        }

        // No specific roles required — but FAIL CLOSED: allow only provisioned staff, instead of
        // "anything that isn't literally 'customer'" (which would let a null/empty/unknown role in).
        // Built-in admin/owner always pass; any other role must exist in the role_permissions
        // registry, where staff roles are provisioned — so custom roles created via the admin UI
        // still work, while customers and any null/empty/unknown/future role are denied by default.
        // Fine-grained per-feature checks still happen per-controller via hasPermission().
        $role = $user->role;

        if ($role === 'admin' || $role === 'owner') {
            return $next($request);
        }

        if (
            is_string($role) && $role !== '' && $role !== 'customer'
            && \App\Models\RolePermission::where('role', $role)->exists()
        ) {
            return $next($request);
        }

        return response()->json(['message' => 'Forbidden. Admin access required.'], 403);
    }
}
