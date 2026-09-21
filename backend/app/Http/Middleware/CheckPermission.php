<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use App\Support\Rbac;

/**
 * Route-level permission gate. Requires ANY of the given permission keys -
 * e.g. `permission:banners` or `permission:jobOrders,production` (matching
 * hasAnyPermission semantics for screens that serve more than one role).
 *
 * The decision is delegated to App\Support\Rbac (the single source of truth),
 * so Super Admin's access toggle and the Super-Admin/Owner distinction apply
 * here identically to the controller-level checks. Use this on admin routes
 * whose controller does not already enforce a permission of its own, so no
 * sensitive endpoint is reachable just by knowing its URL.
 */
class CheckPermission
{
    public function handle(Request $request, Closure $next, string ...$keys)
    {
        $user = $request->user();
        if (!$user) {
            return response()->json(['message' => 'Unauthenticated.'], 401);
        }

        // A write needs a doing-tick, not only the seeing one - see Rbac::allowsFor.
        $write = !in_array(strtoupper($request->method()), ['GET', 'HEAD', 'OPTIONS'], true);
        foreach ($keys as $key) {
            if (Rbac::allowsFor($user, $key, $write)) {
                return $next($request);
            }
        }

        return response()->json([
            'message' => 'Forbidden. You do not have permission to perform this action.',
        ], 403);
    }
}
