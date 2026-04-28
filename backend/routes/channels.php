<?php

use Illuminate\Support\Facades\Broadcast;

// Private channel per user (for notifications, order updates)
Broadcast::channel('App.Models.User.{id}', function ($user, $id) {
    return (int) $user->id === (int) $id
        || (string) $user->_id === (string) $id;
});

// Private admin channel (for new order alerts, stock alerts)
Broadcast::channel('admin.notifications', function ($user) {
    return in_array($user->role ?? null, ['admin', 'owner']);
});

// Private channel per-user for real-time in-app notifications
Broadcast::channel('user.{userId}', function ($user, $userId) {
    return (string) ($user->_id ?? $user->id) === (string) $userId;
});

// Private channel for a specific conversation
Broadcast::channel('conversation.{conversationId}', function ($user, $conversationId) {
    $conversation = \App\Models\Conversation::find($conversationId);
    if (!$conversation) return false;

    $userId = (string)($user->_id ?? $user->id ?? '');
    $participants = array_map('strval', $conversation->participants ?? []);

    return in_array($userId, $participants, true)
        || in_array($user->role ?? null, ['admin', 'owner']);
});

// Private admin chat channel (for global message broadcasts to all admins)
Broadcast::channel('admin.chat', function ($user) {
    return in_array($user->role ?? null, ['admin', 'owner']);
});

// Presence channel — tracks who is currently online in chat
Broadcast::channel('presence-online', function ($user) {
    return [
        'id'   => (string)($user->_id ?? $user->id),
        'name' => trim(($user->firstName ?? '') . ' ' . ($user->lastName ?? '')),
        'role' => $user->role ?? 'customer',
    ];
});
