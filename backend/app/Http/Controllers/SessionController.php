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

            $tokens = $user->tokens()
                ->orderBy('last_used_at', 'desc')
                ->get()
                ->map(function ($token) use ($currentTokenId) {
                    return [
                        'id'           => $token->id,
                        'name'         => $token->name,
                        'last_used_at' => $token->last_used_at
                            ? $token->last_used_at->format('M d, Y h:i A')
                            : 'Never',
                        'created_at'   => $token->created_at->format('M d, Y'),
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
            $user->tokens()->where('id', '!=', $currentId)->delete();

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
