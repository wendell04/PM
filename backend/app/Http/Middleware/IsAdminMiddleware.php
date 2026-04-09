<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;

class IsAdminMiddleware
{
    public function handle(Request $request, Closure $next)
    {
        $user = $request->user();

        if (!$user || !in_array($user->role, ['admin', 'owner'])) {
            return response()->json(['error' => 'Forbidden'], 403);
        }

        return $next($request);
    }
}
