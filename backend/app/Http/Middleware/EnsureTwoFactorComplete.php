<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use App\Models\PersonalAccessToken;

/**
 * Enforces two-factor authentication on the server, not just in the UI.
 *
 * When a login still needs a 2FA code, AuthController issues a LIMITED, short-lived token
 * carrying only the `2fa-pending` ability (never `*`). That token is allowed to reach the
 * handful of endpoints needed to finish the challenge, and nothing else. The real full-access
 * token is minted only after the code is verified. Without this gate, a `2fa-pending` token
 * would still pass `auth:sanctum` (which checks validity, not abilities) and the second factor
 * would be enforced by the frontend redirect alone — i.e. bypassable by calling the API directly.
 */
class EnsureTwoFactorComplete
{
    /** Paths a `2fa-pending` token may reach to complete the challenge. */
    protected array $allowed = [
        'api/2fa/send',
        'api/2fa/verify',
        'api/2fa/totp/verify',
        'api/2fa/check-device',
    ];

    public function handle(Request $request, Closure $next)
    {
        $bearer = $request->bearerToken();

        if ($bearer) {
            $token = PersonalAccessToken::findToken($bearer);

            // A token that cannot do `*` is a 2FA-pending token: confine it to the 2FA endpoints.
            if ($token && method_exists($token, 'can') && !$token->can('*')) {
                if (!$request->is(...$this->allowed)) {
                    return response()->json([
                        'success' => false,
                        'message' => 'Two-factor authentication required.',
                    ], 403);
                }
            }
        }

        return $next($request);
    }
}
