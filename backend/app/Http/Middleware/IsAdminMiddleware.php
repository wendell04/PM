<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;

class IsAdminMiddleware
{
    private const ALL_STAFF = [
        'admin',
        'owner',
        'salesRep',
        'productionOperator',
        'qualityControl',
        'cashier',
        'inventoryManager',
    ];

    public function handle(Request $request, Closure $next, string ...$roles)
    {
        $user = $request->user();

        $allowed = count($roles) > 0 ? $roles : self::ALL_STAFF;

        if (!$user || !in_array($user->role, $allowed)) {
            return response()->json(['error' => 'Forbidden'], 403);
        }

        return $next($request);
    }
}
