<?php

namespace App\Http\Controllers;

use Illuminate\Support\Facades\Log;
use App\Models\User;

abstract class Controller
{
    /**
     * Checks if the current authenticated user is an admin/owner.
     * 
     * @param \Illuminate\Http\Request $request
     * @return User|false The user object if admin, false otherwise
     */
    protected function isAdmin(\Illuminate\Http\Request $request)
    {
        $token = $request->bearerToken();
        if (!$token) return false;

        $user = User::where('api_token', hash('sha256', $token))->first();
        if (!$user) return false;

        // Owner or Admin roles have full access
        if (in_array($user->role, ['owner', 'admin'])) {
            return $user;
        }

        return false;
    }
}
