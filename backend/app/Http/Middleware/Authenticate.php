<?php

namespace App\Http\Middleware;

use Illuminate\Auth\Middleware\Authenticate as Middleware;
use Illuminate\Http\Request;

class Authenticate extends Middleware
{
    /**
     * Redirect unauthenticated users.
     * Return null for API requests so Laravel
     * returns a JSON 401 instead of redirecting
     * to a non-existent login route.
     */
    protected function redirectTo(Request $request): ?string
    {
        return null;
    }
}