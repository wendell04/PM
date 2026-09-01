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

// Private channel for one order's live status. OrderStatusUpdated broadcasts here and My Orders
// subscribes, but no rule was ever declared - and an undeclared private channel is refused for
// everyone, so the live status update has never once arrived. Declaring it fixes the silence and
// authorises it in the same stroke: the customer who owns the order, or the shop.
Broadcast::channel('order.{orderId}', function ($user, $orderId) {
    $order = \App\Models\Order::find($orderId);
    if (!$order) return false;

    return (string) ($order->userId ?? '') === (string) ($user->_id ?? $user->id ?? '')
        || in_array($user->role ?? null, ['admin', 'owner'], true);
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
