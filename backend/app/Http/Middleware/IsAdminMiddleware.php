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
            return response()->json(['error' => 'Unauthenticated'], 401);
        }

        // If specific roles are passed to the middleware, enforce them
        if (count($roles) > 0) {
            if (!in_array($user->role, array_merge(['admin', 'owner'], $roles))) {
                return response()->json(['error' => 'Forbidden'], 403);
            }
            return $next($request);
        }

        // No specific roles — allow any non-customer staff member through.
        // Fine-grained permission checks are handled per-controller via hasPermission().
        if ($user->role === 'customer') {
            return response()->json(['error' => 'Forbidden'], 403);
        }

        return $next($request);
    }
}
