<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use App\Http\Controllers\Controller;

class SessionController extends Controller
{
    /**
     * Get all active sessions for the authenticated user.
     */
    public function index(Request $request)
    {
        try {
            $user = $request->user();
            $currentTokenId = $user->currentAccessToken()->id;

            // Only sign-ins that can still get in - the same rule the sign-in check uses (App\Support\SessionRules): its lifetime, and
            // no more than a week unused for staff (a month for customers). The list and the door
            // cannot disagree. Dead rows are deleted as they are found - nothing else clears them.
            $role = $user->role ?? 'customer';
            $idle = \App\Support\SessionRules::idleDays($role);
            [$live, $dead] = $user->tokens()->orderBy('last_used_at', 'desc')->get()
                ->partition(fn ($token) => \App\Support\SessionRules::isLive($token, $role));
            if ($dead->isNotEmpty()) {
                try { $user->tokens()->whereIn('_id', $dead->map(fn ($t) => $t->_id)->all())->delete(); }
                catch (\Throwable $e) { Log::warning('Could not clear ended sessions: ' . $e->getMessage()); }
            }

            $tokens = $live->values()
                ->map(function ($token) use ($currentTokenId, $idle) {
                    $seen = $token->last_used_at ?? $token->created_at;
                    // Whichever comes first: the end of its lifetime, or a week (a month) from last use.
                    $ends = $seen ? $seen->copy()->addDays($idle) : null;
                    $why  = 'idle';
                    if ($token->expires_at && (!$ends || $token->expires_at->lt($ends))) { $ends = $token->expires_at; $why = 'lifetime'; }
                    return [
                        'id'           => $token->id,
                        'name'         => $token->name,
                        'last_used_at' => $token->last_used_at
                            ? $token->last_used_at->format('M d, Y h:i A')
                            : 'Never',
                        'created_at'   => $token->created_at->format('M d, Y'),
                        'ends_at'      => $ends ? $ends->format('M d, Y') : null,
                        // 'idle': using it again pushes the date back. 'lifetime': it ends then regardless.
                        'ends_why'     => $ends ? $why : null,
                        'is_current'   => $token->id === $currentTokenId,
                    ];
                });

            return response()->json([
                'sessions'           => $tokens,
                'current_session_id' => $currentTokenId,
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to load sessions.',
            ], 500);
        }
    }

    /**
     * Revoke a specific session.
     */
    public function destroy(Request $request, $id)
    {
        try {
            $user = $request->user();
            $token = $user->tokens()->find($id);

            if (!$token) {
                return response()->json([
                    'success' => false,
                    'message' => 'Session not found.',
                ], 404);
            }

            $currentTokenId = $user->currentAccessToken()->id;

            if ($token->id === $currentTokenId) {
                return response()->json([
                    'success' => false,
                    'message' => 'Cannot revoke your current session. Use logout instead.',
                ], 400);
            }

            $token->delete();

            Log::info('security.session_revoked', [
                'user_id'          => (string) $user->_id,
                'revoked_token_id' => $id,
                'ip'               => $request->ip(),
            ]);

            return response()->json([
                'success' => true,
                'message' => 'Session revoked.',
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to revoke session.',
            ], 500);
        }
    }

    /**
     * Revoke all sessions except the current one.
     */
    public function destroyOthers(Request $request)
    {
        try {
            $user = $request->user();
            $currentId = $user->currentAccessToken()->id;

            $revokedCount = $user->tokens()->where('id', '!=', $currentId)->count();
            $revoked = $user->tokens()->where('id', '!=', $currentId)->count();
            $user->tokens()->where('id', '!=', $currentId)->delete();

            // Ending somebody else's session is worth a line, whether it was the person
            // protecting themselves or somebody locking them out.
            $this->logActivity($request, 'auth.session_revoked', 'auth', (string) $user->_id,
                'Signed every other device out', ['sessions' => $revoked]);

            Log::info('security.sessions_revoked_all', [
                'user_id'       => (string) $user->_id,
                'revoked_count' => $revokedCount,
                'ip'            => $request->ip(),
            ]);

            return response()->json([
                'success' => true,
                'message' => 'All other sessions revoked.',
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to revoke sessions.',
            ], 500);
        }
    }
}
