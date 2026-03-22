<?php

namespace App\Http\Middleware;

use App\Models\User;
use Closure;
use Illuminate\Http\Request;

class AuthTokenMiddleware
{
    /**
     * Handle an incoming request by validating the Bearer token.
     *
     * @param  \Illuminate\Http\Request  $request
     * @param  \Closure  $next
     * @return \Illuminate\Http\JsonResponse|mixed
     */
    public function handle(Request $request, Closure $next)
    {
        $token = $request->bearerToken();
        
        if (!$token) {
            return response()->json(['error' => 'Unauthenticated'], 401);
        }
        
        $user = User::where('api_token', hash('sha256', $token))->first();
        
        if (!$user) {
            return response()->json(['error' => 'Unauthenticated'], 401);
        }
        
        // Attach user to request for downstream use
        $request->merge(['authUser' => $user]);
        
        return $next($request);
    }
}
