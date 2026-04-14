<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;

class IsAdminMiddleware
{
    public function handle(Request $request, Closure $next)
    {
        $user = $request->user();

        $staffRoles = [
            'admin',
            'owner',
            'salesRep',
            'productionOperator',
            'qualityControl',
            'cashier',
            'inventoryManager',
        ];

        if (!$user || !in_array($user->role, $staffRoles)) {
            return response()->json(['error' => 'Forbidden'], 403);
        }

        return $next($request);
    }
}
