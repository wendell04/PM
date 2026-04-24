<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use App\Models\Notification;
use App\Models\User;

class NotificationController extends Controller
{
    /**
     * Resolve authenticated user from bearer token.
     * Returns User model or null.
     */
    private function getAuthUser(Request $request): ?User
    {
        return $request->user();
    }

    /**
     * GET /api/notifications
     * Returns latest 20 notifications for authenticated user,
     * newest first.
     */
    public function index(Request $request)
    {
        $user = $this->getAuthUser($request);
        if (!$user) {
            return response()->json(['success' => false,
                'message' => 'Unauthorized'], 401);
        }

        $userId = (string) ($user->_id ?? $user->id);

        $notifications = Notification::where('user_id', $userId)
            ->orderBy('created_at', 'desc')
            ->limit(20)
            ->get();

        $unreadCount = Notification::where('user_id', $userId)
            ->where('is_read', false)
            ->count();

        return response()->json([
            'success'      => true,
            'notifications' => $notifications,
            'unread_count'  => $unreadCount,
        ]);
    }

    /**
     * PATCH /api/notifications/{id}/read
     * Mark a single notification as read.
     */
    public function markRead(Request $request, string $id)
    {
        $user = $this->getAuthUser($request);
        if (!$user) {
            return response()->json(['success' => false,
                'message' => 'Unauthorized'], 401);
        }

        $userId = (string) ($user->_id ?? $user->id);

        $notification = Notification::where('_id', $id)
            ->where('user_id', $userId)
            ->first();

        if (!$notification) {
            return response()->json(['success' => false,
                'message' => 'Notification not found'], 404);
        }

        $notification->is_read = true;
        $notification->save();

        Cache::forget("notif_unread_{$userId}");

        $unreadCount = Notification::where('user_id', $userId)
            ->where('is_read', false)
            ->count();

        return response()->json([
            'success'      => true,
            'unread_count' => $unreadCount,
        ]);
    }

    /**
     * PATCH /api/notifications/read-all
     * Mark all notifications as read for authenticated user.
     */
    public function markAllRead(Request $request)
    {
        $user = $this->getAuthUser($request);
        if (!$user) {
            return response()->json(['success' => false,
                'message' => 'Unauthorized'], 401);
        }

        $userId = (string) ($user->_id ?? $user->id);

        Notification::where('user_id', $userId)
            ->where('is_read', false)
            ->update(['is_read' => true]);

        Cache::forget("notif_unread_{$userId}");

        return response()->json([
            'success'      => true,
            'unread_count' => 0,
        ]);
    }

    /**
     * GET /api/notifications/unread-count
     * Returns only the unread count. Used for polling.
     */
    public function unreadCount(Request $request)
    {
        $user = $this->getAuthUser($request);
        if (!$user) {
            return response()->json(['success' => false,
                'message' => 'Unauthorized'], 401);
        }

        $userId = (string) ($user->_id ?? $user->id);

        $count = Cache::remember("notif_unread_{$userId}", 30, function () use ($userId) {
            return Notification::where('user_id', $userId)
                ->where('is_read', false)
                ->count();
        });

        return response()->json([
            'success'      => true,
            'unread_count' => $count,
        ]);
    }
}
