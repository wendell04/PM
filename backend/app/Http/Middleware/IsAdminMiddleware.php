<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use App\Support\Rbac;

class IsAdminMiddleware
{
    public function handle(Request $request, Closure $next, string ...$roles)
    {
        $user = $request->user();

        if (!$user) {
            return response()->json(['message' => 'Unauthenticated.'], 401);
        }

        $isSuper = Rbac::isSuperAdmin($user);
        $isOwner = Rbac::isOwner($user);

        // If specific roles are passed to the middleware, enforce them.
        // Super Admin and Owner always pass; otherwise the role must be listed.
        if (count($roles) > 0) {
            if ($isSuper || $isOwner || in_array($user->role, $roles, true)) {
                return $next($request);
            }
            return response()->json(['message' => 'Forbidden. Insufficient role.'], 403);
        }

        // No specific roles required — FAIL CLOSED via the central staff gate:
        // Super Admin / Owner always pass; any other role must be provisioned in
        // the role_permissions registry. Customers and any null/empty/unknown
        // role are denied. Fine-grained per-feature checks still run per-controller
        // via hasPermission() — this is only the coarse admin-surface gate.
        if (Rbac::isStaff($user)) {
            return $next($request);
        }

        return response()->json(['message' => 'Forbidden. Admin access required.'], 403);
    }
}
